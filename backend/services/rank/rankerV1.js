// Ranker v1: deterministic baseline combining
//   keyword similarity (TF-IDF cosine) + skill evidence match +
//   repository friendliness + issue freshness → explainable fit_score.
// NO embeddings/LLM. Weights are configurable in config/ranking.js.

import { RANKING_WEIGHTS } from "../../config/ranking.js";
import {
  buildTfVectors,
  buildIdf,
  cosineSimilarity,
} from "./tfidf.js";
import { issueFreshness } from "./freshness.js";
import { calculateRepositoryFriendliness } from "./friendliness.js";

// Build the issue's textual representation (title + body + labels + repo text).
export function issueText(issue) {
  const parts = [
    issue.title,
    issue.body,
    (issue.labels || []).join(" "),
    issue.repo_topics?.join(" "),
    issue.repo_language,
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ");
}

// Full corpus: every eligible issue, as documents for TF-IDF.
export function buildIssueCorpus(issues) {
  return issues.map((issue) => ({ id: issue.id, text: issueText(issue) }));
}

// Precompute corpus TF-IDF once per request (not per issue). Returns the
// vectors keyed by issue id plus the profile matcher closure.
export function buildCorpusIndex() {
  const started = Date.now();
  const cache = {
    builtAt: started,
    docs: [],
    issueVectors: new Map(),
    idf: new Map(),
    vocab: new Set(),
  };
  return {
    // (re)initialize the index with a set of issues.
    init(issues) {
      const docs = buildIssueCorpus(issues);
      const tf = buildTfVectors(docs);
      const idf = buildIdf(tf, tf.vocab);
      cache.docs = docs;
      cache.vocab = tf.vocab;
      cache.idf = idf;
      cache.issueVectors = new Map();
      for (const d of tf.docs) {
        const weighted = new Map();
        for (const [term, value] of d.tf) {
          const w = value * (idf.get(term) || 0);
          if (w > 0) weighted.set(term, w);
        }
        cache.issueVectors.set(d.id, weighted);
      }
    },
    corpusSize() {
      return cache.docs.length;
    },
    // Cosine similarity between an issue vector and a term-weighted profile.
    scoreIssue(issueId, profileVector) {
      const vec = cache.issueVectors.get(issueId);
      if (!vec || !profileVector) return 0;
      return cosineSimilarity(vec, profileVector);
    },
  };
}

// Build the profile vector (term → weight) from a user's evidence profile.
export function profileVector(profile) {
  const vector = new Map();
  for (const s of profile.skills) {
    // weight by evidence score, and repeat for multi-word skills
    const weight = Math.max(s.score || 0, 0.01);
    vector.set(s.skill.toLowerCase(), weight);
    for (const bit of s.skill.split(/[\s_/-]+/)) {
      const b = bit.toLowerCase();
      if (b.length >= 2) {
        vector.set(b, Math.max(vector.get(b) || 0, weight));
      }
    }
  }
  return vector;
}

// Skill evidence match: which of the user's demonstrated skills appear in the
// issue (via its text/labels/repo), weighted by evidence score/strength.
export function skillMatch(profile, issue) {
  const text = issueText(issue).toLowerCase();
  const matched = [];
  let weight = 0;
  for (const s of profile.skills) {
    const skill = s.skill.toLowerCase();
    const inTitleBody = text.includes(skill);
    const bitPresent = skill
      .split(/[\s_/-]+/)
      .some((bit) => bit.length >= 3 && text.includes(bit));
    if (inTitleBody || bitPresent) {
      // Strong evidence (many merged PRs) counts more than a single repo.
      const strengthPenalty = s.merged_pr_count >= 2 ? 1 : s.merged_pr_count === 1 ? 0.8 : 0.5;
      const score = Math.max(s.score || 0, 0.01) * strengthPenalty;
      matched.push({ skill: s.skill, score });
      weight += score;
    }
  }
  // normalize against total demonstrated evidence
  const totalEvidence =
    profile.skills.reduce((a, s) => a + Math.max(s.score || 0, 0.01), 0) || 1;
  return {
    score: Number(Math.min(1, weight / totalEvidence).toFixed(4)),
    matchedSkills: matched.sort((a, b) => b.score - a.score).map((m) => m.skill),
    weights: matched,
  };
}

// Assemble the full recommendation for one issue.
export function rankIssue(issue, repo, profile, ctx) {
  const keyword = ctx.index.scoreIssue(issue.id, ctx.profileVector);
  const sm = skillMatch(profile, issue);
  const friendliness = repo
    ? calculateRepositoryFriendliness(repo)
    : { score: 0, signals: {} };
  const freshness = issueFreshness(issue);

  const weighted =
    keyword * RANKING_WEIGHTS.keywordSimilarity +
    sm.score * RANKING_WEIGHTS.skillEvidence +
    friendliness.score * RANKING_WEIGHTS.repositoryFriendliness +
    freshness * RANKING_WEIGHTS.freshness;

  const fitScore = Math.round(weighted * 100);

  const why = buildExplanations({
    keyword,
    skillMatch: sm,
    friendliness,
    freshness,
    issue,
  });

  return {
    issue_id: issue.id,
    github_issue_id: issue.github_issue_id,
    repository: issue.repo_full_name,
    number: issue.issue_number,
    title: issue.title,
    html_url: issue.html_url,
    state: issue.state,
    labels: issue.labels,
    repo_language: issue.repo_language,
    matched_skills: sm.matchedSkills,
    fit_score: fitScore,
    skill_match_score: sm.score,
    keyword_similarity_score: keyword,
    repository_friendliness_score: friendliness.score,
    freshness_score: freshness,
    why,
  };
}

// Deterministic, traceable explanations to each scoring component.
function buildExplanations({ keyword, skillMatch, friendliness, freshness, issue }) {
  const why = [];
  if (skillMatch.matchedSkills.length > 0) {
    const strongest = skillMatch.weights[0];
    const extra = issueFreshness(issue) >= 0.6 ? " and recent" : "";
    if (strongest) {
      why.push(`Strong ${strongest.skill} evidence (${Math.round(strongest.score * 100)}% match${extra})`);
    }
    for (const m of skillMatch.matchedSkills.slice(1, 2)) {
      why.push(`Also matches your ${m.skill} experience`);
    }
  }
  if (keyword >= 0.35) {
    why.push(`Issue keywords align with your demonstrated stack (${(keyword * 100).toFixed(0)}% similarity)`);
  }
  if (friendliness.score >= 0.5) {
    why.push("Repository is active with good maintainer signals");
  }
  return why.length ? why : ["Issue is eligible but minimal overlap with your profile"];
}

export function createRanker(issues, reposByRepoId, profile) {
  const index = buildCorpusIndex();
  index.init(issues);
  const pv = profileVector(profile);
  return {
    index,
    profileVector: pv,
    repoOf(issue) {
      return reposByRepoId.get(issue.repository_id) || null;
    },
  };
}

export function rankCorpus(issues, reposByRepoId, profile) {
  const index = buildCorpusIndex();
  index.init(issues);
  const pv = profileVector(profile);
  const ctx = { index, profileVector: pv };

  const scored = issues.map((issue) => {
    const repo = reposByRepoId.get(issue.repository_id) || null;
    return rankIssue(issue, repo, profile, ctx);
  });

  return scored
    .sort((a, b) => b.fit_score - a.fit_score)
    .map((rec, i) => ({ ...rec, rank: i + 1 }));
}