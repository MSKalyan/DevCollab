import crypto from "crypto";

// AES-256-GCM encryption for GitHub access tokens at rest.
// The key is derived from GITHUB_TOKEN_ENCRYPTION_KEY (a separate secret from
// JWT_SECRET, enforced at load time). Plaintext tokens never enter logs or APIs.

const ALGORITHM = "aes-256-gcm";

function getKey() {
  const raw = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "GITHUB_TOKEN_ENCRYPTION_KEY is required (a long random string, keep it separate from JWT_SECRET)"
    );
  }
  // Derive a fixed 32-byte key from any-length secret.
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptGithubToken(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv:authTag:encrypted — hex encoded, URL/file safe.
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptGithubToken(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted token payload");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskToken(token) {
  if (!token) return "";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}