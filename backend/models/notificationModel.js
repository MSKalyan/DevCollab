import pool from "./db.js";

// Incoming private contact requests for a user. Newest first.
export async function listIncomingRequests(userId) {
  const result = await pool.query(
    `SELECT cr.id, cr.message, cr.status, cr.created_at, 'contact' AS type,
            u.id AS sender_id, u.name AS sender_name, u.avatar AS sender_avatar
     FROM contact_requests cr
     JOIN users u ON u.id = cr.requester_id
     WHERE cr.recipient_id = $1
     ORDER BY cr.created_at DESC`,
    [userId]
  );
  return result.rows;
}