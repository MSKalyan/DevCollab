// Stage 2: project analysis.
//
// Answers "what is this project, and what would it take to contribute here?"
// for each issue under consideration. This is the infrastructure half of the
// match: the stack a repo is built on, how accessible it is to an outsider, and
// how large a change the issue is likely to demand.
//
// Reuses the existing friendliness and freshness signal functions so the agent
// and the deterministic ranker share one definition of "active repository" and
// "recent issue" rather than drifting into two conventions.

import { calculateRepositoryFriendliness } from "../../rank/friendliness.js";
import { issueFreshness } from "../../rank/freshness.js";
import { SCOPE_BY_REPO_SIZE } from "../../../config/domains.js";
import { analyzeIssueLabels } from "./labelAnalyst.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Stack for a repository, derived from collected metadata. `languages` is a
// byte-count map from GitHub, so it is normalized to shares.
export function analyzeStack(repo) {
  const languages = repo?.languages && typeof repo.languages === "object" ? repo.languages : {};
  const entries = Object.entries(languages)
    .map(([name, bytes]) => ({ name: name.toLowerCase(), bytes: toInt(bytes) }))
    .filter((l) => l.bytes > 0);

  const total = entries.reduce((a, l) => a + l.bytes, 0);
  const shares = entries
    .map((l) => ({ name: l.name, share: total > 0 ? Number((l.bytes / total).toFixed(4)) : 0 }))
    .sort((a, b) => b.share - a.share);

  const topics = Array.isArray(repo?.topics) ? repo.topics.map((t) => String(t).toLowerCase()) : [];
  const primary = (repo?.primary_language || shares[0]?.name || "").toLowerCase();

  return {
    primaryLanguage: primary || null,
    languages: shares.slice(0, 8),
    topics,
    // Technology names the matcher can compare against the user's skills: the
    // language names plus topic keywords (topics often name frameworks, e.g.
    // "react", "django", "kubernetes").
    technologies: [...new Set([primary, ...shares.map((s) => s.name), ...topics].filter(Boolean))],
    stars: toInt(repo?.stars),
    forks: toInt(repo?.forks),
    openIssues: toInt(repo?.open_issues_count),
  };
}

// Label classification lives in the label analyst; this is a thin re-export so
// existing callers keep working while there is one implementation, not two.
export { analyzeIssueLabels as analyzeLabels };

// Estimate how large a change this issue implies, and how hard it looks.
// Deliberately conservative: an issue with no strong signal is "moderate",
// because recommending only labelled-good-first-issues would miss most of the
// corpus and recommending everything as easy would be dishonest.
export function analyzeIssueDifficulty(issue, stack) {
  const label = analyzeIssueLabels(issue.labels || []);
  const bodyLength = String(issue.body || "").length;
  const comments = toInt(issue.comments_count);
  const ageDays = issue.created_at
    ? Math.max(0, (Date.now() - new Date(issue.created_at).getTime()) / DAY_MS)
    : 0;

  const stars = stack?.stars || 0;
  const ageDaysRounded = Math.round(ageDays);

  // A maintainer's explicit newcomer label is the strongest signal available and
  // beats every heuristic below — they know what they consider approachable.
  // A contradicting design/hard label makes it ambiguous, in which case the
  // heuristics decide. Repo size still feeds `scope` and capability fit.
  const contradicted = label.categories.some(
    (c) => c.difficulty === "deep" || c.difficulty === "involved"
  );
  if (label.hasStarterLabel && !contradicted) {
    return {
      score: 0.2,
      difficulty: "starter",
      scope: "small",
      ageDays: ageDaysRounded,
      comments,
      reason: "labelled newcomer-friendly by maintainers",
      intent: label.declaredIntent,
    };
  }

  let score = 0.5; // neutral baseline

  if (label.hasStarterLabel) score -= 0.3;

  // A work-type label carries its own difficulty implication, which is more
  // informative than a generic "complex" marker.
  if (label.difficultyHint) {
    score += { starter: -0.25, moderate: 0, involved: 0.15, deep: 0.3 }[label.difficultyHint];
  } else {
    const primary = label.categories.find((c) => c.id !== "starter");
    if (primary) {
      score += { starter: -0.2, moderate: 0, involved: 0.12, deep: 0.25 }[primary.difficulty];
    }
  }

  // A long, detailed body usually means a designed change with a clear spec;
  // a very short body often means the opposite. Neither is decisive alone.
  if (bodyLength > 2000) score += 0.1;
  else if (bodyLength > 0 && bodyLength < 120) score += 0.05;

  // Heavy discussion means the problem is contested or subtle.
  if (comments >= 15) score += 0.15;
  else if (comments >= 6) score += 0.05;

  // An old, still-open issue is often harder than it looks.
  if (ageDays > 540) score += 0.1;

  // Large repos enforce more process (reviews, CI, design docs) regardless of
  // the issue itself.
  if (stars > 20000) score += 0.1;
  else if (stars > 0 && stars < 300) score -= 0.05;

  score = Math.max(0, Math.min(1, score));

  const difficulty =
    score < 0.3 ? "starter"
      : score < 0.55 ? "moderate"
        : score < 0.75 ? "involved"
          : "deep";

  const scope = estimateScope({
    starters: label.hasStarterLabel,
    complex: contradicted,
    stars,
    bodyLength,
  });

  return {
    score: Number(score.toFixed(4)),
    difficulty,
    scope,
    ageDays: ageDaysRounded,
    comments,
    intent: label.declaredIntent,
  };
}

function estimateScope({ starters, complex, stars, bodyLength }) {
  // Starter-labelled work is small by definition, regardless of repo size.
  if (starters) return "small";
  if (complex) return "large";
  if (bodyLength > 3000) return "medium";
  const tiers = SCOPE_BY_REPO_SIZE.find((t) => stars <= t.maxStars);
  return tiers ? tiers.scope : "medium";
}

// Full project analysis for one (issue, repo) pair.
export function analyzeProject(issue, repo) {
  const stack = analyzeStack(repo);
  const labels = analyzeIssueLabels(issue.labels || []);
  const difficulty = analyzeIssueDifficulty(issue, stack);
  const friendliness = repo
    ? calculateRepositoryFriendliness(repo)
    : { score: 0, signals: {} };
  const freshness = issueFreshness(issue);

  return {
    repository: issue.repo_full_name || repo?.full_name || null,
    repository_url: repo?.html_url || null,
    stack,
    labels,
    difficulty,
    friendliness,
    freshness,
    // How open this project is to an outside contributor. Starter labels and an
    // active maintainer presence are the two strongest observable signals.
    accessibility: Number(
      Math.min(
        1,
        0.45 * friendliness.score +
          0.35 * (difficulty.difficulty === "starter" ? 1 : difficulty.difficulty === "moderate" ? 0.6 : 0.25) +
          0.2 * Math.min(1, (stack.openIssues || 0) / 100)
      ).toFixed(4)
    ),
    externalContributorSignal: {
      // Large open-issue counts alongside high stars mean the project accepts
      // outside work at scale; a tiny closed repo rarely merges drive-by PRs.
      open_issues: stack.openIssues,
      stars: stack.stars,
      accepts_outside_work: stack.openIssues >= 10 && stack.stars >= 50,
    },
  };
}
