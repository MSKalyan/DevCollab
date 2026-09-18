import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function createRefreshToken() {
  const token = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );
  return { token, expiresAt };
}


const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60;

// Reset tokens are stored as SHA-256 digests: a leaked database row cannot be
// replayed against the API, and the raw token only ever travels by email.
export function hashPasswordResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000
  );
  return { token, tokenHash: hashPasswordResetToken(token), expiresAt };
}
export function isProduction() {
  return process.env.NODE_ENV === "production";
}

// Attach access + refresh tokens as httpOnly cookies on the response.
export function setAuthCookies(res, accessToken, refreshToken, refreshExpiresAt) {
  const baseCookie = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? "none" : "lax",
    path: "/",
  };

  res.cookie("access_token", accessToken, {
    ...baseCookie,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refresh_token", refreshToken, {
    ...baseCookie,
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    expires: refreshExpiresAt,
  });
}

export function clearAuthCookies(res) {
  const baseCookie = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? "none" : "lax",
    path: "/",
  };
  res.clearCookie("access_token", baseCookie);
  res.clearCookie("refresh_token", baseCookie);
}
