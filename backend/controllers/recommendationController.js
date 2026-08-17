// Phase 2 controllers: recommendations + corpus sync triggers.

import { recommendForUser } from "../services/recommendationService.js";
import { syncCuratedRepositories } from "../services/corpus/syncRepositories.js";
import { collectIssues } from "../services/corpus/collectIssues.js";
import { sendError, sendServerError } from "../utils/response.js";
import { emit } from "../utils/metrics.js";

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// GET /api/recommendations
export const recommendations = async (req, res) => {
  const {
    limit,
    offset,
    language,
    label,
    repository,
    min_score: minScore,
  } = req.query;

  try {
    const started = Date.now();
    const result = await recommendForUser(req.user.id, {
      limit: parsePositiveInt(limit, 10),
      offset: parsePositiveInt(offset, 0),
      language: language || null,
      label: label ? String(label).toLowerCase() : null,
      repository: repository || null,
      minScore: parsePositiveInt(minScore, 0),
    });
    emit("recommendations_generated", {
      userId: req.user.id,
      count: result.recommendations?.length,
      duration_ms: Date.now() - started,
    });
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// POST /api/corpus/repositories/sync — trigger metadata sync (idempotent).
export const syncRepositories = async (_req, res) => {
  try {
    const metrics = await syncCuratedRepositories();
    return res.json({ success: true, metrics });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// POST /api/corpus/issues/sync — trigger corpus ingestion (idempotent).
export const syncIssues = async (_req, res) => {
  try {
    const metrics = await collectIssues();
    return res.json({ success: true, metrics });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export { sendError };