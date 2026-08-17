// Freshness score for an issue: how recently it was updated relative to now.
// Only one component of the fit score — never overrides relevance.

import { FRESHNESS_HALF_LIFE_DAYS } from "../../config/ranking.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function recencyDecay(ageMs) {
  const days = Math.max(0, ageMs / DAY_MS);
  return Math.pow(0.5, days / FRESHNESS_HALF_LIFE_DAYS);
}

// 0..1; ~1.0 for issues touched today, decaying each FRESHNESS_HALF_LIFE_DAYS.
export function issueFreshness(issue, { now = new Date() } = {}) {
  if (!issue || !issue.updated_at) return 0.5; // unknown — neutral
  const when = new Date(issue.updated_at).getTime();
  if (!Number.isFinite(when)) return 0.5;
  return Number(Math.max(0, Math.min(1, recencyDecay(now.getTime() - when))).toFixed(4));
}

export function freshnessExplanation(freshness, ageDays) {
  if (freshness >= 0.8) return "Issue was recently updated";
  if (freshness >= 0.5) return "Issue has moderate recency";
  return "Issue is aging and may need attention";
}