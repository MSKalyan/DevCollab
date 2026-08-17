// Deterministic skill extraction. Maps observable evidence (repo languages,
// topics, file extensions, PR text) to a fixed set of skill identifiers.
// Deliberately rule-based for a reliable baseline; Phase 2 may replace this
// with embeddings+LLM extraction.

// Each entry: canonical skill id + aliases matched case-insensitively.
const LEXICON = {
  // Languages
  python: { aliases: ["python", "py"] },
  javascript: { aliases: ["javascript", "js", "node", "node.js", "es6", "ecmascript"] },
  typescript: { aliases: ["typescript", "ts"] },
  java: { aliases: ["java"] },
  go: { aliases: ["golang", "go"] },
  rust: { aliases: ["rust"] },
  cpp: { aliases: ["c++", "cpp", "cplusplus"] },
  c: { aliases: [] }, // matched via LANGUAGE_TO_SKILL to avoid substring false hits
  csharp: { aliases: ["c#", "csharp"] },
  php: { aliases: ["php"] },
  ruby: { aliases: ["ruby"] },
  swift: { aliases: ["swift"] },
  kotlin: { aliases: ["kotlin"] },
  scala: { aliases: ["scala"] },
  dart: { aliases: ["dart"] },
  "objective-c": { aliases: ["objective-c", "objectivec"] },
  haskell: { aliases: ["haskell"] },
  shell: { aliases: ["shell", "bash", "zsh", "powershell"] },
  html: { aliases: ["html", "html5"] },
  css: { aliases: ["css", "css3", "scss", "sass"] },
  // Frameworks
  react: { aliases: ["react", "reactjs", "next.js"] },
  nextjs: { aliases: ["next.js", "nextjs"] },
  nodejs: { aliases: ["node.js", "nodejs", "express", "express.js", "nestjs"] },
  express: { aliases: ["express", "express.js", "nestjs"] },
  django: { aliases: ["django"] },
  flask: { aliases: ["flask"] },
  fastapi: { aliases: ["fastapi"] },
  vue: { aliases: ["vue", "vue.js", "vuejs"] },
  angular: { aliases: ["angular", "angularjs", "ng"] },
  svelte: { aliases: ["svelte"] },
  springboot: { aliases: ["spring boot", "springboot", "spring"] },
  rails: { aliases: ["rails", "ruby on rails"] },
  laravel: { aliases: ["laravel"] },
  "asp.net": { aliases: ["asp.net", "aspnet"] },
  flutter: { aliases: ["flutter"] },
  "react-native": { aliases: ["react native", "react-native", "reactnative"] },
  tailwind: { aliases: ["tailwind", "tailwindcss"] },
  godot: { aliases: ["godot"] },
  unity: { aliases: ["unity"] },
  "game-dev": { aliases: ["game development", "game-dev"] },
  // Databases
  postgresql: { aliases: ["postgresql", "postgres", "psql", "pg"] },
  mysql: { aliases: ["mysql"] },
  mongodb: { aliases: ["mongodb", "mongo"] },
  redis: { aliases: ["redis"] },
  sqlite: { aliases: ["sqlite", "sqlite3"] },
  sqlserver: { aliases: ["sql server", "mssql"] },
  cassandra: { aliases: ["cassandra"] },
  graphql: { aliases: ["graphql"] },
  prisma: { aliases: ["prisma"] },
  supabase: { aliases: ["supabase"] },
  firebase: { aliases: ["firebase", "firestore"] },
  // Infra / tools
  docker: { aliases: ["docker", "container", "containers"] },
  kubernetes: { aliases: ["kubernetes", "k8s"] },
  terraform: { aliases: ["terraform"] },
  aws: { aliases: ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudformation"] },
  gcp: { aliases: ["gcp", "google cloud"] },
  azure: { aliases: ["azure", "ms azure"] },
  git: { aliases: ["git", "github actions", "github", "ci/cd", "ci-cd"] },
  linux: { aliases: ["linux", "ubuntu", "debian"] },
};

// Build a lookup from lowercase alias -> canonical skill.
const ALIAS_TO_SKILL = {};
for (const [skill, { aliases }] of Object.entries(LEXICON)) {
  for (const alias of aliases) {
    ALIAS_TO_SKILL[alias.toLowerCase()] = skill;
  }
}

// Map a GitHub language name (as returned by repos.listLanguages) to skills.
const LANGUAGE_TO_SKILL = {
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  java: "java",
  go: "go",
  rust: "rust",
  "c++": "cpp",
  c: "c",
  "c#": "csharp",
  php: "php",
  ruby: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  dart: "dart",
  shell: "shell",
  html: "html",
  css: "css",
  ruby: "ruby",
  vue: "vue",
  jupyter: "python",
  json: "json",
  yaml: "yaml",
  markdown: "markdown",
  dockerfile: "docker",
};

// File extension -> language -> skill
const EXTENSION_TO_SKILL = {
  py: "python",
  js: "javascript",
  jsx: "react",
  ts: "typescript",
  tsx: "react",
  go: "go",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  dart: "dart",
  sh: "shell",
  bash: "shell",
  ps1: "shell",
  vue: "vue",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  sass: "css",
  sql: "postgresql",
  prisma: "prisma",
  tf: "terraform",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  md: "markdown",
};

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function matchAliasesInText(text) {
  const normalized = normalizeText(text);
  const found = new Set();
  for (const [skill, { aliases }] of Object.entries(LEXICON)) {
    for (const alias of aliases) {
      // Word-boundary search to avoid matching 'c' inside 'docker'.
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^a-z0-9+#._-])${escaped}($|[^a-z0-9+#._-])`, "i");
      if (regex.test(normalized)) {
        found.add(skill);
        break;
      }
    }
  }
  return [...found];
}

// Extract skills from a repository (language stats + topics).
export function extractSkillsFromRepository(repository, languageStats = {}) {
  const skills = new Set();
  const languageBytes = languageStats || {};
  const totalBytes = Object.values(languageBytes).reduce((sum, v) => sum + Number(v || 0), 0);

  for (const [language, bytes] of Object.entries(languageBytes)) {
    const skill = LANGUAGE_TO_SKILL[normalizeText(language).toLowerCase()] || LANGUAGE_TO_SKILL[language.toLowerCase()];
    // Only count as evidence if it's a meaningful share of the repo (>=5%).
    if (skill && totalBytes > 0 && bytes / totalBytes >= 0.05) {
      skills.add(skill);
    }
  }

  if (repository?.language && totalBytes === 0) {
    const skill = LANGUAGE_TO_SKILL[normalizeText(repository.language).toLowerCase()];
    if (skill) skills.add(skill);
  }

  for (const topic of repository?.topics || []) {
    const skill = ALIAS_TO_SKILL[normalizeText(topic)];
    if (skill) skills.add(skill);
  }

  // Repo name/description heuristics.
  const textBits = [repository?.name, repository?.description];
  for (const skill of matchAliasesInText(textBits.join(" "))) {
    skills.add(skill);
  }

  return [...skills];
}

// Extract skills from a PR (title + body + changed file paths/extensions).
export function extractSkillsFromPullRequest(pr, files = []) {
  const skills = new Set();
  const textBits = [pr?.title, pr?.body];
  for (const skill of matchAliasesInText(textBits.join(" "))) {
    skills.add(skill);
  }
  for (const file of files) {
    const path = file?.filename || "";
    const ext = path.split(".").pop()?.toLowerCase();
    const skill = EXTENSION_TO_SKILL[ext];
    if (skill) skills.add(skill);
  }
  return [...skills];
}

// Combine a repo's and a PR's skills into one deduplicated set.
export function extractSkillsFromPullEvidence(repositorySkills, prSkills) {
  return [...new Set([...repositorySkills, ...prSkills])];
}

export function getSkillLexicon() {
  return { ...LEXICON };
}