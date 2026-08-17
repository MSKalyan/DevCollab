import { getAllUsers, fetchAllProjects, getUserProjects, getUserNameById, deleteUser, deleteProject } from '../models/adminModel.js';
import { sendError, sendServerError } from "../utils/response.js";
import { touchProject, touchTags, invalidateAllProjectsCache } from '../utils/cache.js';

export const adminPanel = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search || '';
    const role = req.query.role || '';

    // Fetch filtered users
    const { users, total: totalUsers } = await getAllUsers(page, limit, search, role);
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

    const { projects, total: totalProjects } = await fetchAllProjects(page, limit, search, category);
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
    const { projects, total: totalProjects } = await getUserProjects(id, page, limit, search, category);

    const userName = await getUserNameById(id);
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
    await touchProject(id);
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
