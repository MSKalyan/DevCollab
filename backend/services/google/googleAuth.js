import { OAuth2Client } from "google-auth-library";

// Google Sign-In verification. The browser hands us an ID token (the `credential`
// from Google Identity Services); only the backend checks it against Google's
// keys, so a client cannot mint an identity by posting an email address.

// Test seam: tests inject a verifier so the suite never calls Google.
let verifier = null;
export function __setGoogleVerifier(fn) {
  verifier = fn;
}

export function isGoogleLoginConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

// Returns the normalized identity, or throws when the token is not a valid,
// unexpired ID token issued for this client id.
export async function verifyGoogleIdToken(credential) {
  if (typeof verifier === "function") {
    return verifier(credential);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google login is not configured: GOOGLE_CLIENT_ID is required");
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload() || {};

  return {
    subject: payload.sub || null,
    email: payload.email || null,
    // Google only reports this for an address it has actually confirmed; the
    // caller must refuse the sign-in when it is absent.
    emailVerified: payload.email_verified === true,
    name: payload.name || null,
    picture: payload.picture || null,
  };
}
