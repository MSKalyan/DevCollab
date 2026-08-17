import express from "express";
import { postLogin, postRegister, logout, updateProfile, googleLogin, refresh, listDevelopers, getDeveloperProfile, requestContact, me } from "../controllers/authController.js";
import requireAuth from "../middleware/authMiddleware.js";
import { bodyValidator, validateLogin, validateRegister } from "../middleware/validate.js";

const router = express.Router();

router.post("/login", bodyValidator(validateLogin), postLogin);
router.post("/register", bodyValidator(validateRegister), postRegister);
router.post("/logout", logout);
router.post("/google", googleLogin);
router.post("/refresh", refresh);
router.get("/developers", requireAuth, listDevelopers);
router.get("/developers/:id", requireAuth, getDeveloperProfile);
router.post("/developers/:id/contact", requireAuth, requestContact);
router.get("/me", requireAuth, me);
router.put("/update", requireAuth, updateProfile);

export default router;
