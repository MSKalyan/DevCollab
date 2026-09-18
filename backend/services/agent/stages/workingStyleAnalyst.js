// Stage 1b: working-style analysis.
//
// Where the capability analyst answers "what can this person do", this answers
// "how do they work": whether they write code or review it, whether they work in
// tests/docs/tooling or product code, whether they pick up small surgical tasks
// or large sweeping ones, and whether their activity is steady or bursty.
//
// Deterministic from evidence alone. The LLM enriches the label/summary later.

import { pathKind } from "../../../config/domains.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function saturate(value, at) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number((1 - Math.exp(-value / at)).toFixed(4));
}

// Aggregate the kinds of files the user's merged PRs touched. Only PRs whose
// file list was captured contribute; the rest are simply unknown.
function fileKindProfile(prs) {
  const counts = new Map();
  let filesSeen = 0;
  let prsWithPaths = 0;

  for (const pr of prs) {
    const paths = pr.metadata?.file_paths;
    if (!Array.isArray(paths) || paths.length === 0) continue;
    prsWithPaths += 1;
    for (const p of paths) {
      const kind = pathKind(p);
      counts.set(kind, (counts.get(kind) || 0) + 1);
      filesSeen += 1;
    }
  }

  if (filesSeen === 0) return { shares: {}, prsWithPaths: 0, filesSeen: 0 };

  const shares = {};
  for (const [kind, count] of counts) {
    shares[kind] = Number((count / filesSeen).toFixed(4));
  }
  return { shares, prsWithPaths, filesSeen };
}

// How many distinct repositories a PR touches across — narrow focus vs. broad.
function repoSpread(prs) {
  const names = new Set(prs.map((p) => p.repo_full_name).filter(Boolean));
  return names.size;
}

