import express from "express";
import requireAuth from "../middleware/authMiddleware.js";
import { exploreProjects } from "../controllers/exploreController.js";

const router = express.Router();

// Discovery requires an authenticated session so it works with cookie auth.
router.get("/projects", requireAuth, exploreProjects);

export default router;