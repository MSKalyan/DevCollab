import pool from "./db.js";

export async function storePasswordResetToken(userId, tokenHash, expiresAt) {
  // Only the most recently requested link stays valid: an older link sitting in
  // an inbox cannot be used once the user asks for a new one.
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
  await pool.query(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );
}

export async function findPasswordResetToken(tokenHash) {
  const result = await pool.query(
    "SELECT * FROM password_reset_tokens WHERE token_hash = $1",
    [tokenHash]
  );
  return result.rows[0] || null;
}

// Atomically burn the token. Returns null when another request already claimed
// it, so two concurrent resets with the same link cannot both succeed.
export async function claimPasswordResetToken(id) {
  const result = await pool.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id",
    [id]
  );
  return result.rows[0] || null;
}

export async function deleteUserPasswordResetTokens(userId) {
  await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
}
