// Phase 2 recommendation service: orchestration for GET /api/recommendations.
// Loads the user's evidence profile + the issue corpus, runs Ranker v1, applies
// filters, and returns explainable recommendations.

import { getGithubAccountWithToken } from "../models/githubAccountModel.js";
import { listEligibleIssues, countEligibleIssues } from "../models/githubIssueModel.js";
import { findCuratedRepositoryById } from "../models/curatedRepositoryModel.js";
import { buildUserProfile } from "./rank/evidenceProfile.js";
import { rankCorpus } from "./rank/rankerV1.js";
import { getCache, setCache } from "../utils/cache.js";

// Load repositories for a set of issue repo ids (deduped).
async function repositoriesByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const repos = await Promise.all(unique.map((id) => findCuratedRepositoryById(id)));
  const map = new Map();
  for (const repo of repos) if (repo) map.set(repo.id, repo);
  return map;
}

const CACHE_TTL_SECONDS = parseInt(process.env.RECOMMENDATIONS_CACHE_TTL || "300", 10);

// Build recommendations for a connected GitHub user.
// Filters applied via models.listEligibleIssues; ranking computed fresh.
export async function recommendForUser(userId, {
  limit = 10,
  offset = 0,
  language = null,
  label = null,
  repository = null,
  minScore = 0,
  cacheKey = null,
} = {}) {
  const account = await getGithubAccountWithToken(userId);
  if (!account) {
    return { connected: false, recommendations: [] };
  }

  const parseLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
  const parseOffset = Math.max(0, parseInt(offset, 10) || 0);
  const parseMinScore = Math.max(0, Math.min(parseInt(minScore, 10) || 0, 100));

  const profile = await buildUserProfile(account.id);
  if (profile.isEmpty) {
    return {
      connected: true,
      backfill_status: account.backfill_status,
      recommendations: [],
      total: 0,
      reason: "NO_EVIDENCE",
    };
  }

  // Narrow the corpus by filters before ranking (cheaper + still correct).
  const issues = await listEligibleIssues({ language, label, repository });
  if (issues.length === 0) {
    return { connected: true, backfill_status: account.backfill_status, recommendations: [], total: 0 };
  }

  const repoIds = issues.map((i) => i.repository_id);
  const reposByRepoId = await repositoriesByIds(repoIds);

  // Rank the full (filtered) corpus then slice — pagination happens post-sort.
  const ranked = rankCorpus(issues, reposByRepoId, profile);

  const filtered =
    parseMinScore > 0 ? ranked.filter((r) => r.fit_score >= parseMinScore) : ranked;

  const total = filtered.length;
  const page = filtered.slice(parseOffset, parseOffset + parseLimit);

  // Lightweight cache (optional, on by default) keyed by user+params — but the
  // corpus may drift between syncs, so TTL is short.
  if (cacheKey) {
    await setCache(cacheKey, {
      total,
      recommendations: page,
      generated_at: new Date().toISOString(),
    }, CACHE_TTL_SECONDS);
  }

  return {
    connected: true,
    backfill_status: account.backfill_status,
    recommendations: page,
    total,
  };
}

export async function getRecommendationCount(userId, {
  language = null,
  label = null,
  repository = null,
} = {}) {
  const account = await getGithubAccountWithToken(userId);
  if (!account) return 0;
  return countEligibleIssues({ language, label, repository });
}

export { getCache };