import {
  acceptContactRequest,
  rejectContactRequest,
  isConversationParticipant,
  listConversationsForUser,
  listMessages,
  sendMessage,
} from "../models/chatModel.js";
import { sendError, sendServerError } from "../utils/response.js";

// POST /api/contact-requests/:id/accept — recipient accepts, opens a chat.
export const acceptRequest = async (req, res) => {
  try {
    const request = await acceptContactRequest(Number(req.params.id), req.user.id);
    if (!request) return sendError(res, 404, "Contact request not found");
    return res.json({ success: true, message: "Request accepted", data: { request } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// POST /api/contact-requests/:id/reject — recipient declines.
export const rejectRequest = async (req, res) => {
  try {
    const request = await rejectContactRequest(Number(req.params.id), req.user.id);
    if (!request) return sendError(res, 404, "Contact request not found");
    return res.json({ success: true, message: "Request rejected", data: { request } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// GET /api/chats — the current user's conversations.
export const listChats = async (req, res) => {
  try {
    const conversations = await listConversationsForUser(req.user.id);
    res.json({ success: true, data: { conversations } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// GET /api/chats/:id/messages — message history (marks incoming as read).
export const getMessages = async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    if (!(await isConversationParticipant(conversationId, req.user.id))) {
      return sendError(res, 403, "You are not part of this conversation");
    }
    const messages = await listMessages(conversationId, req.user.id);
    res.json({ success: true, data: { messages } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

// POST /api/chats/:id/messages — send a message in a conversation.
export const send = async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    const body = req.body?.body?.trim();
    if (!body) return sendError(res, 400, "A message is required");
    if (!(await isConversationParticipant(conversationId, req.user.id))) {
      return sendError(res, 403, "You are not part of this conversation");
    }
    const message = await sendMessage(conversationId, req.user.id, body);
    res.status(201).json({ success: true, data: { message } });
  } catch (err) {
    return sendServerError(res, err);
  }
};