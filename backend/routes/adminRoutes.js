import express from 'express';
import * as adminController from '../controllers/adminController.js';
import requireAuth from '../middleware/authMiddleware.js';
import requireAdmin from '../middleware/adminMiddleware.js';  // Import the requireAdmin middleware

const router = express.Router();
router.get('/adminpanel', requireAuth, requireAdmin, adminController.adminPanel);

router.get('/blogs', requireAuth, requireAdmin, adminController.getAllBlogs);

router.get('/users/:id/blogs', requireAuth, requireAdmin, adminController.viewUserBlogs);

router.delete('/blogs/:id', requireAuth, requireAdmin, adminController.handleDeleteBlog);

router.delete('/users/:id', requireAuth, requireAdmin, adminController.handleDeleteUser);

export default router;
