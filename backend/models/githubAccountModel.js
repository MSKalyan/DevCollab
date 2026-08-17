import pool from "./db.js";

export const BACKFILL_STATES = {
  NOT_CONNECTED: "NOT_CONNECTED",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

const PUBLIC_COLUMNS = `
  id, user_id, github_user_id, login, name, avatar_url, profile_url,
  token_expires_at, backfill_status, backfill_error, last_backfill_started_at,
  last_synced_at, created_at, updated_at
`;

export async function findGithubAccountByUserId(userId) {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM github_accounts WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function findGithubAccountByGithubUserId(githubUserId) {
  const result = await pool.query(
    `SELECT * FROM github_accounts WHERE github_user_id = $1`,
    [githubUserId]
  );
  return result.rows[0] || null;
}

export async function getGithubAccountWithToken(userId) {
  const result = await pool.query(
    `SELECT * FROM github_accounts WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getGithubAccountByIdWithToken(accountId) {
  const result = await pool.query(
    `SELECT * FROM github_accounts WHERE id = $1`,
    [accountId]
  );
  return result.rows[0] || null;
}

// Upsert preserves the invariants:
//   1) one DevCollab user => one GitHub account (UNIQUE user_id)
//   2) a github_user_id maps to at most one account (UNIQUE github_user_id)
// The conflict target is user_id: reconnecting the same DevCollab user to a
// (possibly new) GitHub identity replaces their account row. Connecting a
// GitHub identity already owned by another user is blocked in the controller
// before this is called.
export async function upsertGithubAccount({
  userId,
  githubUserId,
  login,
  name,
  avatarUrl,
  profileUrl,
  accessTokenEncrypted,
  tokenExpiresAt,
}) {
  const result = await pool.query(
    `INSERT INTO github_accounts (
       user_id, github_user_id, login, name, avatar_url, profile_url,
       access_token_encrypted, token_expires_at, backfill_status, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED', NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       github_user_id = EXCLUDED.github_user_id,
       login = EXCLUDED.login,
       name = EXCLUDED.name,
       avatar_url = EXCLUDED.avatar_url,
       profile_url = EXCLUDED.profile_url,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       backfill_status = 'QUEUED',
       backfill_error = NULL,
       updated_at = NOW()
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      userId,
      githubUserId,
      login,
      name,
      avatarUrl,
      profileUrl,
      accessTokenEncrypted,
      tokenExpiresAt || null,
    ]
  );
  return result.rows[0];
}

export async function setBackfillStatus(accountId, status, error = null) {
  const result = await pool.query(
    `UPDATE github_accounts
     SET backfill_status = $2,
         backfill_error = $3,
         last_backfill_started_at = COALESCE($4, last_backfill_started_at),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [accountId, status, error, status === "RUNNING" ? new Date() : null]
  );
  return result.rows[0] || null;
}

export async function markBackfillCompleted(accountId) {
  const result = await pool.query(
    `UPDATE github_accounts
     SET backfill_status = 'COMPLETED',
         backfill_error = NULL,
         last_synced_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [accountId]
  );
  return result.rows[0] || null;
}

export async function updateAccessToken(accountId, accessTokenEncrypted, tokenExpiresAt) {
  await pool.query(
    `UPDATE github_accounts
     SET access_token_encrypted = $2, token_expires_at = $3, updated_at = NOW()
     WHERE id = $1`,
    [accountId, accessTokenEncrypted, tokenExpiresAt || null]
  );
}

export async function countEvidenceForAccount(accountId) {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM evidence_events WHERE github_account_id = $1",
    [accountId]
  );
  return parseInt(result.rows[0].total, 10);
}

export async function countDistinctRepositoriesForAccount(accountId, type = "CONTRIBUTED_REPOSITORY") {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT repo_id) AS total
     FROM evidence_events
     WHERE github_account_id = $1 AND event_type = $2`,
    [accountId, type]
  );
  return parseInt(result.rows[0].total, 10);
}

export async function countReviewsForAccount(accountId) {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM evidence_events WHERE github_account_id = $1 AND event_type = 'PR_REVIEW'",
    [accountId]
  );
  return parseInt(result.rows[0].total, 10);
}

// Unlink GitHub for a user. evidence_events and skill_evidence cascade-delete
// with the account row, freeing github_user_id so it can be linked elsewhere.
export async function deleteGithubAccountForUser(userId) {
  const result = await pool.query(
    "DELETE FROM github_accounts WHERE user_id = $1 RETURNING id, github_user_id",
    [userId]
  );
  return result.rows[0] || null;
}