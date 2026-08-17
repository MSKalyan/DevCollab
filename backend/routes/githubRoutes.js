import express from "express";
import requireAuth from "../middleware/authMiddleware.js";
import {
  status,
  evidence,
  triggerBackfill,
  disconnectGithub,
} from "../controllers/githubController.js";

const router = express.Router();

// All github endpoints are tied to the authenticated DevCollab user.
router.get("/status", requireAuth, status);
router.get("/evidence", requireAuth, evidence);
router.post("/backfill", requireAuth, triggerBackfill);
router.delete("/disconnect", requireAuth, disconnectGithub);

export default router;