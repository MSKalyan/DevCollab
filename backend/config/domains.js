// Domain knowledge for the contribution agent.
//
// These maps let the agent reason about *kind of work* rather than only words:
// which technologies constitute a backend vs. frontend stack, which directories
// in a repository indicate infrastructure vs. docs, and which issue labels
// signal a well-scoped starter task. Everything here is data, not logic, so it
// can be extended without touching the agent stages.

// Technology -> domain. Superset of the skill lexicon in services/skills.
export const SKILL_DOMAINS = {
  python: "backend", javascript: "frontend", typescript: "frontend",
  java: "backend", go: "backend", rust: "systems", cpp: "systems",
  c: "systems", csharp: "backend", php: "backend", ruby: "backend",
  swift: "mobile", kotlin: "mobile", scala: "backend", dart: "mobile",
  "objective-c": "mobile", haskell: "systems", shell: "infrastructure",
  html: "frontend", css: "frontend", react: "frontend", nextjs: "frontend",
  vue: "frontend", angular: "frontend", svelte: "frontend",
  "react-native": "mobile", flutter: "mobile", tailwind: "frontend",
  nodejs: "backend", express: "backend", django: "backend", flask: "backend",
  fastapi: "backend", springboot: "backend", rails: "backend",
  laravel: "backend", "asp.net": "backend",
  postgresql: "data", mysql: "data", mongodb: "data", redis: "data",
  sqlite: "data", sqlserver: "data", cassandra: "data", prisma: "data",
  supabase: "data", firebase: "data",
  docker: "infrastructure", kubernetes: "infrastructure",
  terraform: "infrastructure", aws: "infrastructure", gcp: "infrastructure",
  azure: "infrastructure", linux: "infrastructure", git: "tooling",
  graphql: "backend", godot: "gaming", unity: "gaming",
  "game-dev": "gaming",
};

// Path fragments that indicate what part of a codebase a change touched.
// Used to infer whether a contributor works in product code, tests, docs,
// build tooling, or CI — a strong signal of working nature.
export const PATH_KINDS = [
  { kind: "tests", patterns: [/\btest(s)?\//i, /\.test\./i, /\.spec\./i, /\btests?\.py$/i, /_test\.go$/i] },
  { kind: "docs", patterns: [/\bdocs?\//i, /\.mdx?$/i, /\brst$/i, /\badoc$/i, /readme/i, /changelog/i] },
  { kind: "ci", patterns: [/\.github\/workflows\//i, /\.gitlab-ci/i, /\.circleci\//i, /jenkinsfile/i, /\.travis\.yml$/i] },
  { kind: "infrastructure", patterns: [/dockerfile/i, /docker-compose/i, /\.tf$/i, /\bk8s\b/i, /helm\//i, /terraform\//i, /\.github\/actions\//i] },
  { kind: "dependencies", patterns: [/package-lock\.json$/i, /yarn\.lock$/i, /poetry\.lock$/i, /requirements.*\.txt$/i, /\.lock$/i, /go\.sum$/i, /cargo\.lock$/i] },
  { kind: "config", patterns: [/\.ya?ml$/i, /\.toml$/i, /\.ini$/i, /\.env/i, /\.json$/i] },
  { kind: "styling", patterns: [/\.css$/i, /\.scss$/i, /\.sass$/i, /\.less$/i] },
];

// Labels that mark work a newcomer can pick up, and labels that indicate
// complexity. Normalized comparison is done by the caller.
export const STARTER_LABELS = [
  "good first issue", "good first issue candidate", "first timers only",
  "beginner", "beginner friendly", "easy", "starter", "documentation",
  "help wanted", "low hanging fruit", "e-easy", "difficulty: easy",
  "effort: small",
];

export const COMPLEX_LABELS = [
  "epic", "design", "rfc", "proposal", "architecture", "breaking change",
  "needs design", "discussion", "hard", "difficulty: hard", "complex",
  "meta", "tracking", "research", "performance", "security",
];

// Suggested scope for a PR touching a starter issue, by repository size.
// Large repos need smaller, more surgical first contributions to get merged.
export const SCOPE_BY_REPO_SIZE = [
  { maxStars: 200, scope: "medium" },
  { maxStars: 5000, scope: "small" },
  { maxStars: Infinity, scope: "small" },
];

export function domainOf(skill) {
  return SKILL_DOMAINS[String(skill || "").toLowerCase()] || "other";
}

// Classify one changed file path into a coarse kind.
export function pathKind(filePath) {
  const p = String(filePath || "");
  for (const { kind, patterns } of PATH_KINDS) {
    if (patterns.some((re) => re.test(p))) return kind;
  }
  return "product";
}
