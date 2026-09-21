import pool from "./db.js";

// Only the newest code per user stays valid: requesting a new one invalidates
// the previous (same rationale as password reset tokens).
export async function storeVerificationCode(userId, codeHash, expiresAt) {
  await pool.query("DELETE FROM email_verification_codes WHERE user_id = $1", [userId]);
  await pool.query(
    "INSERT INTO email_verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, codeHash, expiresAt]
  );
}

// The live code for a user, consumed or not — the caller decides what a stale
// row means (expired, already used, or out of attempts).
export async function findLatestVerificationCode(userId) {
  const result = await pool.query(
    "SELECT * FROM email_verification_codes WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
    [userId]
  );
  return result.rows[0] || null;
}

export async function incrementVerificationAttempts(id) {
  await pool.query(
    "UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1",
    [id]
  );
}

// Atomically burn the code. Returns null when another request already claimed
// it, so two concurrent verifications cannot both succeed.
export async function consumeVerificationCode(id) {
  const result = await pool.query(
    "UPDATE email_verification_codes SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id",
    [id]
  );
  return result.rows[0] || null;
}

export async function deleteUserVerificationCodes(userId) {
  await pool.query("DELETE FROM email_verification_codes WHERE user_id = $1", [userId]);
}
