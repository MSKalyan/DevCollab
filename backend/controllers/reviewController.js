import { addReview, getReviewsByProject, replyToReview, reactToReview, getReviewCount } from '../models/reviewModel.js';
import { getProjectById } from '../models/projectModel.js';
import { sendError, sendServerError } from '../utils/response.js';

export const getReviewsByProjectId = async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user?.id;

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');

    const reviews = await getReviewsByProject(projectId, userId);
    const reviewCount = await getReviewCount(projectId);

    res.json({ success: true, reviews, reviewCount });
  } catch (err) {
    console.error('getReviewsByProject error:', err);
    return sendServerError(res, err);
  }
};

export const addReviewToProject = async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const { content, rating } = req.body;

  if (!content || content.trim().length === 0) {
    return sendError(res, 400, 'Review cannot be empty');
  }

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');

    const review = await addReview(projectId, userId, content.trim(), rating || null, null);
    res.status(201).json({ success: true, review });
  } catch (err) {
    console.error('addReview error:', err);
    return sendServerError(res, err);
  }
};

export const replyToReviewComment = async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user.id;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return sendError(res, 400, 'Reply cannot be empty');
  }

  try {
    const reply = await replyToReview(reviewId, userId, content.trim());
    if (!reply) return sendError(res, 404, 'Parent review not found');

    res.status(201).json({ success: true, reply });
  } catch (err) {
    console.error('replyToReview error:', err);
    return sendServerError(res, err);
  }
};

export const reactToReviewComment = async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user.id;
  const { type } = req.body;

  if (!['like', 'dislike'].includes(type)) {
    return sendError(res, 400, 'Invalid reaction type');
  }

  try {
    const result = await reactToReview(reviewId, userId, type);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('reactToReview error:', err);
    return sendServerError(res, err);
  }
};
