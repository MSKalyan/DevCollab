import pool from './db.js';

export const getUserProfile = async (userId) => {
  const result = await pool.query(
    `SELECT id, name, email, bio, avatar, github_username, location, website, role, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
};

export const updateUserProfile = async (userId, updates) => {
  const { name, bio, avatar, github_username, location, website, password } = updates;

  if (password) {
    const result = await pool.query(
      `UPDATE users SET name=$1, bio=$2, avatar=$3, github_username=$4, location=$5, website=$6, password=$7
       WHERE id=$8 RETURNING id, name, email, bio, avatar, github_username, location, website, role`,
      [name, bio, avatar, github_username, location, website, password, userId]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `UPDATE users SET name=$1, bio=$2, avatar=$3, github_username=$4, location=$5, website=$6
     WHERE id=$7 RETURNING id, name, email, bio, avatar, github_username, location, website, role`,
    [name, bio, avatar, github_username, location, website, userId]
  );
  return result.rows[0];
};

export const getDevelopers = async (page, limit, search, tech) => {
  const offset = (page - 1) * limit;
  let query = `
    SELECT DISTINCT u.id, u.name, u.bio, u.avatar, u.github_username, u.location, u.website,
      COALESCE(p.project_count, 0) AS project_count
    FROM users u
    LEFT JOIN (SELECT owner_id, COUNT(*) AS project_count FROM projects GROUP BY owner_id) p ON p.owner_id = u.id
  `;
  const values = [];
  let paramIndex = 1;
  const conditions = [];

  if (search) {
    conditions.push(`(u.name ILIKE $${paramIndex} OR u.bio ILIKE $${paramIndex} OR u.github_username ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  if (tech) {
    conditions.push(`EXISTS (
      SELECT 1 FROM projects pr
      JOIN project_tags pt ON pt.project_id = pr.id
      JOIN tech_tags t ON t.id = pt.tag_id
      WHERE pr.owner_id = u.id AND t.name ILIKE $${paramIndex}
    )`);
    values.push(tech);
    paramIndex++;
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
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

export const getUserProjects = async (userId) => {
  const result = await pool.query(
    `SELECT p.*,
      COALESCE(s.star_count, 0) AS star_count,
      COALESCE(f.fork_count, 0) AS fork_count
    FROM projects p
    LEFT JOIN (SELECT project_id, COUNT(*) AS star_count FROM stars GROUP BY project_id) s ON s.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS fork_count FROM forks GROUP BY project_id) f ON f.project_id = p.id
    WHERE p.owner_id = $1
      AND NOT EXISTS (SELECT 1 FROM forks fk WHERE fk.project_id = p.id)
    ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
};

export const createContactRequest = async (recipientId, requesterId, message) => {
  const result = await pool.query(
    `INSERT INTO contact_requests (recipient_id, requester_id, message)
     VALUES ($1, $2, $3)
     ON CONFLICT (recipient_id, requester_id)
     DO UPDATE SET message = EXCLUDED.message, status = 'pending', created_at = NOW()
     RETURNING *`,
    [recipientId, requesterId, message]
  );
  return result.rows[0];
};
