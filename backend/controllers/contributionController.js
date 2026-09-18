// Contribution agent surface: analyzed capability + working style, plus
// open-source recommendations matched to that analysis.
//
// Distinct from GET /api/recommendations (the deterministic Ranker v1 view);
// this endpoint exposes the richer agent pipeline.

import { recommendContributions } from "../services/agent/index.js";
import { sendServerError } from "../utils/response.js";
import { emit } from "../utils/metrics.js";
import { WORK_TYPE_CATEGORIES } from "../config/labelTaxonomy.js";

const DIFFICULTIES = new Set(["starter", "moderate", "involved", "deep"]);
const WORK_TYPES = new Set(WORK_TYPE_CATEGORIES.map((c) => c.workType));

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// GET /api/contributions
export const contributions = async (req, res) => {
  const { limit, offset, language, label, repository, difficulty, work_type: workType } = req.query;

  try {
    const started = Date.now();
    const result = await recommendContributions(req.user.id, {
      limit: parsePositiveInt(limit, 10),
      offset: parsePositiveInt(offset, 0),
      language: language || null,
      label: label ? String(label).toLowerCase() : null,
      repository: repository || null,
      // Ignore unrecognized filter values rather than returning an empty set.
      difficulty: DIFFICULTIES.has(difficulty) ? difficulty : null,
      workType: WORK_TYPES.has(workType) ? workType : null,
    });

    emit("contributions_generated", {
      userId: req.user.id,
      count: result.recommendations?.length,
      level: result.profile?.capability?.level || null,
      generated_by: result.profile?.generated_by || null,
      duration_ms: Date.now() - started,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    return sendServerError(res, err);
  }
};
