import express from 'express';
import * as adminController from '../controllers/adminController.js';
import requireAuth from '../middleware/authMiddleware.js';
import requireAdmin from '../middleware/adminMiddleware.js';

const router = express.Router();

router.get('/adminpanel', requireAuth, requireAdmin, adminController.adminPanel);
router.get('/projects', requireAuth, requireAdmin, adminController.getAllProjects);
router.get('/users/:id/projects', requireAuth, requireAdmin, adminController.viewUserProjects);
router.delete('/projects/:id', requireAuth, requireAdmin, adminController.handleDeleteProject);
router.delete('/users/:id', requireAuth, requireAdmin, adminController.handleDeleteUser);

export default router;
