// Centralized response helpers so every error is JSON with a `message` field.
export function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

export function sendServerError(res, err, fallback = "Server error") {
  console.error(err);
  return res.status(500).json({ success: false, message: fallback });
}
