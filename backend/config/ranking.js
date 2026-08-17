// Phase 2 ranking configuration — every weight is isolated here and overridable
// via environment variables so the baseline can be tuned without code edits.
//
// Baseline model (NOT scientifically validated — initial deterministic only):
//   fit_score = 0.45 keyword_similarity
//             + 0.30 skill_evidence_match
//             + 0.15 repository_friendliness
//             + 0.10 freshness

function envFloat(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const RANKING_WEIGHTS = {
  keywordSimilarity: envFloat("RANKING_KEYWORD_WEIGHT", 0.45),
  skillEvidence: envFloat("RANKING_SKILL_WEIGHT", 0.3),
  repositoryFriendliness: envFloat("RANKING_FRIENDLINESS_WEIGHT", 0.15),
  freshness: envFloat("RANKING_FRESHNESS_WEIGHT", 0.1),
};

export const FRIENDLINESS_WEIGHTS = {
  recentActivity: envFloat("FRIENDLINESS_RECENT_ACTIVITY_WEIGHT", 0.3),
  contributorActivity: envFloat("FRIENDLINESS_CONTRIBUTOR_ACTIVITY_WEIGHT", 0.25),
  prActivity: envFloat("FRIENDLINESS_PR_ACTIVITY_WEIGHT", 0.25),
  issueActivity: envFloat("FRIENDLINESS_ISSUE_ACTIVITY_WEIGHT", 0.2),
};

// Decay windows (in days). An event that long ago contributes half its signal.
export const FRIENDLINESS_HALF_LIFE_DAYS = 120;
export const FRESHNESS_HALF_LIFE_DAYS = 60;

// Behavior controls for the issue collector / sync jobs.
export const COLLECTOR = {
  maxPages: parseInt(process.env.ISSUE_COLLECTOR_MAX_PAGES || "10", 10),
  // Number of circulation leaders (repos whose issues we treat as highest
  // priority) — reserved for future use; disabled repos are always skipped.
  perPage: parseInt(process.env.ISSUE_COLLECTOR_PER_PAGE || "100", 10),
  // Recent window (days) used to decide which issues must be refreshed even if
  // the incremental `since` query misses them.
  refetchWindowDays: parseInt(process.env.ISSUE_REFETCH_WINDOW_DAYS || "14", 10),
};

// Normalization factors (used by friendliness signal extraction).
export const FRIENDLINESS_NORMALIZATION = {
  // Star/forks counts are log-scaled; these denominators cap the signal.
  starsAt: envFloat("FRIENDLINESS_STARS_AT", 2000),
  forksAt: envFloat("FRIENDLINESS_FORKS_AT", 500),
  openIssuesAt: envFloat("FRIENDLINESS_OPEN_ISSUES_AT", 300),
};

export function validateWeights() {
  const weights = Object.values(RANKING_WEIGHTS);
  const offBy = Math.abs(weights.reduce((a, b) => a + b, 0) - 1);
  if (offBy > 0.001) {
    throw new Error(`Ranking weights must sum to 1 (got ${weights.reduce((a, b) => a + b, 0)})`);
  }
  return true;
}

export function getRankingWeights() {
  validateWeights();
  return RANKING_WEIGHTS;
}