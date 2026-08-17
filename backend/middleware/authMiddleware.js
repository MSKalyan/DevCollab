import { verifyAccessToken } from "../utils/tokenUtils.js";

// Prefer the httpOnly cookie; fall back to a bearer header for non-browser clients.
function extractToken(req) {
  const cookieToken = req.cookies && req.cookies.access_token;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  return authHeader && authHeader.split(" ")[1];
}

function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
}

export default requireAuth;
