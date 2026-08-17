import pool from "./db.js";

export const ISSUE_COLUMNS = `
  id, github_issue_id, repository_id, issue_number, title, body, state,
  html_url, author_login, labels, repo_topics, repo_language, comments_count,
  created_at, updated_at, closed_at, is_pull_request, fetched_at, last_seen_at,
  created_at_db, updated_at_db
`;

function parseJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function mapIssueRow(row) {
  if (!row) return row;
  return {
    ...row,
    labels: parseJson(row.labels) || [],
    repo_topics: parseJson(row.repo_topics) || [],
    repo_language: row.repo_language || null,
  };
}

// Idempotent upsert on (repository_id, issue_number). Only updates fields we
// consider facts; fetched_at is refreshed on every fetch.
export async function upsertGithubIssue({
  githubIssueId,
  repositoryId,
  issueNumber,
  title,
  body = null,
  state = "open",
  htmlUrl = null,
  authorLogin = null,
  labels = [],
  repoTopics = [],
  repoLanguage = null,
  commentsCount = 0,
  createdAt = null,
  updatedAt = null,
  closedAt = null,
  isPullRequest = false,
  fetchedAt = new Date(),
}) {
  const result = await pool.query(
    `INSERT INTO github_issues (
       github_issue_id, repository_id, issue_number, title, body, state,
       html_url, author_login, labels, repo_topics, repo_language,
       comments_count, created_at, updated_at, closed_at, is_pull_request,
       fetched_at, last_seen_at, updated_at_db
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, NOW())
     ON CONFLICT (repository_id, issue_number)
     DO UPDATE SET
       github_issue_id = EXCLUDED.github_issue_id,
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       state = EXCLUDED.state,
       html_url = EXCLUDED.html_url,
       author_login = EXCLUDED.author_login,
       labels = EXCLUDED.labels,
       repo_topics = EXCLUDED.repo_topics,
       repo_language = EXCLUDED.repo_language,
       comments_count = EXCLUDED.comments_count,
       created_at = COALESCE(EXCLUDED.created_at, github_issues.created_at),
       updated_at = COALESCE(EXCLUDED.updated_at, github_issues.updated_at),
       closed_at = EXCLUDED.closed_at,
       is_pull_request = EXCLUDED.is_pull_request,
       fetched_at = EXCLUDED.fetched_at,
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at_db = NOW()
     RETURNING ${ISSUE_COLUMNS}`,
    [
      githubIssueId,
      repositoryId,
      issueNumber,
      title,
      body,
      state,
      htmlUrl,
      authorLogin,
      JSON.stringify(labels || []),
      JSON.stringify(repoTopics || []),
      repoLanguage,
      commentsCount ?? 0,
      createdAt ? new Date(createdAt) : null,
      updatedAt ? new Date(updatedAt) : null,
      closedAt ? new Date(closedAt) : null,
      isPullRequest ?? false,
      fetchedAt ? new Date(fetchedAt) : new Date(),
      new Date(),
    ]
  );
  return mapIssueRow(result.rows[0]);
}

// Mark issues for a repo that were NOT seen in this sync as stale: closes them
// (they are no longer open on GitHub) so they stop being recommended.
export async function markMissingIssuesStale(repositoryId, seenIssueNumbers, fetchedAt) {
  const result = await pool.query(
    `UPDATE github_issues
     SET state = 'closed',
         closed_at = COALESCE(closed_at, $3),
         updated_at_db = NOW()
     WHERE repository_id = $1
       AND state = 'open'
       AND is_pull_request = FALSE
       AND issue_number != ALL($2::int[])
     RETURNING issue_number`,
    [repositoryId, seenIssueNumbers, fetchedAt]
  );
  return result.rows.map((r) => r.issue_number);
}

export async function listOpenIssuesForRepo(repositoryId) {
  const result = await pool.query(
    `SELECT ${ISSUE_COLUMNS} FROM github_issues
     WHERE repository_id = $1 AND state = 'open' AND is_pull_request = FALSE
     ORDER BY updated_at DESC NULLS LAST, issue_number DESC`,
    [repositoryId]
  );
  return result.rows.map(mapIssueRow);
}

export async function listEligibleIssues({
  limit = 500,
  offset = 0,
  language = null,
  label = null,
  repository = null,
} = {}) {
  const params = [];
  const where = ["state = 'open'", "is_pull_request = FALSE"];
  if (language) {
    params.push(language);
    where.push(`LOWER(repo_language) = LOWER($${params.length})`);
  }
  if (label) {
    params.push(label);
    where.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(labels) AS l
      WHERE LOWER(l) = LOWER($${params.length})
    )`);
  }
  if (repository) {
    params.push(repository);
    where.push(`EXISTS (
      SELECT 1 FROM curated_repositories cr
      WHERE cr.id = github_issues.repository_id
        AND LOWER(cr.full_name) = LOWER($${params.length})
    )`);
  }

  const result = await pool.query(
    `SELECT ${ISSUE_COLUMNS}, ci.full_name AS repo_full_name
     FROM github_issues ci
     JOIN curated_repositories cr ON cr.id = ci.repository_id
     WHERE ${where.join(" AND ")}
     ORDER BY updated_at DESC NULLS LAST
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return result.rows.map(mapIssueRow);
}

export async function countEligibleIssues({
  language = null,
  label = null,
  repository = null,
} = {}) {
  const params = [];
  const where = ["state = 'open'", "is_pull_request = FALSE"];
  if (language) {
    params.push(language);
    where.push(`LOWER(repo_language) = LOWER($${params.length})`);
  }
  if (label) {
    params.push(label);
    where.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(labels) AS l
      WHERE LOWER(l) = LOWER($${params.length})
    )`);
  }
  if (repository) {
    params.push(repository);
    where.push(`EXISTS (
      SELECT 1 FROM curated_repositories cr
      WHERE cr.id = github_issues.repository_id
        AND LOWER(cr.full_name) = LOWER($${params.length})
    )`);
  }

  const result = await pool.query(
    `SELECT COUNT(*) AS total
     FROM github_issues ci
     JOIN curated_repositories cr ON cr.id = ci.repository_id
     WHERE ${where.join(" AND ")}`,
    params
  );
  return parseInt(result.rows[0].total, 10);
}

export async function countIssuesByRepo(repositoryId) {
  const result = await pool.query(
    `SELECT COUNT(*) AS total FROM github_issues WHERE repository_id = $1`,
    [repositoryId]
  );
  return parseInt(result.rows[0].total, 10);
}

export async function clearIssuesForRepo(repositoryId) {
  await pool.query(`DELETE FROM github_issues WHERE repository_id = $1`, [repositoryId]);
}