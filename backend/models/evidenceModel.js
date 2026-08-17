import pool from "./db.js";

export const EVENT_TYPES = {
  MERGED_PR: "MERGED_PR",
  CONTRIBUTED_REPOSITORY: "CONTRIBUTED_REPOSITORY",
  PR_REVIEW: "PR_REVIEW",
  COMMIT: "COMMIT",
};

// Idempotent insert: the same (account, event_type, github_event_id) can never
// produce a second row, so backfills are safe to run repeatedly.
export async function insertEvidenceEvent({
  githubAccountId,
  eventType,
  githubEventId,
  repoId = null,
  repoFullName = null,
  prNumber = null,
  commitSha = null,
  language = null,
  metadata = {},
  occurredAt = null,
  sourceUrl = null,
}) {
  const result = await pool.query(
    `INSERT INTO evidence_events (
       github_account_id, event_type, github_event_id, repo_id, repo_full_name,
       pr_number, commit_sha, language, metadata, occurred_at, source_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (github_account_id, event_type, github_event_id) DO NOTHING
     RETURNING id`,
    [
      githubAccountId,
      eventType,
      githubEventId,
      repoId,
      repoFullName,
      prNumber,
      commitSha,
      language,
      JSON.stringify(metadata),
      occurredAt || null,
      sourceUrl || null,
    ]
  );
  return result.rows[0] || null;
}

const EVIDENCE_COLUMNS = `github_account_id, event_type, github_event_id, repo_id,
  repo_full_name, pr_number, commit_sha, language, metadata, occurred_at, source_url`;

// Bulk idempotent insert: one multi-row statement per chunk instead of a
// round-trip per event. Same conflict behavior as insertEvidenceEvent.
export async function insertEvidenceEvents(events) {
  if (!events || events.length === 0) return 0;
  const CHUNK = 500;
  let inserted = 0;
  for (let start = 0; start < events.length; start += CHUNK) {
    const chunk = events.slice(start, start + CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((e, i) => {
      const base = i * 11;
      params.push(
        e.githubAccountId,
        e.eventType,
        e.githubEventId,
        e.repoId ?? null,
        e.repoFullName ?? null,
        e.prNumber ?? null,
        e.commitSha ?? null,
        e.language ?? null,
        JSON.stringify(e.metadata || {}),
        e.occurredAt ?? null,
        e.sourceUrl ?? null
      );
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
      );
    });
    const result = await pool.query(
      `INSERT INTO evidence_events (${EVIDENCE_COLUMNS})
       VALUES ${values.join(", ")}
       ON CONFLICT (github_account_id, event_type, github_event_id) DO NOTHING`,
      params
    );
    inserted += result.rowCount || 0;
  }
  return inserted;
}

export async function listEvidenceForAccount(githubAccountId) {
  const result = await pool.query(
    `SELECT event_type, repo_id, repo_full_name, pr_number, language, metadata,
            occurred_at, source_url
     FROM evidence_events
     WHERE github_account_id = $1
     ORDER BY occurred_at DESC NULLS LAST`,
    [githubAccountId]
  );
  return result.rows;
}

// Distinct contributed repositories for an account, most recently pushed first.
// Each CONTRIBUTED_REPOSITORY row already dedupes by repo (github_event_id =
// `repo:<id>`), so DISTINCT ON is just a guard against legacy duplicates.
export async function listContributedRepositories(githubAccountId, { limit = 100 } = {}) {
  const result = await pool.query(
    `SELECT DISTINCT ON (repo_id)
            repo_id, repo_full_name, language, metadata, source_url, occurred_at
     FROM evidence_events
     WHERE github_account_id = $1 AND event_type = 'CONTRIBUTED_REPOSITORY'
     ORDER BY repo_id, occurred_at DESC NULLS LAST
     LIMIT $2`,
    [githubAccountId, limit]
  );
  return result.rows;
}

export async function countEvidenceByType(githubAccountId) {
  const result = await pool.query(
    `SELECT event_type, COUNT(*) AS total
     FROM evidence_events
     WHERE github_account_id = $1
     GROUP BY event_type`,
    [githubAccountId]
  );
  return result.rows;
}