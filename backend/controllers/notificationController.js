import { listIncomingRequests } from "../models/notificationModel.js";
import { sendServerError } from "../utils/response.js";

// GET /api/notifications — incoming contact + collaboration requests.
export const getNotifications = async (req, res) => {
  try {
    const requests = await listIncomingRequests(req.user.id);
    res.json({ success: true, data: { requests, total: requests.length } });
  } catch (err) {
    return sendServerError(res, err);
  }
};