import express from 'express';
import * as projectController from '../controllers/projectController.js';
import requireAuth from '../middleware/authMiddleware.js';
import { upload } from '../config/s3Upload.js';
import { bodyValidator, validateProject } from '../middleware/validate.js';

const router = express.Router();

router.get('/', requireAuth, projectController.getProjectList);

router.get('/myprojects', requireAuth, projectController.getMyProjects);

router.get('/tags', requireAuth, projectController.handleGetTags);

router.post('/create', requireAuth, upload.single('image'), bodyValidator(validateProject), projectController.postCreateProject);

router.get('/:id', requireAuth, projectController.viewProject);

router.post('/:id/edit', requireAuth, upload.single('image'), projectController.postEditProject);

router.post('/:id/star', requireAuth, projectController.handleStar);

router.post('/:id/fork', requireAuth, projectController.handleFork);

router.post('/:id/collab', requireAuth, projectController.handleRequestCollab);

router.get('/:id/collab', requireAuth, projectController.handleGetCollabRequests);

router.put('/:id/collab/:requestId', requireAuth, projectController.handleUpdateCollabStatus);

router.delete('/:id', requireAuth, projectController.handleDeleteProject);

export default router;
