// Phase 2 default curated corpus. The list lives in the database
// (curated_repositories) so it can evolve without code changes; the schema
// seeds these defaults on a fresh install. This module is the source of truth
// for the seed list and for regenerating it in tests.

// ~24 repositories spanning several technology ecosystems.
export const DEFAULT_CURATED_REPOSITORIES = [
  { owner: "facebook", name: "react" },
  { owner: "django", name: "django" },
  { owner: "pallets", name: "flask" },
  { owner: "tiangolo", name: "fastapi" },
  { owner: "vercel", name: "next.js" },
  { owner: "nodejs", name: "node" },
  { owner: "redis", name: "redis" },
  { owner: "psf", name: "requests" },
  { owner: "golang", name: "go" },
  { owner: "kubernetes", name: "kubernetes" },
  { owner: "hashicorp", name: "terraform" },
  { owner: "microsoft", name: "typescript" },
  { owner: "rust-lang", name: "rust" },
  { owner: "grafana", name: "grafana" },
  { owner: "go-gorm", name: "gorm" },
  { owner: "nestjs", name: "nest" },
  { owner: "typeorm", name: "typeorm" },
  { owner: "prisma", name: "prisma" },
  { owner: "elastic", name: "kibana" },
  { owner: "apache", name: "airflow" },
  { owner: "openai", name: "openai-python" },
  { owner: "streamlit", name: "streamlit" },
  { owner: "dbt-labs", name: "dbt-core" },
  { owner: "pydantic", name: "pydantic" },
];

export const curatedRepoSeed = () =>
  DEFAULT_CURATED_REPOSITORIES.map(({ owner, name }, i) => ({
    githubRepoId: null,
    owner,
    name,
    fullName: `${owner}/${name}`,
    enabled: true,
    priority: 100,
  }));