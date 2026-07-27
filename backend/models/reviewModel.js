import pool from './db.js';

export const addReview = async (projectId, userId, content, rating, parentReviewId) => {
  const result = await pool.query(
    `INSERT INTO reviews (project_id, user_id, content, rating, parent_review_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, userId, content, rating || null, parentReviewId || null]
  );
  return result.rows[0];
};

export const getReviewsByProject = async (projectId, userId) => {
  const result = await pool.query(
    `SELECT r.*,
      u.name AS reviewer_name,
      u.avatar AS reviewer_avatar,
      COALESCE(lk.likes, 0) AS likes,
      COALESCE(dl.dislikes, 0) AS dislikes,
      MAX(CASE WHEN rr.user_id = $2 THEN rr.type ELSE NULL END) AS my_reaction
    FROM reviews r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN (SELECT review_id, COUNT(*) AS likes FROM review_reactions WHERE type = 'like' GROUP BY review_id) lk ON lk.review_id = r.id
    LEFT JOIN (SELECT review_id, COUNT(*) AS dislikes FROM review_reactions WHERE type = 'dislike' GROUP BY review_id) dl ON dl.review_id = r.id
    LEFT JOIN review_reactions rr ON rr.review_id = r.id
    WHERE r.project_id = $1
    GROUP BY r.id, u.name, u.avatar, lk.likes, dl.dislikes
    ORDER BY r.created_at ASC`,
    [projectId, userId || null]
  );
  return result.rows;
};

export const replyToReview = async (parentReviewId, userId, content) => {
  const parent = await pool.query('SELECT project_id FROM reviews WHERE id = $1', [parentReviewId]);
  if (parent.rows.length === 0) return null;

  const result = await pool.query(
    `INSERT INTO reviews (project_id, user_id, content, parent_review_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [parent.rows[0].project_id, userId, content, parentReviewId]
  );
  return result.rows[0];
};

export const reactToReview = async (reviewId, userId, type) => {
  const existing = await pool.query(
    'SELECT type FROM review_reactions WHERE review_id = $1 AND user_id = $2',
    [reviewId, userId]
  );

  if (existing.rows.length > 0) {
    if (existing.rows[0].type === type) {
      await pool.query('DELETE FROM review_reactions WHERE review_id = $1 AND user_id = $2', [reviewId, userId]);
      return { status: 'removed' };
    }
    await pool.query('UPDATE review_reactions SET type = $1 WHERE review_id = $2 AND user_id = $3', [type, reviewId, userId]);
    return { status: 'updated' };
  }

  await pool.query('INSERT INTO review_reactions (review_id, user_id, type) VALUES ($1, $2, $3)', [reviewId, userId, type]);
  return { status: 'created' };
};

export const getReviewCount = async (projectId) => {
  const result = await pool.query('SELECT COUNT(*) FROM reviews WHERE project_id = $1', [projectId]);
  return parseInt(result.rows[0].count);
};
