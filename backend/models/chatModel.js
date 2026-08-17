import pool from "./db.js";

// Accept a pending contact request (only the recipient may). Creates the
// conversation that unlocks chat between the pair.
export async function acceptContactRequest(requestId, userId) {
  const result = await pool.query(
    `UPDATE contact_requests
     SET status = 'accepted'
     WHERE id = $1 AND recipient_id = $2
     RETURNING id, recipient_id, requester_id, status`,
    [requestId, userId]
  );
  const request = result.rows[0];
  if (!request) return null;

  await pool.query(
    `INSERT INTO conversations (contact_request_id, user_a, user_b)
     VALUES ($1, LEAST($2::int, $3::int), GREATEST($2::int, $3::int))
     ON CONFLICT (contact_request_id) DO NOTHING`,
    [request.id, request.recipient_id, request.requester_id]
  );
  return request;
}

// Reject a pending contact request (only the recipient may).
export async function rejectContactRequest(requestId, userId) {
  const result = await pool.query(
    `UPDATE contact_requests
     SET status = 'rejected'
     WHERE id = $1 AND recipient_id = $2
     RETURNING id, recipient_id, requester_id, status`,
    [requestId, userId]
  );
  return result.rows[0] || null;
}

export async function isConversationParticipant(conversationId, userId) {
  const result = await pool.query(
    "SELECT 1 FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)",
    [conversationId, userId]
  );
  return result.rows.length > 0;
}

// Conversations for a user, newest activity first, with the other party's
// profile and an unread count for the current user.
export async function listConversationsForUser(userId) {
  const result = await pool.query(
    `SELECT c.id, c.created_at, c.last_message_at,
            CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END AS other_user_id,
            u.name AS other_name,
            u.avatar AS other_avatar,
            u.github_username AS other_github_username
     FROM conversations c
     JOIN users u ON u.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
     WHERE c.user_a = $1 OR c.user_b = $1
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
    [userId]
  );
  const conversations = result.rows;
  if (conversations.length === 0) return conversations;

  const msgRes = await pool.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_a = $1 OR c.user_b = $1
     ORDER BY m.id ASC`,
    [userId]
  );
  const byConversation = {};
  for (const m of msgRes.rows) {
    if (!byConversation[m.conversation_id]) byConversation[m.conversation_id] = [];
    byConversation[m.conversation_id].push(m);
  }
  for (const c of conversations) {
    const msgs = byConversation[c.id] || [];
    const last = msgs[msgs.length - 1];
    c.last_message = last ? last.body : null;
    c.unread = msgs.filter((m) => m.sender_id !== userId && !m.read_at).length;
  }
  return conversations;
}

// Messages in a conversation (marks the current user's incoming ones read).
export async function listMessages(conversationId, userId) {
  await pool.query(
    `UPDATE messages SET read_at = NOW()
     WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
    [conversationId, userId]
  );
  const result = await pool.query(
    `SELECT id, conversation_id, sender_id, body, created_at, read_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY id ASC`,
    [conversationId]
  );
  return result.rows;
}

export async function sendMessage(conversationId, senderId, body) {
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, conversation_id, sender_id, body, created_at, read_at`,
    [conversationId, senderId, body]
  );
  await pool.query(
    "UPDATE conversations SET last_message_at = NOW() WHERE id = $1",
    [conversationId]
  );
  return result.rows[0];
}