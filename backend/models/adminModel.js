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

  const countValues = [`%${search}%`];
  let countQuery = `
    SELECT COUNT(*) FROM users
    WHERE name != 'admin'
    AND (name ILIKE $1 OR email ILIKE $1)
  `;
  if (role) {
    countQuery += ` AND role = $2`;
    countValues.push(role);
  }
  const countResult = await pool.query(countQuery, countValues);

  return { users: result.rows, total: parseInt(countResult.rows[0].count) };
};

export const getUserNameById = async (id) => {
  const result = await pool.query('SELECT name FROM users WHERE id = $1', [id]);
  return result.rows[0]?.name;
};

export const getUserById = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

export const deleteUser = async (userId) => {
  const query = 'DELETE FROM users WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [userId]);
  return result.rows[0];
};
