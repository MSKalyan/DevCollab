import {
  GITHUB_LOGIN_SCOPES,
  LOGIN_STATE_COOKIE_NAME,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generateState,
  loginStateCookieOptions,
  resolveOAuthIdentity,
  resolveVerifiedEmail,
  stateCookieOptions,
} from "../services/github/githubAuth.js";
import { createUser, getUserByEmail, markEmailVerified } from "../models/userModel.js";
import { startSession } from "../services/auth/session.js";
import { sendServerError } from "../utils/response.js";

// GitHub sign-in: authenticate an existing DevCollab account, or create one from
// a verified GitHub identity. Deliberately separate from the /github connect
// flow, which links a repository-reading token to an already signed-in user.

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const loginRedirect = (params = "") => `${frontendUrl()}/login${params}`;

// 1) Start the flow: no session required, this is what a signed-out visitor
// clicks. The state cookie is scoped to /api/auth and verified at the callback.
export const initiateGithubLogin = (req, res) => {
  const state = generateState();
  res.cookie(LOGIN_STATE_COOKIE_NAME, state, loginStateCookieOptions());
  try {
    const url = buildAuthorizeUrl(state, { scopes: GITHUB_LOGIN_SCOPES });
    return res.json({ success: true, data: { url } });
  } catch (err) {
    return sendServerError(res, err, "GitHub login is not configured");
  }
};

// 2) Called by the shared /github/callback endpoint when the request belongs to
// the sign-in flow. Owns its own CSRF check and always ends in a frontend
// redirect: the browser arrived here by top-level navigation, so a JSON error
// would strand the user on a blank page.
export const completeGithubLogin = async (req, res, code, state) => {
  const redirectErr = (reason) =>
    res.redirect(loginRedirect(`?error=${encodeURIComponent(reason)}`));

  // CSRF: fail closed when state is missing or does not match the cookie the
  // sign-in initiation set.
  if (!state || state !== req.cookies?.[LOGIN_STATE_COOKIE_NAME]) {
    return redirectErr("invalid_state");
  }
  res.clearCookie(LOGIN_STATE_COOKIE_NAME, stateCookieOptions());

  if (req.query.error) return redirectErr(req.query.error);
  if (!code) return redirectErr("missing_code");

  try {
    const { accessToken } = await exchangeAuthorizationCode(code);
    const identity = await resolveOAuthIdentity(accessToken);
    const email = await resolveVerifiedEmail(accessToken, identity);

    if (!email) return redirectErr("github_email_unavailable");

    let user = await getUserByEmail(email);
    if (!user) {
      user = await createUser({
        name: identity.name || identity.login || email,
        email,
        // GitHub verified this address for this identity, so the account starts
        // verified — there is no code to send to an address just proved.
        emailVerified: true,
      });
    } else if (!user.email_verified) {
      // GitHub asserting the same verified address is proof enough to confirm a
      // pending local account without an OTP round-trip.
      user = (await markEmailVerified(user.id)) || user;
    }

    await startSession(res, user);
    // The marker tells /login the browser is returning from a successful GitHub
    // redirect and should re-read the session it just established.
    return res.redirect(loginRedirect("?github=1"));
  } catch (err) {
    console.error("GitHub login failed:", err?.message || err);
    return redirectErr("github_login_failed");
  }
};
