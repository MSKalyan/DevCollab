import express from "express";
import requireAuth from "../middleware/authMiddleware.js";
import {
  acceptRequest,
  rejectRequest,
  listChats,
  getMessages,
  send,
} from "../controllers/chatController.js";

const router = express.Router();

// Contact request lifecycle (recipient only).
router.post("/contact-requests/:id/accept", requireAuth, acceptRequest);
router.post("/contact-requests/:id/reject", requireAuth, rejectRequest);

// Chat between users whose contact request was accepted.
router.get("/chats", requireAuth, listChats);
router.get("/chats/:id/messages", requireAuth, getMessages);
router.post("/chats/:id/messages", requireAuth, send);

export default router;