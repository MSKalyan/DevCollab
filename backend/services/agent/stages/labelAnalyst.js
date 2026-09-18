// Stage 2b: label analyst.
//
// GitHub labels are maintainer-declared intent, which makes them the most
// direct signal available for two different questions:
//
//   1. What kind of work is this issue, and how hard is it? (analyzeIssueLabels)
//   2. What kind of work has this person actually landed before? (analyzeUserLabels)
//
// The second question is the more interesting one. The backfill already stores
// the `labels` of every merged PR in evidence metadata, so the labels a
// contributor has historically had merged onto their work are a direct,
// non-inferred record of the work they are ready for — a user whose merged PRs
// carried `bug` and `good first issue` is a demonstrably different candidate
// from one whose PRs carried `performance` and `breaking change`.
//
// Everything here is deterministic; the LLM may later phrase the result but
// never computes it.

import {
  WORK_TYPE_CATEGORIES,
  MODIFIER_CATEGORIES,
  LEVEL_APPROPRIATENESS,
  ENTRY_WORK_TYPES,
} from "../../../config/labelTaxonomy.js";

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// Normalize a label to a tokenized form: lowercase, every non-alphanumeric run
// collapsed to a single space. This is what makes `kind/bug`, `kind:bug`,
// `c bug` and `Bug` all reachable by one pattern each, and it is why the
// taxonomy does not need a per-repository spelling table.
export function tokensOf(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Dotted/hyphenated qualifiers that indicate difficulty or effort scales,
// e.g. "difficulty: easy", "effort: small", "priority: low".
const DIFFICULTY_QUALIFIER_RE = /(difficulty|effort|level|complexity|priority)\s+(easy|small|low|medium|moderate|high|hard|large|critical|\d)\b/;

function matchesCategory(tokens, patterns) {
  return patterns.some((re) => re.test(tokens));
}

// Classify one issue's labels.
// Returns the primary work type (for ranking/filtering), every matched category
// (for reasons), and a confidence multiplier from modifier labels.
export function analyzeIssueLabels(labels = []) {
  const matched = [];
  let modifierMultiplier = 1;
  const modifiers = [];
  let hardBlocked = false;
  let difficultyHint = null;

  for (const raw of labels) {
    const tokens = tokensOf(raw);

    for (const category of WORK_TYPE_CATEGORIES) {
      if (matchesCategory(tokens, category.patterns)) {
        matched.push({
          id: category.id,
          workType: category.workType,
          label: category.label,
          difficulty: category.difficulty,
          source: String(raw),
        });
        // An explicit difficulty qualifier in the text wins over the category
        // default, since maintainers set it deliberately.
        const qualifier = tokens.match(DIFFICULTY_QUALIFIER_RE);
        if (qualifier && !difficultyHint) {
          difficultyHint = qualifyToDifficulty(qualifier[2]);
        }
      }
    }

    for (const modifier of MODIFIER_CATEGORIES) {
      if (matchesCategory(tokens, modifier.patterns)) {
        modifiers.push({ id: modifier.id, label: modifier.label, source: String(raw) });
        modifierMultiplier *= modifier.confidenceMultiplier;
        if (modifier.severity === "hard") hardBlocked = true;
      }
    }

    // A bare difficulty word with no category context still informs difficulty.
    const bareQualifier = tokens.match(DIFFICULTY_QUALIFIER_RE);
    if (bareQualifier && !difficultyHint) {
      difficultyHint = qualifyToDifficulty(bareQualifier[2]);
    }
  }

  const deduped = dedupeById(matched);
  // "starter" is a modifier in spirit: it says "set aside for newcomers", and a
  // more specific work type (bug, docs, tests) is more informative as primary.
  const primary =
    deduped.find((m) => m.id !== "starter") || deduped[0] || null;

  return {
    primaryWorkType: primary?.workType || null,
    primaryLabel: primary?.label || null,
    categories: deduped,
    modifiers: dedupeById(modifiers),
    difficultyHint,
    // Maintainer mods that make an issue a poor suggestion (triage/closed-off).
    confidenceMultiplier: Number(clamp01(modifierMultiplier).toFixed(4)),
    hardBlocked,
    hasStarterLabel: deduped.some((m) => m.id === "starter"),
    // Human-readable intent, used directly in recommendation reasons.
    declaredIntent: deduped.map((m) => m.label),
  };
}

function qualifyToDifficulty(word) {
  switch (word) {
    case "easy": case "small": case "low": case "1": case "trivial": return "starter";
    case "medium": case "moderate": return "moderate";
    case "high": case "hard": case "large": return "involved";
    case "critical": return "deep";
    default: return null;
  }
}

function dedupeById(items) {
  const seen = new Map();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

// Learn the work types a user has demonstrably landed, from the labels attached
// to their MERGED_PR evidence. A merged PR carried a label because a maintainer
// accepted that characterisation of the work, which is why this is treated as
// demonstrated rather than aspirational.
export function analyzeUserLabels(events = []) {
  const perType = new Map();
  let prsWithLabels = 0;
  let totalPrs = 0;

  for (const event of events) {
    if (event.event_type !== "MERGED_PR") continue;
    totalPrs += 1;

    const labels = event.metadata?.labels;
    if (!Array.isArray(labels) || labels.length === 0) continue;
    prsWithLabels += 1;

    const { categories, hasStarterLabel } = analyzeIssueLabels(labels);
    for (const category of categories) {
      const entry = perType.get(category.workType) || {
        workType: category.workType,
        label: category.label,
        merged_pr_count: 0,
        last_merged_at: null,
      };
      entry.merged_pr_count += 1;
      const when = event.occurred_at ? new Date(event.occurred_at) : null;
      if (when && !Number.isNaN(when.getTime())) {
        if (!entry.last_merged_at || when > new Date(entry.last_merged_at)) {
          entry.last_merged_at = when.toISOString();
        }
      }
      perType.set(category.workType, entry);
    }

    // Track newcomer-friendly work separately: it is the clearest evidence that
    // someone is still working at the entry level, and it is not a work type.
    if (hasStarterLabel) {
      const entry = perType.get("starter") || {
        workType: "starter",
        label: "Newcomer-friendly",
        merged_pr_count: 0,
        last_merged_at: null,
      };
      entry.merged_pr_count += 1;
      perType.set("starter", entry);
    }
  }

  const max = Math.max(1, ...[...perType.values()].map((v) => v.merged_pr_count));
  const workTypes = [...perType.values()]
    .map((entry) => ({
      ...entry,
      // Share of the user's labelled work, and a normalized strength so the
      // matcher can weigh a dominant work type above an incidental one.
      share: Number((entry.merged_pr_count / Math.max(1, prsWithLabels)).toFixed(4)),
      strength: Number((entry.merged_pr_count / max).toFixed(4)),
    }))
    .sort((a, b) => b.merged_pr_count - a.merged_pr_count);

  return {
    workTypes,
    // How much label data backs this read. Low coverage means the label signal
    // is weak, and the analyst should say so rather than overclaim.
    labeled_pr_count: prsWithLabels,
    total_pr_count: totalPrs,
    coverage: Number((prsWithLabels / Math.max(1, totalPrs)).toFixed(4)),
    isEmpty: workTypes.length === 0,
  };
}

// Does this issue's label profile suit this person's demonstrated history?
// Returns a 0..1 score plus the reasons behind it, so the recommendation can
// explain *why* the work type fits.
export function labelFit(userLabelProfile, issueLabelProfile, capability) {
  const level = capability?.level || "newcomer";
  const appropriateness = LEVEL_APPROPRIATENESS[level] || LEVEL_APPROPRIATENESS.newcomer;

  // Baseline: how well the label-implied difficulty suits this capability.
  const hintedDifficulty = issueLabelProfile.difficultyHint;
  let score = 0.5;
  if (hintedDifficulty) {
    score = appropriateness[hintedDifficulty] ?? 0.5;
  } else if (issueLabelProfile.primaryWorkType) {
    const entry = WORK_TYPE_CATEGORIES.find((c) => c.workType === issueLabelProfile.primaryWorkType);
    score = entry ? appropriateness[entry.difficulty] ?? 0.5 : 0.5;
  }

  const reasons = [];

  // Demonstrated history: if the user has had this same kind of work merged
  // before, that is the strongest positive signal in this stage.
  const demonstrated = userLabelProfile?.workTypes?.find(
    (w) => w.workType === issueLabelProfile.primaryWorkType
  );
  if (demonstrated && issueLabelProfile.primaryWorkType) {
    score = Math.min(1, score + 0.3 * demonstrated.strength);
    reasons.push({
      kind: "demonstrated",
      workType: demonstrated.workType,
      detail: `${demonstrated.merged_pr_count} merged PR${demonstrated.merged_pr_count === 1 ? "" : "s"} labelled ${
        demonstrated.label
      }`,
    });
  }

  // Newcomer with no history should be pointed at entry-level work.
  if (!userLabelProfile || userLabelProfile.isEmpty) {
    if (issueLabelProfile.hasStarterLabel) {
      score = Math.min(1, score + 0.25);
      reasons.push({ kind: "entry", detail: "Maintainers set this aside for new contributors" });
    }
    if (!ENTRY_WORK_TYPES.includes(issueLabelProfile.primaryWorkType)) {
      score = Math.max(0, score - 0.2);
      reasons.push({
        kind: "stretch",
        detail: "No open-source history to match this work type against yet",
      });
    }
  } else if (ENTRY_WORK_TYPES.includes(issueLabelProfile.primaryWorkType) && level !== "newcomer") {
    // Senior users are not well served by an all-starter feed.
    score = Math.max(0, score - 0.15);
  }

  // Untriaged or closed-off issues are poor suggestions regardless of fit.
  if (issueLabelProfile.confidenceMultiplier < 1) {
    score *= issueLabelProfile.confidenceMultiplier;
  }

  return { score: Number(clamp01(score).toFixed(4)), reasons };
}

// Labels worth prioritizing for this user: work types they have landed before,
// ordered by how much of their history they represent. Drives the UI's label
// filter chips and gives the LLM a concrete focus.
export function preferredWorkTypes(userLabelProfile, capability, limit = 4) {
  if (userLabelProfile?.isEmpty && capability) {
    return ENTRY_WORK_TYPES.slice(0, limit);
  }
  return (userLabelProfile?.workTypes || []).slice(0, limit).map((w) => w.workType);
}
