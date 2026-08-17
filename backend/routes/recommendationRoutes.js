import express from "express";
import requireAuth from "../middleware/authMiddleware.js";
import {
  recommendations,
  syncRepositories,
  syncIssues,
} from "../controllers/recommendationController.js";

const router = express.Router();

// Recommendations are user-specific; token authentication is required.
router.get("/recommendations", requireAuth, recommendations);

// Corpus sync triggers (manual, idempotent). These run synchronously so the
// caller sees the metrics; the background worker also runs them on a schedule.
router.post("/corpus/repositories/sync", requireAuth, syncRepositories);
router.post("/corpus/issues/sync", requireAuth, syncIssues);

export default router;