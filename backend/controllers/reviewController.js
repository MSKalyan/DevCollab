import { addReview, getReviewsByProject, getMyReactions, getReviewProjectId, replyToReview, reactToReview, getReviewCount } from '../models/reviewModel.js';
import { getProjectById } from '../models/projectModel.js';
import { sendError, sendServerError } from '../utils/response.js';
import { getCache, setCache, reviewCacheKey, touchProject, invalidateProjectReviews } from '../utils/cache.js';

export const getReviewsByProjectId = async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user?.id;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

  try {
    const project = await getProjectById(projectId);
    if (!project) return sendError(res, 404, 'Project not found');

    const cacheKey = reviewCacheKey(projectId, page, limit);
    let data = await getCache(cacheKey);

    if (!data) {
      const { reviews, total } = await getReviewsByProject(projectId, page, limit);
      const reviewCount = await getReviewCount(projectId);
      data = {
        reviews,
        reviewCount,
        total,
        page,
        limit,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      };
      await setCache(cacheKey, data);
    }

    if (userId && data.reviews.length > 0) {
      const reactions = await getMyReactions(userId, data.reviews.map((r) => r.id));
      data = {
        ...data,
        reviews: data.reviews.map((r) => ({ ...r, my_reaction: reactions[r.id] || null })),
      };
    }

    res.json({ success: true, data });
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
    await Promise.all([invalidateProjectReviews(projectId), touchProject(null)]);
    res.status(201).json({ success: true, data: { review } });
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

    await Promise.all([invalidateProjectReviews(reply.project_id), touchProject(null)]);
    res.status(201).json({ success: true, data: { reply } });
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
    const projectId = await getReviewProjectId(reviewId);
    if (projectId) await invalidateProjectReviews(projectId);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('reactToReview error:', err);
    return sendServerError(res, err);
  }
};
