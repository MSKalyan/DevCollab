import crypto from "crypto";

// Server-side GitHub OAuth App flow. The browser never sees the client secret:
// only the backend talks to GitHub with it.

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

// Stringent scope set for building an evidence graph from a user's history.
export const GITHUB_SCOPES = "read:user repo:status user:email read:org";

const STATE_COOKIE = "github_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function requireGithubConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL;
  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      "GitHub OAuth is not configured: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_CALLBACK_URL are required"
    );
  }
  return { clientId, clientSecret, callbackUrl };
}

export function generateState() {
  return crypto.randomBytes(24).toString("hex");
}

export function buildAuthorizeUrl(state) {
  const { clientId, callbackUrl } = requireGithubConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: GITHUB_SCOPES,
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: STATE_TTL_MS,
  };
}

export const STATE_COOKIE_NAME = STATE_COOKIE;

// Test seam: controllers resolve the GitHub identity via this resolver so tests
// can inject a stub without hitting the real GitHub API.
let identityResolver = null;
export function __setIdentityResolver(fn) {
  identityResolver = fn;
}

export async function resolveOAuthIdentity(accessToken) {
  if (typeof identityResolver === "function") {
    return identityResolver(accessToken);
  }
  const { createGithubClient } = await import("./githubClient.js");
  const { getAuthenticatedUser } = await import("./githubUser.js");
  const client = createGithubClient(accessToken);
  return getAuthenticatedUser(client);
}

// Test seam for the code -> token exchange step.
let exchangeImpl = null;
export function __setExchangeImpl(fn) {
  exchangeImpl = fn;
}

// Exchange the authorization code for a user access token.
export async function exchangeAuthorizationCode(code) {
  if (typeof exchangeImpl === "function") {
    return exchangeImpl(code);
  }
  const { clientId, clientSecret, callbackUrl } = requireGithubConfig();

  // GitHub accepts applic/json; use fetch so tests can stub global.fetch.
  const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("GitHub rejected the OAuth authorization code (unauthorized)");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "GitHub token exchange failed");
  }
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  if (!data.access_token) {
    throw new Error("GitHub did not return an access token");
  }

  let tokenExpiresAt = null;
  if (data.expires_in) {
    tokenExpiresAt = new Date(Date.now() + Number(data.expires_in) * 1000);
  }

  return {
    accessToken: data.access_token,
    tokenExpiresAt,
    refreshToken: data.refresh_token || null,
    scope: data.scope || "",
  };
}