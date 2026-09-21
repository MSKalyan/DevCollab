import crypto from "crypto";

// Email verification one-time codes. Codes are short and human-transcribed, so
// their security comes from the attempt cap, the expiry, the per-IP limiter, and
// a short resend cooldown — not from entropy.
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

// Uniform over the whole code space: rejection sampling instead of a modulo,
// which would bias the first digits.
export function generateOtp() {
  const space = 10 ** OTP_LENGTH;
  const limit = Math.floor(0xffffffff / space) * space;
  let value;
  do {
    value = crypto.randomBytes(4).readUInt32BE(0);
  } while (value >= limit);
  return String(value % space).padStart(OTP_LENGTH, "0");
}

// Codes are stored as SHA-256 digests for the same reason as password reset
// tokens: a leaked database row cannot be replayed against the API.
export function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

// Digest comparison in constant time so a wrong code cannot be narrowed down
// by response timing.
export function otpMatches(code, codeHash) {
  const candidate = Buffer.from(hashOtp(code), "hex");
  const stored = Buffer.from(String(codeHash || ""), "hex");
  if (stored.length !== candidate.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

export function otpExpiresAt(now = Date.now()) {
  return new Date(now + OTP_TTL_MINUTES * 60 * 1000);
}

// Seconds the caller must still wait before another code may be mailed.
export function resendCooldownRemaining(createdAt, now = Date.now()) {
  if (!createdAt) return 0;
  const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000);
  return Math.max(0, OTP_RESEND_COOLDOWN_SECONDS - elapsed);
}
