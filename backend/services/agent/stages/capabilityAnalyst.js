// Stage 1a: capability analysis.
//
// Turns raw evidence events into a normalized picture of what a person can
// actually do: how deep their language experience runs, how much code they
// move, whether they can review, how broad their domain exposure is, how
// consistent their cadence is, and how much they collaborate.
//
// Every dimension is computed from counts already present in evidence_events,
// so the result is deterministic and reproducible. The LLM (stage 1c) only ever
// adds prose on top of these numbers — it never invents a score.

import { domainOf } from "../../../config/domains.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Saturating curve: 0 at 0, asymptotically 1. `at` is the value that yields ~0.63.
// Preferred over a hard division because capability does not scale linearly with
// raw counts — the 50th merged PR does not mean as much as the 5th.
function saturate(value, at) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number((1 - Math.exp(-value / at)).toFixed(4));
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mergedPrs(events) {
  return events.filter((e) => e.event_type === "MERGED_PR");
}

function reviews(events) {
  return events.filter((e) => e.event_type === "PR_REVIEW");
}

function repos(events) {
  return events.filter((e) => e.event_type === "CONTRIBUTED_REPOSITORY");
}

// Languages the user actually wrote code in, weighted by merged-PR volume in
// that language. Repository languages alone over-credit a user who merely owns
// a repo; merged PRs are the evidence that they shipped in it.
function languageWeights(events) {
  const weights = new Map();
  let total = 0;

  for (const pr of mergedPrs(events)) {
    const lang = (pr.language || "").toLowerCase();
    if (!lang) continue;
    weights.set(lang, (weights.get(lang) || 0) + 1);
    total += 1;
  }

  // A repository with no merged PR still shows exposure, just weaker.
  for (const repo of repos(events)) {
    const meta = repo.metadata || {};
    const langs = Array.isArray(meta.languages) && meta.languages.length
      ? meta.languages
      : [repo.language].filter(Boolean);
    for (const raw of langs) {
      const lang = String(raw).toLowerCase();
      if (!lang) continue;
      weights.set(lang, (weights.get(lang) || 0) + 0.35);
      total += 0.35;
    }
  }

  if (total === 0) return [];
  return [...weights.entries()]
    .map(([name, w]) => ({ name, weight: Number((w / total).toFixed(4)), count: w }))
    .sort((a, b) => b.weight - a.weight);
}

function skillStrengths(skills) {
  // "strong" requires more than one merged PR — a single PR is real evidence but
  // is not yet a pattern.
  return skills.map((s) => ({
    skill: s.skill,
    score: Number(Number(s.score || 0).toFixed(4)),
    strength:
      s.merged_pr_count >= 3 ? "strong"
        : s.merged_pr_count >= 1 ? "moderate"
          : Number(s.evidence_count || 0) >= 2 ? "moderate"
            : "emerging",
    merged_pr_count: toInt(s.merged_pr_count),
    review_count: toInt(s.review_count),
    repository_count: toInt(s.repository_count),
  }));
}

// Active days = distinct calendar days with at least one event. Span = distance
// from earliest to latest event. The ratio distinguishes a steady contributor
// from someone who did everything in one weekend.
function cadenceStats(events) {
  const days = new Set();
  let earliest = null;
  let latest = null;

  for (const e of events) {
    const when = e.occurred_at ? new Date(e.occurred_at) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    days.add(when.toISOString().slice(0, 10));
    if (!earliest || when < earliest) earliest = when;
    if (!latest || when > latest) latest = when;
  }

  const spanDays = earliest && latest
    ? Math.max(1, Math.round((latest - earliest) / DAY_MS))
    : 0;

  return {
    activeDays: days.size,
    spanDays,
    // Days-with-activity as a share of the active window.
    consistency: spanDays > 0 ? Number(Math.min(1, days.size / spanDays).toFixed(4)) : 0,
  };
}

function averagePrSize(prEvents) {
  const sizes = [];
  for (const pr of prEvents) {
    const meta = pr.metadata || {};
    const additions = toInt(meta.additions);
    const deletions = toInt(meta.deletions);
    const total = additions + deletions;
    if (total > 0) sizes.push(total);
  }
  if (sizes.length === 0) return { avg: 0, median: 0, samples: 0 };
  const sorted = [...sizes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    avg: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    median: sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid],
    samples: sizes.length,
  };
}

