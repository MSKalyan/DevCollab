import express from 'express';
import requireAuth from '../middleware/authMiddleware.js';
import * as reviewController from '../controllers/reviewController.js';

const router = express.Router();

router.get('/project/:projectId', requireAuth, reviewController.getReviewsByProjectId);

router.post('/project/:projectId', requireAuth, reviewController.addReviewToProject);

router.post('/:reviewId/reply', requireAuth, reviewController.replyToReviewComment);

router.post('/:reviewId/react', requireAuth, reviewController.reactToReviewComment);

export default router;
