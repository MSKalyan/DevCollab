import pool from "./db.js";

export async function storeRefreshToken(userId, token, expiresAt) {
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
    [userId, token, expiresAt]
  );
}

export async function findRefreshToken(token) {
  const result = await pool.query(
    "SELECT * FROM refresh_tokens WHERE token = $1",
    [token]
  );
  return result.rows[0] || null;
}

export async function deleteRefreshToken(token) {
  await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [token]);
}

export async function deleteAllUserRefreshTokens(userId) {
  await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
}
