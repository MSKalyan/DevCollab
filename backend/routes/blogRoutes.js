import express from 'express';
import * as blogController from '../controllers/blogController.js';
import requireAuth from '../middleware/authMiddleware.js';
import { upload } from '../config/s3Upload.js';

const router = express.Router();


router.get('/', requireAuth, blogController.getBlogList);

router.get('/myblogs', requireAuth, blogController.getMyBlogs);

// router.get('/create', requireAuth, blogController.getCreateBlog);
router.post('/create', requireAuth, upload.single('image'), blogController.postCreateBlog);

router.get('/:id', requireAuth, blogController.viewBlog);

// router.get('/:id/edit', requireAuth, blogController.getEditBlog);
router.post('/:id/edit', requireAuth, upload.single('image'), blogController.postEditBlog);

router.post('/:id/react', requireAuth, blogController.reactToBlog);

router.get('/:id/reactions', blogController.getReactions);

// router.get('/:id/delete', requireAuth, blogController.handleDeleteBlog);

export default router;
