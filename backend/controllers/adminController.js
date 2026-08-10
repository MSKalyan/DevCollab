import { getAllUsers, fetchAllProjects, getUserById, getUserProjects, getUserNameById, deleteUser, deleteProject } from '../models/adminModel.js';
import pool from '../models/db.js';
import { sendError, sendServerError } from "../utils/response.js";
import { invalidateProject, invalidateAllProjectsCache } from '../utils/cache.js';

export const adminPanel = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search || '';
    const role = req.query.role || '';

    // Fetch filtered users
    const users = await getAllUsers(page, limit, search, role);

    // Count total users with the same filters
    const filterParams = [`%${search}%`];
    let filterQuery = `
      SELECT COUNT(*) FROM users
      WHERE name != 'admin'
      AND (name ILIKE $1 OR email ILIKE $1)
    `;
    if (role) {
      filterQuery += ` AND role = $2`;
      filterParams.push(role);
    }
    const countResult = await pool.query(filterQuery, filterParams);
    const totalUsers = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      data: {
        user: req.user,
        users,
        pagination: {
          currentPage: page,
          totalPages,
          limit
        },
        filters: {
          search,
          role
        }
      }
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// List all projects across users for the admin panel.
export const getAllProjects = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search || '';
    const category = req.query.category || '';

    const projects = await fetchAllProjects(page, limit, search, category);

    const filterParams = [`%${search}%`];
    let filterQuery = `
      SELECT COUNT(*) FROM projects
      WHERE (title ILIKE $1 OR description ILIKE $1)
    `;
    if (category) {
      filterQuery += ` AND category = $2`;
      filterParams.push(category);
    }
    const countResult = await pool.query(filterQuery, filterParams);
    const totalProjects = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProjects / limit);

    res.json({
      success: true,
      data: {
        projects,
        pagination: {
          currentPage: page,
          totalPages,
          limit,
          totalProjects
        },
        filters: {
          search,
          category
        }
      }
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const viewUserProjects = async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const search = req.query.search || '';
  const category = req.query.category || '';

  try {
    const projects = await getUserProjects(id, page, limit, search, category);

    const result = await pool.query(
      'SELECT COUNT(*) FROM projects WHERE owner_id = $1 AND (title ILIKE $2 OR description ILIKE $2) AND ($3 = \'\' OR category = $3)',
      [id, `%${search}%`, category]
    );
    const userName = await getUserNameById(id);
    const totalProjects = parseInt(result.rows[0].count);
    const totalPages = Math.ceil(totalProjects / limit);

    res.json({
      success: true,
      data: {
        user: {
          id,
          name: userName
        },
        projects,
        pagination: {
          currentPage: page,
          totalPages,
          limit,
          totalProjects
        },
        filters: {
          search,
          category
        }
      }
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// Delete a specific user's project
export const handleDeleteProject = async (req, res) => {
  const { id } = req.params;
  try {
    await deleteProject(id);
    await invalidateProject(id);
    res.json({ success: true, message: "deleted successfully" });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// Delete a user
export const handleDeleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    await deleteUser(id);
    await invalidateAllProjectsCache();
    res.json({ success: true, message: "Operation completed successfully" });
  } catch (err) {
    return sendServerError(res, err);
  }
};
