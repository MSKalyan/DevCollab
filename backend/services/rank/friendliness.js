// Deterministic repository friendliness. NOT ML — weighed, explainable signals
// from data already stored in curated_repositories. Weight config is isolated
// in config/ranking.js so the baseline can be tuned without touching logic.

import {
  FRIENDLINESS_WEIGHTS,
  FRIENDLINESS_HALF_LIFE_DAYS,
  FRIENDLINESS_NORMALIZATION,
} from "../../config/ranking.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Exponential decay to a 0..1 signal: age/2 every halfLife days.
function recencySignal(timestamp, halfLifeDays = FRIENDLINESS_HALF_LIFE_DAYS, now = new Date()) {
  if (!timestamp) return 0; // unknown activity == no signal
  const ageDays = Math.max(0, (now.getTime() - new Date(timestamp).getTime()) / DAY_MS);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function bounded01(value, at) {
  if (!at || at <= 0) return 0;
  return Math.max(0, Math.min(1, value / at));
}

/**
 * Compute friendliness for a curated repository (which carries the GitHub
 * metadata we collected). Each signal is 0..1; the result is a weighed 0..1.
 */
export function calculateRepositoryFriendliness(repo, { now = new Date() } = {}) {
  if (!repo) return 0;

  // Signals:
  //  recent_activity      — last push recency (decay)
  //  contributor_activity — stars (community trust in the maintainers)
  //  pr_activity          — forks partly correlate with PR inflow
  //  issue_activity       — open issue volume (a maintainer working on issues)
  const recentActivity = recencySignal(repo.last_pushed_at, FRIENDLINESS_HALF_LIFE_DAYS, now);
  const contributorActivity = bounded01(Number(repo.stars || 0), FRIENDLINESS_NORMALIZATION.starsAt);
  const prActivity = bounded01(Number(repo.forks || 0), FRIENDLINESS_NORMALIZATION.forksAt);
  const issueActivity = bounded01(Number(repo.open_issues_count || 0), FRIENDLINESS_NORMALIZATION.openIssuesAt);

  const score =
    recentActivity * FRIENDLINESS_WEIGHTS.recentActivity +
    contributorActivity * FRIENDLINESS_WEIGHTS.contributorActivity +
    prActivity * FRIENDLINESS_WEIGHTS.prActivity +
    issueActivity * FRIENDLINESS_WEIGHTS.issueActivity;

  return {
    score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
    signals: {
      recent_activity: Number(recentActivity.toFixed(4)),
      contributor_activity: Number(contributorActivity.toFixed(4)),
      pr_activity: Number(prActivity.toFixed(4)),
      issue_activity: Number(issueActivity.toFixed(4)),
    },
    weights: { ...FRIENDLINESS_WEIGHTS },
  };
}

// Explanatory prose for a friendliness component.
export function friendlinessExplanation(f) {
  if (!f || f.score === 0) return "Repository has limited recent activity";
  let primary = "recent_activity";
  let best = f.signals.recent_activity;
  for (const [k, v] of Object.entries(f.signals)) {
    if (k !== "recent_activity" && v * f.weights[k] > best * f.weights[primary]) {
      primary = k;
      best = v;
    }
  }
  const label = primary.replace(/_/g, " ");
  const threshold = f.score >= 0.6 ? "good recent activity" : "moderate activity";
  return `Repository shows ${threshold} (strongest signal: ${label})`;
}