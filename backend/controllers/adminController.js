import { getAllUsers, getUserNameById, deleteUser } from '../models/adminModel.js';
import { sendError, sendServerError } from "../utils/response.js";

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

// Delete a user
export const handleDeleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    await deleteUser(id);
    res.json({ success: true, message: "Operation completed successfully" });
  } catch (err) {
    return sendServerError(res, err);
  }
};
