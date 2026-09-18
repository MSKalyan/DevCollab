// Contribution agent orchestration.
//
// The agent answers "where can this person actually contribute?" by running four
// stages over two inputs:
//
//   evidence_events ─► capability          ─┐
//                   ─► working style       ─┼─► matcher ─► explainer ─► result
//   github_issues   ─► project analysis    ─┘
//
// Stages are pure functions in ./stages and independently testable. The LLM is
// an optional enrichment layer (see utils/llm.js): every stage produces a
// complete, useful result with no model configured, and a model failure can only
// affect wording, never scores.

import { getGithubAccountWithToken } from "../../models/githubAccountModel.js";
import { listEvidenceForAccount } from "../../models/evidenceModel.js";
import { listSkillsForAccount } from "../../models/skillEvidenceModel.js";
import { listEligibleIssues } from "../../models/githubIssueModel.js";
import { findCuratedRepositoryById } from "../../models/curatedRepositoryModel.js";
import {
  findContributionProfile,
  upsertContributionProfile,
} from "../../models/contributionProfileModel.js";
import { buildUserProfile } from "../rank/evidenceProfile.js";
import { analyzeCapability } from "./stages/capabilityAnalyst.js";
import { analyzeWorkingStyle, summarizeExperience } from "./stages/workingStyleAnalyst.js";
import { matchIssues } from "./stages/matcher.js";
import {
  explainRecommendations,
  deterministicNarrative,
  enrichWithLlm,
} from "./stages/explainer.js";
import { analyzeUserLabels, preferredWorkTypes } from "./stages/labelAnalyst.js";

// A bounded corpus keeps a single request predictable. The matcher is O(issues)
// and each issue triggers a project analysis, so this is the main cost control.
const MAX_CORPUS = parseInt(process.env.CONTRIBUTION_AGENT_MAX_CORPUS || "400", 10);

// Fingerprint the evidence so a cached analysis is reused only while the
// underlying facts are unchanged. Counting rows and taking the newest timestamp
// is cheap and sensitive to every kind of evidence change we care about.
export function evidenceVersion(events) {
  const newest = events.reduce((acc, e) => {
    const t = e.occurred_at ? new Date(e.occurred_at).getTime() : 0;
    return Number.isFinite(t) && t > acc ? t : acc;
  }, 0);
  return `${events.length}-${newest}`;
}

async function repositoriesByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const repos = await Promise.all(unique.map((id) => findCuratedRepositoryById(id)));
  const map = new Map();
  for (const repo of repos) if (repo) map.set(repo.id, repo);
  return map;
}

// Analyze a connected account: capability + working style + experience, cached
// against the evidence version. Returns null when there is no evidence to read.
export async function analyzeUser(accountId, { events: givenEvents, skills: givenSkills } = {}) {
  const events = givenEvents || (await listEvidenceForAccount(accountId));
  if (events.length === 0) return null;

  const skills = givenSkills || (await listSkillsForAccount(accountId));
  const capability = analyzeCapability(events, skills);
  const workingStyle = analyzeWorkingStyle(events);
  const experience = summarizeExperience(capability);
  // What kind of work has this person had merged before? Read from the labels
  // maintainers attached to their merged PRs.
  const labelProfile = analyzeUserLabels(events);

  return { events, skills, capability, workingStyle, experience, labelProfile };
}

// Build recommendations for a user. `applyLlm` is explicit so tests and the
// cached path never make a network call by accident.
export async function recommendContributions(userId, {
  limit = 10,
  offset = 0,
  language = null,
  label = null,
  repository = null,
  difficulty = null,
  workType = null,
  applyLlm = true,
} = {}) {
  const account = await getGithubAccountWithToken(userId);
  if (!account) {
    return { connected: false, profile: null, recommendations: [], total: 0 };
  }

  const analysis = await analyzeUser(account.id);
  if (!analysis) {
    return {
      connected: true,
      backfill_status: account.backfill_status,
      reason: "no_evidence",
      profile: null,
      recommendations: [],
      total: 0,
    };
  }
  const { capability, workingStyle, experience, skills, events, labelProfile } = analysis;
  const version = evidenceVersion(events);

  // Reuse a cached narrative when the evidence has not moved (avoids paying for
  // an identical LLM call on every page view).
  let cached = await findContributionProfile(account.id, version);
  let narrative = cached?.narrative || null;
  let generatedBy = cached?.generated_by || "deterministic";
  let refinements = new Map();

  const issues = await listEligibleIssues({ language, label, repository, limit: MAX_CORPUS });
  if (issues.length === 0) {
    return {
      connected: true,
      backfill_status: account.backfill_status,
      profile: buildProfilePayload({ capability, workingStyle, experience, labelProfile, narrative, generatedBy }),
      recommendations: [],
      total: 0,
      filters: { language, label, repository, difficulty, work_type: workType },
    };
  }

  const reposByRepoId = await repositoriesByIds(issues.map((i) => i.repository_id));
  const rankProfile = await buildUserProfile(account.id);

  const matched = matchIssues({
    capability,
    workingStyle,
    rankProfile,
    issues,
    reposByRepoId,
    difficultyFilter: difficulty,
    workTypeFilter: workType,
    userLabelProfile: labelProfile,
  });

  const total = matched.length;
  const page = matched.slice(offset, offset + Math.max(1, Math.min(limit, 50)));
  let explained = explainRecommendations(page, { capability, workingStyle });

  if (applyLlm) {
    const enriched = await enrichWithLlm({
      capability,
      workingStyle,
      experience,
      labelProfile,
      recommendations: explained,
    });
    // Adopt LLM wording only where the model returned something usable.
    if (enriched.refinements?.size) {
      explained = explained.map((rec) => {
        const refined = enriched.refinements.get(rec.title);
        return refined ? { ...rec, why: refined } : rec;
      });
    }
    if (!narrative || narrative !== enriched.narrative) {
      narrative = enriched.narrative;
      // "llm" only when the model actually produced the text; a disabled or
      // failing model reports the deterministic origin honestly.
      generatedBy = enriched.generated_by === "llm" ? "llm" : generatedBy;
      await upsertContributionProfile(account.id, {
        evidenceVersion: version,
        capability,
        workingStyle,
        experience,
        narrative,
        generatedBy,
      });
    }
  } else if (!narrative) {
    narrative = deterministicNarrative({ capability, workingStyle, experience });
    await upsertContributionProfile(account.id, {
      evidenceVersion: version,
      capability,
      workingStyle,
      experience,
      narrative,
      generatedBy,
    });
  }

  return {
    connected: true,
    backfill_status: account.backfill_status,
    profile: buildProfilePayload({ capability, workingStyle, experience, labelProfile, narrative, generatedBy }),
    recommendations: explained,
    total,
    filters: { language, label, repository, difficulty, work_type: workType },
  };
}

function buildProfilePayload({ capability, workingStyle, experience, labelProfile, narrative, generatedBy }) {
  return {
    capability,
    workingStyle,
    experience,
    // The user's demonstrated label history: which work types maintainers have
    // actually merged from them, plus the work types worth prioritizing.
    labels: {
      ...labelProfile,
      preferred_work_types: preferredWorkTypes(labelProfile, capability),
    },
    narrative: narrative || null,
    generated_by: generatedBy || "deterministic",
  };
}