// Consecutive-day streaks, used to separate steady contributors from bursty ones.
function burstiness(events) {
  const days = [
    ...new Set(
      events
        .map((e) => (e.occurred_at ? new Date(e.occurred_at) : null))
        .filter((d) => d && !Number.isNaN(d.getTime()))
        .map((d) => d.toISOString().slice(0, 10))
    ),
  ].sort();

  if (days.length < 3) return { cadence: "occasional", longestStreak: days.length, activeDays: days.length };

  let longest = 1;
  let current = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${days[i]}T00:00:00Z`).getTime();
    if (Math.round((cur - prev) / DAY_MS) === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  // A long unbroken streak means deliberate, sustained work; a handful of
  // scattered days means opportunistic contributions.
  const cadence = longest >= 5 ? "steady" : longest >= 2 ? "bursty" : "occasional";
  return { cadence, longestStreak: longest, activeDays: days.length };
}

function preferredScope(prs) {
  const samples = [];
  for (const pr of prs) {
    const meta = pr.metadata || {};
    const additions = toInt(meta.additions);
    const deletions = toInt(meta.deletions);
    const changed = toInt(meta.changed_files);
    const total = additions + deletions;
    if (total > 0) {
      samples.push({ total, changed });
    }
  }

  if (samples.length === 0) {
    // Without diff data, PR count is the only hint available.
    return prs.length >= 10 ? "medium" : "small";
  }

  const sorted = [...samples].map((s) => s.total).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const medianFiles = (() => {
    const files = samples.map((s) => s.changed).filter((c) => c > 0).sort((a, b) => a - b);
    return files.length ? files[Math.floor(files.length / 2)] : 0;
  })();

  // Both axes matter: 800 lines across one file is a deep focused change, while
  // 800 lines across 40 files is broad. Take the larger signal.
  if (median <= 80 && medianFiles <= 4) return "small";
  if (median <= 400 && medianFiles <= 15) return "medium";
  return "large";
}

// Traits are the explainable units of working nature — each carries the raw
// numbers that produced it so a reader can check the claim.
function buildTraits({ prs, reviews, kinds, spread, cadence, prSize }) {
  const traits = [];
  const reviewToPr = prs.length > 0 ? reviews.length / prs.length : reviews.length > 0 ? 2 : 0;

  if (reviews.length >= 3 && reviewToPr >= 0.5) {
    traits.push({
      trait: "review-heavy",
      score: Number(saturate(reviewToPr, 1.2).toFixed(4)),
      evidence: `${reviews.length} reviews against ${prs.length} merged PRs`,
    });
  }
  if (prs.length >= Math.max(3, reviews.length * 2)) {
    traits.push({
      trait: "code-first",
      score: Number(saturate(prs.length, 10).toFixed(4)),
      evidence: `${prs.length} merged PRs with ${reviews.length} reviews`,
    });
  }
  if ((kinds.shares.tests || 0) >= 0.2) {
    traits.push({
      trait: "tests-included",
      score: Number(((kinds.shares.tests || 0) / 0.5).toFixed(4)),
      evidence: `${Math.round((kinds.shares.tests || 0) * 100)}% of changed files are tests`,
    });
  }
  const docsShare = kinds.shares.docs || 0;
  if (docsShare >= 0.25) {
    traits.push({
      trait: "documentation-minded",
      score: Number((docsShare / 0.6).toFixed(4)),
      evidence: `${Math.round(docsShare * 100)}% of changed files are docs`,
    });
  }
  const infraShare = (kinds.shares.infrastructure || 0) + (kinds.shares.ci || 0);
  if (infraShare >= 0.15) {
    traits.push({
      trait: "infrastructure-aware",
      score: Number((infraShare / 0.4).toFixed(4)),
      evidence: `${Math.round(infraShare * 100)}% of changed files are CI/infrastructure`,
    });
  }
  if (spread >= 5) {
    traits.push({
      trait: "broad-contributor",
      score: Number(saturate(spread, 8).toFixed(4)),
      evidence: `merged PRs across ${spread} repositories`,
    });
  }
  if (spread > 0 && spread <= 2 && prs.length >= 4) {
    traits.push({
      trait: "deep-focus",
      score: Number(saturate(prs.length, 10).toFixed(4)),
      evidence: `${prs.length} merged PRs concentrated in ${spread} repositor${spread === 1 ? "y" : "ies"}`,
    });
  }
  if (cadence.cadence === "steady") {
    traits.push({
      trait: "consistent-cadence",
      score: Number(saturate(cadence.longestStreak, 8).toFixed(4)),
      evidence: `longest active streak of ${cadence.longestStreak} days`,
    });
  }
  if (prSize.samples > 0 && prSize.median <= 60 && prs.length >= 3) {
    traits.push({
      trait: "small-surgical-changes",
      score: Number((1 - saturate(prSize.median, 200)).toFixed(4)),
      evidence: `median change of ${prSize.median} lines`,
    });
  }

  return traits.sort((a, b) => b.score - a.score);
}

// Archetype is derived from the traits, not asserted independently, so the label
// always follows from the data.
function deriveArchetype(traits, { prs, reviews, kinds }) {
  const has = (t) => traits.some((x) => x.trait === t);
  const reviewHeavy = reviews.length >= 3 && reviews.length >= prs.length * 0.5;

  if (reviewHeavy && reviews.length > prs.length) {
    return { archetype: "reviewer-maintainer", label: "Reviewer & maintainer" };
  }
  if (has("documentation-minded") && (kinds.shares.docs || 0) >= 0.4) {
    return { archetype: "documentation-contributor", label: "Documentation contributor" };
  }
  if (has("infrastructure-aware")) {
    return { archetype: "infrastructure-contributor", label: "Infrastructure contributor" };
  }
  if (has("broad-contributor")) {
    return { archetype: "explorer", label: "Broad explorer" };
  }
  if (has("deep-focus") && prs.length >= 5) {
    return { archetype: "focused-contributor", label: "Focused contributor" };
  }
  if (prs.length === 0 && reviews.length === 0) {
    return { archetype: "observer", label: "Owns repositories, no contributions yet" };
  }
  return { archetype: "journeyer", label: "Active contributor" };
}

function buildSummary(archetype, { prs, reviews, kinds, cadence, scope, topKind }) {
  const parts = [];
  parts.push(
    prs.length > 0
      ? `${prs.length} merged pull request${prs.length === 1 ? "" : "s"}`
      : "no merged pull requests yet"
  );
  if (reviews.length > 0) parts.push(`${reviews.length} review${reviews.length === 1 ? "" : "s"}`);
  const lead = `Works primarily through ${parts.join(" and ")}`;

  const focus = topKind && topKind !== "product"
    ? ` with notable emphasis on ${topKind}`
    : "";
  const tempo = cadence.cadence === "steady"
    ? "on a consistent, sustained cadence"
    : cadence.cadence === "bursty"
      ? "in bursts of concentrated activity"
      : "opportunistically";
  const sizing = scope === "small"
    ? "favours small, surgical changes"
    : scope === "large"
      ? "takes on large, wide-reaching changes"
      : "works at a moderate change size";

  return `${lead}${focus}, ${tempo}, and ${sizing}.`;
}

export function analyzeWorkingStyle(events = []) {
  const prs = events.filter((e) => e.event_type === "MERGED_PR");
  const reviews = events.filter((e) => e.event_type === "PR_REVIEW");
  const kinds = fileKindProfile(prs);
  const spread = repoSpread(prs);
  const cadence = burstiness(events);
  const scope = preferredScope(prs);

  const prSize = (() => {
    const sizes = [];
    for (const pr of prs) {
      const meta = pr.metadata || {};
      const total = toInt(meta.additions) + toInt(meta.deletions);
      if (total > 0) sizes.push(total);
    }
    sizes.sort((a, b) => a - b);
    return {
      samples: sizes.length,
      median: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0,
    };
  })();

  const traits = buildTraits({ prs, reviews, kinds, spread, cadence, prSize });
  const { archetype, label } = deriveArchetype(traits, { prs, reviews, kinds });

  const topKind = Object.entries(kinds.shares).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    archetype,
    label,
    summary: buildSummary(archetype, { prs, reviews, kinds, cadence, scope, topKind }),
    traits,
    preferredScope: scope,
    cadence: cadence.cadence,
    focus: kinds.shares,
    repos_contributed_to: spread,
    longest_streak_days: cadence.longestStreak,
  };
}

// Experience is the flat numeric summary the UI shows as stat tiles.
export function summarizeExperience(capability) {
  const t = capability.totals || {};
  return {
    merged_prs: t.merged_prs || 0,
    reviews: t.reviews || 0,
    repositories: t.repositories || 0,
    commits: t.commits || 0,
    active_days: t.active_days || 0,
    span_days: t.span_days || 0,
    avg_pr_size: t.avg_pr_size || 0,
    facts: t.facts || 0,
  };
}
