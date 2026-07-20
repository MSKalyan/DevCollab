import { createBlog, getAllBlogs, getAllMyBlogs, getBlogById, updateBlog, deleteBlog as deleteBlogFromModel } from '../models/blogModel.js';
import pool from "../models/db.js";

// Admins may act on any blog; regular users are limited to their own.
function isAdmin(req) {
  return req.user && req.user.role === "admin";
}

// Controller to render the page for creating a new blog post
export const getCreateBlog = async (req, res) => {
  const { title, content, category } = req.body;
  const author = req.user.id;
  const image = req.file ? req.file.location : null;

  try {
    const blog = await createBlog(title, content, author, category, image);

    res.status(201).json({
      success: true,
      data: blog
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Controller to handle the form submission for creating a new blog post
export const postCreateBlog = async (req, res) => {
  const { title, content, category } = req.body;
  const author = req.user.id; // Assuming req.user contains the authenticated user's data
  const image = req.file ? req.file.location : null; // Full S3 URL if uploaded

  try {
    const newBlog = await createBlog(title, content, author, category, image); // Pass image to the model
    res.status(201).json({success:true,message:"Blog created successfully",data:newBlog});
 } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

export const viewBlog = async (req, res) => {
  const { id } = req.params;

  try {
    const blog = await getBlogById(id);

    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    // Fetch comments related to this blog
    const commentResult = await pool.query(`
      SELECT comments.*, users.name AS author_name
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.blog_id = $1
      ORDER BY comments.created_at DESC
    `, [id]);

    const comments = commentResult.rows;

    const likeCountResult = await pool.query(
      'SELECT COUNT(*) FROM reactions WHERE blog_id = $1 AND type = $2',
      [id, 'like']
    );

    const likeCount = parseInt(likeCountResult.rows[0].count, 10);

    res.json({
      success: true,
      data: {
        blog,
        comments,
        likeCount
      }
    });
  } catch (err) {
    console.error("Error fetching blog:", err);
    res.status(500).send('Server Error');
  }
};

// Handle like/dislike via AJAX
export const reactToBlog = async (req, res) => {
  const { id: blogId } = req.params;
  const userId = req.user.id;
  const { type } = req.body; // 'like' or 'dislike'

  if (!['like', 'dislike'].includes(type)) {
    return res.status(400).json({ message: 'Invalid reaction type' });
  }

  try {
    // Upsert reaction (either insert or update existing one)
    await pool.query(`
      INSERT INTO reactions (blog_id, user_id, type)
      VALUES ($1, $2, $3)
      ON CONFLICT (blog_id, user_id)
      DO UPDATE SET type = EXCLUDED.type, created_at = CURRENT_TIMESTAMP
    `, [blogId, userId, type]);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

// Get counts of likes and dislikes for a blog post
export const getReactions = async (req, res) => {
  const { id: blogId } = req.params;

  try {
    const likeRes = await pool.query(
      'SELECT COUNT(*) FROM reactions WHERE blog_id = $1 AND type = $2',
      [blogId, 'like']
    );
    const dislikeRes = await pool.query(
      'SELECT COUNT(*) FROM reactions WHERE blog_id = $1 AND type = $2',
      [blogId, 'dislike']
    );

    res.json({
      likes: parseInt(likeRes.rows[0].count, 10),
      dislikes: parseInt(dislikeRes.rows[0].count, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ likes: 0, dislikes: 0 });
  }
};

export const getBlogList = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit)||6, 1), 50);
    const offset = (page - 1) * limit;

    // total blogs count
    const totalResult = await pool.query(`SELECT COUNT(*) FROM blogs`);
    const total = parseInt(totalResult.rows[0].count);

    // fetch paginated blogs
    const blogsResult = await pool.query(
      `
      SELECT *
      FROM blogs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      blogs: blogsResult.rows,
    });
  } catch (error) {
    console.error("getBlogList pagination error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// Controller to fetch only the logged-in user's blogs
export const getMyBlogs = async (req, res) => {
  try {
    const userId = req.user.id; // Get the logged-in user's ID
    const blogs = await getAllMyBlogs(userId); // Fetch blogs where author matches userId
    res.json({success:true,data:blogs});
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// Controller to fetch a specific blog post for editing (GET request)
export const getEditBlog = async (req, res) => {
  const { id } = req.params;

  try {
    const blog = await getBlogById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Authorization check
    if (blog.author !== req.user.id && !isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own blogs'
      });
    }

    // Send blog data to frontend
    res.json({
      success: true,
      data: blog
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};


// Controller to handle the form submission for editing a blog post (POST request)
export const postEditBlog = async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const image = req.file ? req.file.location : null; // Full S3 URL if a new image was uploaded

  try {
    const blog = await getBlogById(id); // Use the getBlogByUserId function from the model
    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    // Authorization check
    if (blog.author !== req.user.id && !isAdmin(req)) {
      return res.status(403).send('You can only edit your own blogs');
    }

    // Update the blog with new data (image only replaced when a new file is uploaded)
    const updatedBlog = await updateBlog(id, title, content, image); // Use the updateBlog function from the model
    res.json({success:true,data:updatedBlog.id}); // Redirect to the individual blog post after editing
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

// Controller to handle the deletion of a blog post
export const handleDeleteBlog = async (req, res) => {
  const { id } = req.params;

  try {
    const blog = await getBlogById(id);  // Fetch the blog from the database
    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    // Check if the logged-in user is the author of the blog
    if (blog.author !== req.user.id && !isAdmin(req)) {
      return res.status(403).send('You can only delete your own blogs');
    }

    const deletedBlog = await deleteBlogFromModel(id); // Delete the blog
    res.json({success:true,message:'Blog deleted'}); // Redirect to the blogs list page after deletion
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
