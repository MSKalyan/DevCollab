// Stage 3: matcher.
//
// Combines the capability profile with each project's analysis into a ranked,
// explainable fit. This is where "suggested because the words overlap" becomes
// "suggested because this person has the demonstrated skill, the working style
// for this scope of work, and the project will actually accept their PR".
//
// The existing Ranker v1 signals (TF-IDF keyword similarity, skill evidence
// match, friendliness, freshness) are reused via rankerV1's exported helpers, so
// there is one definition of each signal rather than two competing ones.

import {
  buildCorpusIndex,
  profileVector,
  skillMatch,
} from "../../rank/rankerV1.js";
import { analyzeProject } from "./projectAnalyst.js";
import { labelFit } from "./labelAnalyst.js";

// Agent-layer weights. Deliberately different from Ranker v1: capability fit,
// infrastructure fit and label fit carry real weight here because the whole
// point is matching a person to work they can land, not finding similar text.
export const AGENT_WEIGHTS = {
  skillMatch: 0.25,
  capabilityFit: 0.2,
  infrastructureFit: 0.16,
  labelFit: 0.14,
  keywordSimilarity: 0.11,
  friendliness: 0.07,
  freshness: 0.07,
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// Can this person realistically take this work on?
// A newcomer should not be handed an "involved" issue in a huge repo, and an
// expert is wasted on nothing but starter labels — but neither is a hard block,
// just a strong preference, since a motivated newcomer can grow into harder work.
export function capabilityFit(capability, workingStyle, difficulty) {
  const levelRank = { newcomer: 0, intermediate: 1, advanced: 2, expert: 3 };
  const difficultyRank = { starter: 0, moderate: 1, involved: 2, deep: 3 };

  const level = levelRank[capability.level] ?? 1;
  const need = difficultyRank[difficulty.difficulty] ?? 1;
  const gap = need - level;

  // Matched or one step up is ideal: stretching is how people grow.
  let fit = gap === 0 ? 1 : gap === 1 ? 0.8 : gap >= 2 ? 0.25 : gap === -1 ? 0.75 : 0.5;

  // Scope preference from observed working nature: someone whose merged PRs are
  // consistently small is a stronger bet for a small task.
  const style = workingStyle?.preferredScope;
  if (style && difficulty.scope === style) fit = Math.min(1, fit + 0.15);
  else if (style === "small" && difficulty.scope === "large") fit -= 0.25;
  else if (style === "large" && difficulty.scope === "small") fit -= 0.1;

  // Confidence gates the claim: with thin evidence we should not be confident
  // that a "starter" issue is really easy for this person.
  const confidenceAdjusted = fit * (0.6 + 0.4 * clamp01(capability.confidence));
  return Number(clamp01(confidenceAdjusted).toFixed(4));
}

// Does the project's stack overlap with what the person demonstrably uses?
// Weighted by the user's language depth so a strong Python history counts more
// than a stray TypeScript repo.
export function infrastructureFit(capability, project) {
  const userTech = new Map();
  for (const lang of capability.primaryLanguages || []) {
    userTech.set(lang.name, Math.max(userTech.get(lang.name) || 0, lang.weight));
  }
  for (const skill of capability.skills || []) {
    const name = String(skill.skill).toLowerCase();
    userTech.set(name, Math.max(userTech.get(name) || 0, Number(skill.score) || 0));
  }

  if (userTech.size === 0) return { score: 0, matched: [], missing: [] };

  const projectTech = new Set(project.stack.technologies);
  const matched = [];
  let weightSum = 0;
  let weightTotal = 0;

  for (const [tech, weight] of userTech) {
    weightTotal += weight;
    if (projectTech.has(tech)) {
      matched.push(tech);
      weightSum += weight;
    }
  }

  // The project's primary language matters more than a topic keyword match, so
  // a primary hit is given an explicit floor.
  const primaryHit = project.stack.primaryLanguage && userTech.has(project.stack.primaryLanguage);
  const ratio = weightTotal > 0 ? weightSum / weightTotal : 0;
  const score = clamp01(primaryHit ? Math.max(ratio, 0.35) + 0.25 : ratio);

  const missing = [...projectTech]
    .filter((t) => !userTech.has(t))
    .slice(0, 5);

  return { score: Number(score.toFixed(4)), matched, missing, primaryHit: Boolean(primaryHit) };
}

// Rank the corpus for one user. `profile` is the combined capability +
// working-style profile; `issues` and `reposByRepoId` come from the corpus.
// `userLabelProfile` is the label analyst's read of the user's merged-PR labels,
// which drives both the label-fit score and the work-type filter.
export function matchIssues({
  capability,
  workingStyle,
  rankProfile,
  issues,
  reposByRepoId,
  difficultyFilter = null,
  workTypeFilter = null,
  userLabelProfile = null,
  includeNonActionable = false,
}) {
  const index = buildCorpusIndex();
  index.init(issues);
  const vector = profileVector(rankProfile);

  const scored = [];

  for (const issue of issues) {
    const repo = reposByRepoId.get(issue.repository_id) || null;
    const project = analyzeProject(issue, repo);

    if (difficultyFilter && project.difficulty.difficulty !== difficultyFilter) continue;
    if (workTypeFilter && project.labels.primaryWorkType !== workTypeFilter) continue;

    // Labels that mark an issue as closed-off or superseded (duplicate, wontfix,
    // blocked) are never worth a contributor's time, so they leave the pool
    // rather than merely scoring low.
    if (!includeNonActionable && project.labels.hardBlocked) continue;

    const keyword = index.scoreIssue(issue.id, vector);
    const sm = skillMatch(rankProfile, issue);
    const capFit = capabilityFit(capability, workingStyle, project.difficulty);
    const infra = infrastructureFit(capability, project);
    const label = labelFit(userLabelProfile, project.labels, capability);

    const weighted =
      sm.score * AGENT_WEIGHTS.skillMatch +
      capFit * AGENT_WEIGHTS.capabilityFit +
      infra.score * AGENT_WEIGHTS.infrastructureFit +
      label.score * AGENT_WEIGHTS.labelFit +
      keyword * AGENT_WEIGHTS.keywordSimilarity +
      project.friendliness.score * AGENT_WEIGHTS.friendliness +
      project.freshness * AGENT_WEIGHTS.freshness;

    // A genuine skill match should never be buried by the other signals; give
    // strong matches a floor, mirroring Ranker v1's emphasis on evidence. The
    // label confidence multiplier still applies on top, so an untriaged issue
    // cannot ride a skill match to the top of the list.
    const floor = sm.score * 0.55;
    const fitScore = Math.round(
      clamp01(Math.max(weighted, floor >= weighted ? floor * project.labels.confidenceMultiplier : floor)) * 100
    );

    scored.push({
      issue,
      project,
      fitScore,
      signals: {
        skill_match: Number(sm.score.toFixed(4)),
        capability_fit: capFit,
        infrastructure_fit: infra.score,
        label_fit: label.score,
        friendliness: project.friendliness.score,
        freshness: project.freshness,
        keyword_similarity: Number(keyword.toFixed(4)),
      },
      matchedSkills: sm.matchedSkills,
      matchedTechnologies: infra.matched,
      missingTechnologies: infra.missing,
      labelReasons: label.reasons,
    });
  }

  return scored
    .sort((a, b) => b.fitScore - a.fitScore || (a.issue.id || 0) - (b.issue.id || 0))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}
