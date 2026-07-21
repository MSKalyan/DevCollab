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

  export const fetchAllBlogs = async (page, limit, search, category) => {
    const offset = (page - 1) * limit;
    const values = [`%${search}%`, limit, offset];
    let query = `
      SELECT blogs.*, users.name AS author_name
      FROM blogs
      JOIN users ON blogs.author = users.id
      WHERE (blogs.title ILIKE $1 OR blogs.content ILIKE $1)
    `;

    if (category) {
      query += ` AND blogs.category = $4`;
      values.push(category);
    }

    query += ` ORDER BY blogs.created_at DESC LIMIT $2 OFFSET $3`;

    const result = await pool.query(query, values);
    return result.rows;
  };
  
  export const getUserBlogs = async (id, page, limit, search, category) => {
    const offset = (page - 1) * limit;

    const query = `
      SELECT * FROM blogs
      WHERE author = $1
      AND (title ILIKE $2 OR content ILIKE $2)
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
  
  
export const getUserById = async (id)=> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }
  


// Delete a specific blog by blog ID
export const deleteBlog = async (blogId) => {
  const query = 'DELETE FROM blogs WHERE id = $1 RETURNING *';
  const values = [blogId];
  const result = await pool.query(query, values);
  return result.rows[0];
};

// Delete a user by user ID
export const deleteUser = async (userId) => {
  const query = 'DELETE FROM users WHERE id = $1 RETURNING *';
  const values = [userId];
  const result = await pool.query(query, values);
  return result.rows[0];
};
