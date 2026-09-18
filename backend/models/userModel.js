import pool from './db.js';

export const getUserProfile = async (userId) => {
  const result = await pool.query(
    `SELECT id, name, email, bio, avatar, github_username, location, website, role, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
};

export const getUserByEmail = async (email) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
};

export const getUserById = async (userId) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
};

export const createUser = async (name, email, password) => {
  const result = await pool.query(
    'INSERT INTO users (name, email, password, created_at, role) VALUES ($1, $2, $3, NOW(), $4) RETURNING *',
    [name, email, password, 'user']
  );
  return result.rows[0];
};

export const updateUserNameAndPassword = async (userId, name, hashedPassword) => {
  if (hashedPassword) {
    const result = await pool.query(
      'UPDATE users SET name = $1, password = $2 WHERE id = $3 RETURNING *',
      [name, hashedPassword, userId]
    );
    return result.rows[0];
  }
  const result = await pool.query(
    'UPDATE users SET name = $1 WHERE id = $2 RETURNING *',
    [name, userId]
  );
  return result.rows[0];
};

export const updateUserPassword = async (userId, hashedPassword) => {
  const result = await pool.query(
    'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
    [hashedPassword, userId]
  );
  return result.rows[0] || null;
};


export const getDevelopers = async (page, limit, search) => {
  const offset = (page - 1) * limit;
  let query = `
    SELECT u.id, u.name, u.bio, u.avatar, u.github_username, u.location, u.website
    FROM users u
  `;
  const values = [];
  let paramIndex = 1;

  if (search) {
    query += ` WHERE (u.name ILIKE $${paramIndex} OR u.bio ILIKE $${paramIndex} OR u.github_username ILIKE $${paramIndex})`;
    values.push(`%${search}%`);
    paramIndex++;
  }

  query += ` ORDER BY u.name ASC`;

  const countQuery = `SELECT COUNT(*) FROM (${query}) AS filtered`;
  const countResult = await pool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count);

  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  return { developers: result.rows, total };
};

export const createContactRequest = async (recipientId, requesterId, message = null) => {
  const result = await pool.query(
    `INSERT INTO contact_requests (recipient_id, requester_id, message)
     VALUES ($1, $2, $3)
     ON CONFLICT (recipient_id, requester_id)
     DO UPDATE SET
       message = EXCLUDED.message,
       status = CASE WHEN contact_requests.status = 'accepted' THEN 'accepted' ELSE 'pending' END,
       created_at = NOW()
     RETURNING *`,
    [recipientId, requesterId, message]
  );
  return result.rows[0];
};
