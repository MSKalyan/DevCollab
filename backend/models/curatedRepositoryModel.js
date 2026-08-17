import pool from "./db.js";

const PUBLIC_COLUMNS = `
  id, github_repo_id, owner, name, full_name, enabled, priority, html_url,
  description, primary_language, languages, topics, stars, forks,
  open_issues_count, default_branch, last_pushed_at, last_synced_at,
  created_at, updated_at
`;

function mapRepoRow(row) {
  if (!row) return row;
  return {
    ...row,
    languages: typeof row.languages === "string" ? JSON.parse(row.languages) : row.languages || {},
    topics: typeof row.topics === "string" ? JSON.parse(row.topics) : row.topics || [],
  };
}

export async function listEnabledCuratedRepositories() {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM curated_repositories
     WHERE enabled = TRUE
     ORDER BY priority DESC, full_name ASC`
  );
  return result.rows.map(mapRepoRow);
}

export async function listAllCuratedRepositories() {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM curated_repositories ORDER BY full_name ASC`
  );
  return result.rows.map(mapRepoRow);
}

export async function findCuratedRepositoryByFullName(fullName) {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM curated_repositories WHERE LOWER(full_name) = LOWER($1)`,
    [fullName]
  );
  return mapRepoRow(result.rows[0] || null);
}

export async function findCuratedRepositoryById(id) {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM curated_repositories WHERE id = $1`,
    [id]
  );
  return mapRepoRow(result.rows[0] || null);
}

// Create a curated repository row (used by seeding and the sync job). Returns
// the row, or null if disabled (skipped). Idempotent on (owner, name).
export async function upsertCuratedRepository({
  githubRepoId = null,
  owner,
  name,
  fullName,
  enabled = true,
  priority = 100,
}) {
  const result = await pool.query(
    `INSERT INTO curated_repositories (
       github_repo_id, owner, name, full_name, enabled, priority
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (full_name)
     DO UPDATE SET
       github_repo_id = COALESCE(EXCLUDED.github_repo_id, curated_repositories.github_repo_id),
       owner = EXCLUDED.owner,
       name = EXCLUDED.name,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()
     RETURNING ${PUBLIC_COLUMNS}`,
    [githubRepoId, owner, name, fullName, enabled, priority]
  );
  return mapRepoRow(result.rows[0]);
}

// Merge fresh GitHub metadata into a curated repository row. `enabled`/`priority`
// are configuration, so this never touches them.
export async function updateCuratedRepositoryMetadata(id, fields) {
  const {
    githubRepoId,
    htmlUrl,
    description,
    primaryLanguage,
    languages,
    topics,
    stars,
    forks,
    openIssuesCount,
    defaultBranch,
    lastPushedAt,
  } = fields;

  const result = await pool.query(
    `UPDATE curated_repositories
     SET github_repo_id = COALESCE($2, github_repo_id),
         html_url = COALESCE($3, html_url),
         description = COALESCE($4, description),
         primary_language = COALESCE($5, primary_language),
         languages = COALESCE($6, languages),
         topics = COALESCE($7, topics),
         stars = COALESCE($8, stars),
         forks = COALESCE($9, forks),
         open_issues_count = COALESCE($10, open_issues_count),
         default_branch = COALESCE($11, default_branch),
         last_pushed_at = COALESCE($12, last_pushed_at),
         last_synced_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      id,
      githubRepoId ?? null,
      htmlUrl ?? null,
      description ?? null,
      primaryLanguage ?? null,
      languages ? JSON.stringify(languages) : null,
      topics ? JSON.stringify(topics) : null,
      stars ?? null,
      forks ?? null,
      openIssuesCount ?? null,
      defaultBranch ?? null,
      lastPushedAt ? new Date(lastPushedAt) : null,
    ]
  );
  return mapRepoRow(result.rows[0]);
}

export async function setCuratedRepositoryEnabled(id, enabled) {
  await pool.query(
    `UPDATE curated_repositories SET enabled = $2, updated_at = NOW() WHERE id = $1`,
    [id, enabled]
  );
}