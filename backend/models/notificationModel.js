import pool from "./db.js";

// Incoming requests for a user: private contact requests addressed to them,
// plus collaboration requests on projects they own. Newest first.
export async function listIncomingRequests(userId) {
  const [contact, collab] = await Promise.all([
    pool.query(
      `SELECT cr.id, cr.message, cr.status, cr.created_at, 'contact' AS type,
              u.id AS sender_id, u.name AS sender_name, u.avatar AS sender_avatar
       FROM contact_requests cr
       JOIN users u ON u.id = cr.requester_id
       WHERE cr.recipient_id = $1
       ORDER BY cr.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT cr.id, cr.message, cr.status, cr.created_at, 'collab' AS type,
              u.id AS sender_id, u.name AS sender_name, u.avatar AS sender_avatar,
              p.id AS project_id, p.title AS project_title
       FROM collab_requests cr
       JOIN projects p ON p.id = cr.project_id
       JOIN users u ON u.id = cr.requester_id
       WHERE p.owner_id = $1
       ORDER BY cr.created_at DESC`,
      [userId]
    ),
  ]);

  return [...contact.rows, ...collab.rows];
}