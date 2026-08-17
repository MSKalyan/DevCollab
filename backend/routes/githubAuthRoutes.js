import express from "express";
import requireAuth from "../middleware/authMiddleware.js";
import { verifyAccessToken } from "../utils/tokenUtils.js";
import {
  initiateGithub,
  githubCallback,
} from "../controllers/githubController.js";

const router = express.Router();

// Soft auth for the callback: an authenticated session is expected (the browser
// carries the DevCollab cookies on the same-origin redirect), but we degrade to
// a redirect instead of a hard 401 if the cookie lapsed during the OAuth trip.
function softAuth(req, res, next) {
  const token = req.cookies?.access_token || req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      req.user = null;
    }
  }
  next();
}

// OAuth flow: initiation must be behind auth (users connect their own GitHub);
// the callback is same-origin so it carries the auth cookies.
router.get("/github", requireAuth, initiateGithub);
router.get("/github/callback", softAuth, githubCallback);

export default router;