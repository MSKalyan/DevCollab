import express from "express";
import { postLogin, postRegister, logout, updateProfile, googleLogin, refresh } from "../controllers/authController.js";
import requireAuth from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", postLogin);
router.post("/register", postRegister);
router.post("/logout", logout);
router.post("/google", googleLogin);
router.post("/refresh", refresh);
// 🔴 REQUIRED
router.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    role: req.user.role,
  });
});
router.put("/update", requireAuth, updateProfile);

export default router;
