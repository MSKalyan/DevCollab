import express from 'express';
import * as adminController from '../controllers/adminController.js';
import requireAuth from '../middleware/authMiddleware.js';
import requireAdmin from '../middleware/adminMiddleware.js';

const router = express.Router();

router.get('/adminpanel', requireAuth, requireAdmin, adminController.adminPanel);
router.delete('/users/:id', requireAuth, requireAdmin, adminController.handleDeleteUser);

export default router;