// Build the capability profile.
// `skills` comes from skill_evidence (already recency-decayed by Phase 1);
// `events` from evidence_events.
export function analyzeCapability(events = [], skills = []) {
  const prs = mergedPrs(events);
  const reviewEvents = reviews(events);
  const repoEvents = repos(events);
  const languages = languageWeights(events);
  const cadence = cadenceStats(events);
  const prSize = averagePrSize(prs);

  const totalFacts = events.length;
  // Repositories the user actually touched: owned/contributed repos plus any
  // repo they landed a merged PR or review in.
  const distinctRepos = new Set(
    [...repoEvents, ...prs, ...reviewEvents].map((e) => e.repo_full_name).filter(Boolean)
  ).size;

  // Depth: strongest single language, plus the fact that several languages are
  // in play. Someone with one deeply-used language is not the same as someone
  // with five shallow ones, so both terms matter.
  const topShare = languages[0]?.weight || 0;
  const languageDepth = Number(
    Math.min(1, 0.65 * saturate(prs.length, 8) * (0.5 + 0.5 * topShare) + 0.35 * topShare)
      .toFixed(4)
  );

  // Volume: how much code the person actually moves, using diff size where the
  // enrichment captured it and falling back to PR count when it did not.
  const volumeFromSize = saturate(prSize.avg, 600);
  const volumeFromCount = saturate(prs.length, 15);
  const codeVolume = Number(
    (prSize.samples > 0 ? 0.6 * volumeFromSize + 0.4 * volumeFromCount : volumeFromCount)
      .toFixed(4)
  );

  // Review capability is independent of writing code — a reviewer's evidence is
  // a different axis entirely.
  const reviewCapability = Number(
    (0.7 * saturate(reviewEvents.length, 10) + 0.3 * saturate(reviewEvents.length / Math.max(1, prs.length), 1.5))
      .toFixed(4)
  );

  const domains = [...new Set(skills.map((s) => domainOf(s.skill)).filter((d) => d !== "other"))];
  const breadth = Number(saturate(new Set([...languages.map((l) => l.name), ...domains]).size, 6).toFixed(4));

  const collaboration = Number(
    Math.min(1, 0.5 * saturate(distinctRepos, 6) + 0.5 * saturate(reviewEvents.length, 8)).toFixed(4)
  );

  const consistency = cadence.consistency;

  const dimensions = {
    languageDepth,
    codeVolume,
    reviewCapability,
    breadth,
    consistency: cadence.consistency,
    collaboration,
  };

  // Capability is dominated by demonstrated language depth and volume; review
  // and collaboration are secondary but real. Weights sum to 1.
  const score = Number(
    (
      0.3 * languageDepth +
      0.25 * codeVolume +
      0.15 * reviewCapability +
      0.1 * breadth +
      0.1 * consistency +
      0.1 * collaboration
    ).toFixed(4)
  );

  // Confidence reflects how much evidence backs the numbers, not how good the
  // developer is: 60 facts is a much firmer read than 3.
  const confidence = Number(saturate(totalFacts, 25).toFixed(4));

  return {
    level: capabilityLevel(score, confidence),
    score,
    confidence,
    dimensions,
    primaryLanguages: languages.slice(0, 6),
    skills: skillStrengths(skills),
    domains,
    totals: {
      merged_prs: prs.length,
      reviews: reviewEvents.length,
      repositories: distinctRepos,
      commits: events.filter((e) => e.event_type === "COMMIT").length,
      active_days: cadence.activeDays,
      span_days: cadence.spanDays,
      avg_pr_size: prSize.avg,
      median_pr_size: prSize.median,
      facts: totalFacts,
    },
  };
}

// A high score on three data points is not "expert". Requiring confidence for
// the upper tiers prevents a brand-new account from being labelled advanced.
export function capabilityLevel(score, confidence) {
  if (confidence < 0.35) return score >= 0.5 ? "intermediate" : "newcomer";
  if (score >= 0.75) return "expert";
  if (score >= 0.55) return "advanced";
  if (score >= 0.3) return "intermediate";
  return "newcomer";
}
