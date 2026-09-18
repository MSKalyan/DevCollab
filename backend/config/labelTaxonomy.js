// Label taxonomy for the contribution agent's label analyst.
//
// GitHub labels are the maintainers' own declaration of what a piece of work
// is. They are the strongest single signal available for "what kind of work is
// this?", but the vocabulary is wildly inconsistent across repositories —
// observed in the wild: `bug`, `kind/bug`, `kind:bug`, `c bug`,
// `bug/1 unconfirmed`, `failed test`, `flaky test`, `needs triage`.
//
// So matching is done on a tokenized form (see labelAnalyst.tokensOf), where
// every non-alphanumeric character becomes a space. That collapses
// `kind/bug`, `kind:bug` and `c bug` onto the same shape without a per-label
// spelling table.
//
// Data only — no logic here, so the taxonomy can be extended without touching
// the analyst.

// Work-type categories. `difficulty` is what the label alone implies about how
// hard the work is; the analyst blends it with body/discussion heuristics.
// Ordered broadly from most to least specific for primary-category selection.
export const WORK_TYPE_CATEGORIES = [
  {
    id: "security",
    workType: "security",
    label: "Security",
    difficulty: "involved",
    description: "Vulnerabilities, CVEs, and hardening",
    patterns: [/\bsecurity\b/, /\bvulnerabilit/, /\bcve\b/, /\bexploit\b/, /\bsanitiz/, /\bescape\b/],
  },
  {
    id: "performance",
    workType: "performance",
    label: "Performance",
    difficulty: "involved",
    description: "Speed, memory, and optimisation work",
    patterns: [/\bperformance\b/, /\bperf\b/, /\boptimi[sz]/, /\bslow\b/, /\bmemory leak\b/, /\blatency\b/],
  },
  {
    id: "design",
    workType: "design",
    label: "Design & planning",
    difficulty: "deep",
    description: "RFCs, proposals, and architectural decisions",
    patterns: [/\brfc\b/, /\bdesign\b/, /\bproposal\b/, /\barchitecture\b/, /\bdiscussion\b/, /\bepic\b/, /\bspec\b/, /\bresearch\b/],
  },
  {
    id: "refactor",
    workType: "refactor",
    label: "Refactor",
    difficulty: "involved",
    description: "Internal cleanup without behaviour change",
    patterns: [/\brefactor/, /\bcleanup\b/, /\bclean up\b/, /\btech debt\b/, /\btechnical debt\b/, /\bmaintenance\b/, /\bcode quality\b/, /\bdeprecat/],
  },
  {
    id: "feature",
    workType: "feature",
    label: "Feature",
    difficulty: "involved",
    description: "New capability or enhancement",
    patterns: [/\benhancement\b/, /\bfeature\b/, /\bimprovement\b/, /\bnew capability\b/],
  },
  {
    id: "bug",
    workType: "bug-fix",
    label: "Bug fix",
    difficulty: "moderate",
    description: "Defect, regression, or crash to fix",
    // Deliberately narrow: bare "error"/"fix"/"wrong" would misfire on area
    // labels such as Next.js's "error overlay".
    patterns: [/\bbug\b/, /\bdefect\b/, /\bregression\b/, /\bcrash\b/, /\bbroken\b/, /\bmisbehav/],
  },
  {
    id: "infrastructure",
    workType: "infrastructure",
    label: "Infrastructure",
    difficulty: "moderate",
    description: "CI, build, packaging, and deployment",
    patterns: [/\bci\b/, /\bbuild\b/, /\bdeploy/, /\bdocker\b/, /\binfra/, /\bworkflow/, /\bpackaging\b/, /\brelease\b/],
  },
  {
    id: "tests",
    workType: "testing",
    label: "Testing",
    difficulty: "moderate",
    description: "Test coverage, flaky and failing tests",
    patterns: [/\btests?\b/, /\btesting\b/, /\bflaky\b/, /\bcoverage\b/, /\bunit test/, /\bfailing test/, /\bfailed test/, /\be2e\b/],
  },
  {
    id: "documentation",
    workType: "documentation",
    label: "Documentation",
    difficulty: "starter",
    description: "Docs, guides, and typo fixes",
    patterns: [/\bdocs?\b/, /\bdocumentation\b/, /\btypo\b/, /\breadme\b/, /\bchangelog\b/, /\bguide\b/],
  },
  {
    id: "dependencies",
    workType: "maintenance",
    label: "Dependencies",
    difficulty: "starter",
    description: "Dependency bumps and housekeeping",
    patterns: [/\bdependenc/, /\bdeps\b/, /\brenovate\b/, /\bdependabot\b/, /\bbump\b/],
  },
  {
    id: "starter",
    workType: "starter",
    label: "Newcomer-friendly",
    difficulty: "starter",
    description: "Explicitly set aside for new contributors",
    patterns: [
      /\bgood first issue\b/, /\bfirst timers? only\b/, /\bbeginner\b/, /\bnewcomer\b/,
      /\bhelp wanted\b/, /\bup for grabs\b/, /\beasy\b/, /\blow hanging fruit\b/,
      /\bstarter\b/, /difficulty (easy|1)/, /effort (small|1)/, /\btrivial\b/,
    ],
  },
];

// Modifier categories. These do not describe a kind of work, so they never
// become the primary work type. They adjust confidence and can disqualify an
// issue entirely.
export const MODIFIER_CATEGORIES = [
  {
    // An unvalidated or unfinished issue is a poor recommendation: it may be
    // incomplete, already claimed, or not actually accepted as a task.
    id: "triage",
    label: "Needs triage",
    // Multiplies confidence: maintainers have not yet vetted this.
    confidenceMultiplier: 0.55,
    severity: "soft",
    patterns: [
      /\btriage\b/, /\bunconfirmed\b/, /\bneeds team\b/, /\bneeds info\b/,
      /\bneeds reproduction\b/, /\buntriaged\b/, /\bneeds detail/, /\bnot reproduced\b/,
    ],
  },
  {
    // Explicitly closed-off work. Recommending these wastes the user's time.
    id: "non_actionable",
    label: "Not actionable",
    confidenceMultiplier: 0.1,
    severity: "hard",
    patterns: [
      /\bwontfix\b/, /\bwon t fix\b/, /\bduplicate\b/, /\binvalid\b/, /\bstale\b/,
      /\bblocked\b/, /\bon hold\b/, /\bdo not merge\b/, /\bno longer relevant\b/,
    ],
  },
];

// How appropriate each difficulty is for a capability level. Used by the
// label analyst to judge whether a work type suits someone's experience.
// Higher = a better use of that person's time.
export const LEVEL_APPROPRIATENESS = {
  newcomer: { starter: 1, moderate: 0.6, involved: 0.25, deep: 0.1 },
  intermediate: { starter: 0.75, moderate: 1, involved: 0.7, deep: 0.3 },
  advanced: { starter: 0.45, moderate: 0.85, involved: 1, deep: 0.75 },
  expert: { starter: 0.3, moderate: 0.65, involved: 0.9, deep: 1 },
};

// Work types that suit someone with no open-source history yet.
export const ENTRY_WORK_TYPES = ["starter", "documentation", "maintenance"];

export function workTypeById(id) {
  return WORK_TYPE_CATEGORIES.find((c) => c.id === id) || null;
}

export function listWorkTypes() {
  return WORK_TYPE_CATEGORIES.map(({ id, workType, label, description }) => ({
    id,
    workType,
    label,
    description,
  }));
}
