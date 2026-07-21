// blogModel.js

import pool from './db.js'; // pg-pool connection

// Function to create a new blog post
export const createBlog = async (title, content, author, category, image) => {
  const query = `
    INSERT INTO blogs (title, content, author, category, image) 
    VALUES ($1, $2, $3, $4, $5) RETURNING *;
  `;
  const values = [title, content, author, category, image];
  const result = await pool.query(query, values);
  return result.rows[0];
};


// Function to get all blogs (for public view)
export const getAllBlogs = async () => {
  const query = `
    SELECT blogs.*, users.name AS author_name 
    FROM blogs
    JOIN users ON blogs.author = users.id
    ORDER BY blogs.created_at DESC;
  `;
  const result = await pool.query(query);
  return result.rows;
};

// Function to fetch all blogs for a specific user by their user ID
export const getBlogById = async (blogId) => {
  const query = `
    SELECT * FROM blogs
    WHERE id = $1
  `;
  const values = [blogId];
  const result = await pool.query(query, values);
  return result.rows[0]; // Return single blog
};

// Function to get all blogs of a specific user
export const getAllMyBlogs = async (userId) => {
  const query = `
    SELECT * FROM blogs
    WHERE author = $1
    ORDER BY created_at DESC;
  `;
  const values = [userId];
  const result = await pool.query(query, values);
  return result.rows;
};

// Function to update a blog
export const updateBlog = async (id, title, content, image) => {
  let query, values;

  if (image) {
    query = `
      UPDATE blogs 
      SET title = $1, content = $2, image = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 RETURNING *;
    `;
    values = [title, content, image, id];
  } else {
    query = `
      UPDATE blogs 
      SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 RETURNING *;
    `;
    values = [title, content, id];
  }

  const result = await pool.query(query, values);
  return result.rows[0];
};


// Function to delete a blog
export const deleteBlog = async (id) => {
  const query = `
    DELETE FROM blogs 
    WHERE id = $1 
    RETURNING *;
  `;
  const values = [id];
  const result = await pool.query(query, values);
  return result.rows[0];
};
