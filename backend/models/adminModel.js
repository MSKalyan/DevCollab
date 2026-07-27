import pool from './db.js';

export const getAllUsers = async (page, limit, search, role) => {
  const offset = (page - 1) * limit;
  const values = [`%${search}%`, limit, offset];
  let query = `
    SELECT * FROM users
    WHERE name != 'admin'
    AND (name ILIKE $1 OR email ILIKE $1)
  `;

  if (role) {
    query += ` AND role = $4`;
    values.push(role);
  }

  query += ` ORDER BY id LIMIT $2 OFFSET $3`;
  const result = await pool.query(query, values);
  return result.rows;
};

export const fetchAllProjects = async (page, limit, search, category) => {
  const offset = (page - 1) * limit;
  const values = [`%${search}%`, limit, offset];
  let query = `
    SELECT p.*, u.name AS owner_name
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    WHERE (p.title ILIKE $1 OR p.description ILIKE $1)
  `;

  if (category) {
    query += ` AND p.category = $4`;
    values.push(category);
  }

  query += ` ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`;
  const result = await pool.query(query, values);
  return result.rows;
};

export const getUserProjects = async (id, page, limit, search, category) => {
  const offset = (page - 1) * limit;
  const query = `
    SELECT * FROM projects
    WHERE owner_id = $1
    AND (title ILIKE $2 OR description ILIKE $2)
    AND ($3 = '' OR category = $3)
    ORDER BY created_at DESC
    LIMIT $4 OFFSET $5
  `;
  const result = await pool.query(query, [id, `%${search}%`, category, limit, offset]);
  return result.rows;
};

export const getUserNameById = async (id) => {
  const result = await pool.query('SELECT name FROM users WHERE id = $1', [id]);
  return result.rows[0]?.name;
};

export const getUserById = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

export const deleteProject = async (projectId) => {
  const query = 'DELETE FROM projects WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [projectId]);
  return result.rows[0];
};

export const deleteUser = async (userId) => {
  const query = 'DELETE FROM users WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [userId]);
  return result.rows[0];
};
