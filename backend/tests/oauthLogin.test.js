import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import dotenv from "dotenv";
dotenv.config();

// pg-mem by default; RUN_LIVE_DB_TESTS=1 (+ DATABASE_URL_TEST) to use real PG.
process.env.DATABASE_URL =
  process.env.RUN_LIVE_DB_TESTS === "1"
    ? process.env.DATABASE_URL_TEST || "pg-mem:"
    : "pg-mem:";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.GITHUB_CLIENT_ID = "test_client_id";
// GitHub OAuth Apps register exactly one callback URL, shared by the sign-in and
// connect flows; there is no separate login callback to configure.
process.env.GITHUB_CALLBACK_URL = "http://localhost:5000/api/auth/github/callback";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY || "test-encryption-key-do-not-use-in-prod";
// Several unauthenticated auth calls per case; the production budget would
// throttle the suite before its assertions ran.
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = await import("../app.js").then((m) => m.default);
// app.js re-runs dotenv.config(), which would repopulate SMTP_HOST from .env.
// Delete it after the import so the mailer falls back to the dev outbox and the
// "was a verification email queued?" checks read real state.
delete process.env.SMTP_HOST;

const { __setGoogleVerifier } = await import("../services/google/googleAuth.js");
const { __setIdentityResolver, __setExchangeImpl } = await import(
  "../services/github/githubAuth.js"
);
const { getDevOutbox } = await import("../utils/mailer.js");
const { registerVerifiedUser, registerPendingUser, uniqueEmail } = await import(
  "./helpers/authFlow.js"
);
const pool = (await import("../models/db.js")).default;

const LOGIN_STATE_COOKIE = "github_login_state";
const FRONTEND_URL = "http://localhost:3000";
const CALLBACK_PATH = "/api/auth/github/callback";
// The shared endpoint both GitHub flows post back to.
const CALLBACK_URL = "http://localhost:5000/api/auth/github/callback";

after(() => {
  __setGoogleVerifier(null);
  __setExchangeImpl(null);
  __setIdentityResolver(null);
});

function parseCookieValue(cookies, name) {
  for (const c of cookies || []) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

async function userRowsFor(email) {
  const { rows } = await pool.query(
    "SELECT id, email_verified, google_id, password FROM users WHERE LOWER(email) = LOWER($1)",
    [email]
  );
  return rows;
}

function mailCountFor(email) {
  return getDevOutbox().filter((m) => m.to === email).length;
}

// Starts the public sign-in flow and returns the CSRF state it issued, exactly
// as the browser would replay it on the callback.
async function startGithubLogin() {
  const res = await request(app).get("/api/auth/github/login");
  assert.equal(res.status, 200, `initiate failed: ${JSON.stringify(res.body)}`);
  const state = parseCookieValue(res.headers["set-cookie"], LOGIN_STATE_COOKIE);
  assert.ok(state, "github_login_state cookie issued");
  return { state, url: res.body.data.url };
}

describe("POST /api/auth/google", () => {
  test("a verified Google identity signs the user in and creates the account verified", async () => {
    const email = uniqueEmail("google_new");
    __setGoogleVerifier(async () => ({
      subject: `gsub-${email}`.slice(0, 64),
      email,
      emailVerified: true,
      name: "Google New",
      picture: "https://example.com/p.png",
    }));

    const res = await request(app).post("/api/auth/google").send({ credential: "id-token" });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.email_verified, true);
    assert.equal(res.body.data.user.has_password, false);

    const cookies = res.headers["set-cookie"];
    assert.ok(cookies, "Google sign-in starts a session");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    assert.equal(me.status, 200);
    assert.equal(me.body.email, email);
    assert.equal(me.body.name, "Google New");
    assert.equal(me.body.email_verified, true);
    assert.equal(me.body.has_google, true);

    // OAuth-only: there is no password to sign in with.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    assert.equal(login.status, 400);
    assert.match(login.body.message, /no password/i);
  });

  test("a repeat sign-in with the same identity resumes the same account", async () => {
    const email = uniqueEmail("google_repeat");
    __setGoogleVerifier(async () => ({
      subject: `gsub-${email}`.slice(0, 64),
      email,
      emailVerified: true,
      name: "Google Repeat",
      picture: null,
    }));

    const first = await request(app).post("/api/auth/google").send({ credential: "id-token" });
    assert.equal(first.status, 200);
    const second = await request(app).post("/api/auth/google").send({ credential: "id-token" });
    assert.equal(second.status, 200);

    assert.equal(second.body.data.user.id, first.body.data.user.id, "same account resumed");
    const rows = await userRowsFor(email);
    assert.equal(rows.length, 1, "no duplicate row for the address");
  });

  test("an unverified Google address is refused without a session", async () => {
    __setGoogleVerifier(async () => ({
      subject: "gsub-unverified",
      email: uniqueEmail("google_unverified"),
      emailVerified: false,
      name: "Unverified",
      picture: null,
    }));

    const res = await request(app).post("/api/auth/google").send({ credential: "id-token" });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.headers["set-cookie"], undefined);
  });

  test("a verifier that rejects the token is a 401 without a session", async () => {
    __setGoogleVerifier(async () => {
      throw new Error("bad token");
    });

    const res = await request(app).post("/api/auth/google").send({ credential: "forged" });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.headers["set-cookie"], undefined);
  });

  test("a missing credential is a 400", async () => {
    __setGoogleVerifier(async () => {
      throw new Error("must not be reached");
    });

    const res = await request(app).post("/api/auth/google").send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.headers["set-cookie"], undefined);
  });

  test("matching an existing verified password account links instead of duplicating", async () => {
    const email = uniqueEmail("google_link");
    const { cookies: sessionBefore } = await registerVerifiedUser({
      name: "Link Target",
      email,
      password: "password123",
    });
    const before = await userRowsFor(email);
    assert.equal(before.length, 1);

    const subject = `gsub-link-${email}`.slice(0, 64);
    __setGoogleVerifier(async () => ({
      subject,
      email,
      emailVerified: true,
      name: "Link Target",
      picture: null,
    }));

    const res = await request(app).post("/api/auth/google").send({ credential: "id-token" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, before[0].id, "the existing account is reused");

    const after = await userRowsFor(email);
    assert.equal(after.length, 1, "no duplicate row created");
    assert.equal(after[0].google_id, subject, "the Google identity was linked");

    const me = await request(app).get("/api/auth/me").set("Cookie", res.headers["set-cookie"]);
    assert.equal(me.body.has_google, true);
    assert.equal(me.body.has_password, true);

    // Password sign-in keeps working alongside Google, and the session issued
    // before the link still identifies the same account.
    const withGoogle = await request(app).get("/api/auth/me").set("Cookie", sessionBefore);
    assert.equal(withGoogle.status, 200);
    assert.equal(withGoogle.body.id, before[0].id);

    const passwordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    assert.equal(passwordLogin.status, 200);
  });
});

describe("GET /api/auth/github/login", () => {
  test("is public and returns an authorize URL plus the state cookie", async () => {
    const res = await request(app).get("/api/auth/github/login");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const url = new URL(res.body.data.url);
    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "test_client_id");
    assert.equal(url.searchParams.get("scope"), "read:user user:email");
    assert.equal(url.searchParams.get("redirect_uri"), CALLBACK_URL);

    const state = url.searchParams.get("state");
    assert.ok(state, "authorize URL carries a state");
    assert.equal(parseCookieValue(res.headers["set-cookie"], LOGIN_STATE_COOKIE), state);

    // The state cookie must not travel outside the auth API.
    const cookie = res.headers["set-cookie"].find((c) => c.startsWith(`${LOGIN_STATE_COOKIE}=`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/auth/i);
  });
});

describe("GET /api/auth/github/callback (sign-in flow)", () => {
  test("an anonymous callback with no state cookie fails closed", async () => {
    const res = await request(app).get(`${CALLBACK_PATH}?code=abc&state=whatever`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?error=invalid_state`);
  });

  test("an anonymous callback with a mismatched state fails closed", async () => {
    const { state } = await startGithubLogin();
    const res = await request(app)
      .get(`${CALLBACK_PATH}?code=abc&state=not-the-state`)
      .set("Cookie", `${LOGIN_STATE_COOKIE}=${state}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?error=invalid_state`);
  });

  test("a denied authorization is surfaced to the frontend", async () => {
    const { state } = await startGithubLogin();
    const res = await request(app)
      .get(`${CALLBACK_PATH}?error=access_denied&state=${state}`)
      .set("Cookie", `${LOGIN_STATE_COOKIE}=${state}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?error=access_denied`);
  });

  test("a matching state with no code asks for a code", async () => {
    const { state } = await startGithubLogin();
    const res = await request(app)
      .get(`${CALLBACK_PATH}?state=${state}`)
      .set("Cookie", `${LOGIN_STATE_COOKIE}=${state}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?error=missing_code`);
  });

  test("a failed exchange redirects to the generic login failure", async () => {
    const { state } = await startGithubLogin();
    __setExchangeImpl(async () => {
      throw new Error("GitHub is down");
    });
    __setIdentityResolver(async () => {
      throw new Error("must not be reached");
    });

    const res = await request(app)
      .get(`${CALLBACK_PATH}?code=abc&state=${state}`)
      .set("Cookie", `${LOGIN_STATE_COOKIE}=${state}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?error=github_login_failed`);
    assert.equal(
      res.headers["set-cookie"].some((c) => c.startsWith("access_token=")),
      false,
      "a failed sign-in sets no session"
    );
  });

  test("an authenticated callback still belongs to the connect flow", async () => {
    // No login cookie but a valid session: this is a connect attempt, so a bad
    // state must redirect to the GitHub settings page, not to /login.
    const { cookies } = await registerVerifiedUser({ email: uniqueEmail("gh_dispatch") });
    const res = await request(app)
      .get(`${CALLBACK_PATH}?code=abc&state=wrong`)
      .set("Cookie", cookies);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/github?error=invalid_state`);
  });

  test("success creates an already-verified account, starts the session, and mails nothing", async () => {
    const email = uniqueEmail("gh_new");
    __setExchangeImpl(async () => ({ accessToken: "gh_token_secret_xyz" }));
    __setIdentityResolver(async () => ({
      id: 9001,
      login: "octologin",
      name: "Octo Login",
      email,
    }));

    const { state } = await startGithubLogin();
    const mailsBefore = mailCountFor(email);

    const res = await request(app)
      .get(`${CALLBACK_PATH}?code=goodcode&state=${state}`)
      .set("Cookie", `${LOGIN_STATE_COOKIE}=${state}`);

    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?github=1`, "success marker redirect");

    const cookies = res.headers["set-cookie"];
    assert.ok(cookies.some((c) => c.startsWith("access_token=")), "access cookie set");
    assert.ok(cookies.some((c) => c.startsWith("refresh_token=")), "refresh cookie set");

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    assert.equal(me.status, 200, "the session from the OAuth callback works");
    assert.equal(me.body.email, email);
    assert.equal(me.body.name, "Octo Login");
    assert.equal(me.body.email_verified, true, "GitHub vouched for the address");
    assert.equal(me.body.has_password, false);

    const rows = await userRowsFor(email);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email_verified, true);

    // No OTP round-trip: nothing was queued for an address GitHub already proved.
    assert.equal(mailCountFor(email), mailsBefore);
  });

  test("signing in an existing unverified account verifies it without an OTP", async () => {
    const email = uniqueEmail("gh_pending");
    await registerPendingUser({ name: "Pending Local", email, password: "password123" });
    const pending = await userRowsFor(email);
    assert.equal(pending[0].email_verified, false);

    __setExchangeImpl(async () => ({ accessToken: "gh_token_secret_pending" }));
    __setIdentityResolver(async () => ({
      id: 9002,
      login: "pendinglocal",
      name: "Pending Local",
      email,
    }));

    const { state } = await startGithubLogin();
    const mailsBefore = mailCountFor(email);

    const res = await request(app)
      .get(`${CALLBACK_PATH}?code=goodcode&state=${state}`)
      .set("Cookie", `${LOGIN_STATE_COOKIE}=${state}`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `${FRONTEND_URL}/login?github=1`);

    const me = await request(app).get("/api/auth/me").set("Cookie", res.headers["set-cookie"]);
    assert.equal(me.status, 200);
    assert.equal(me.body.id, pending[0].id, "the pending account is the one signed in");
    assert.equal(me.body.email_verified, true, "marked verified by GitHub");

    const rows = await userRowsFor(email);
    assert.equal(rows.length, 1, "no duplicate account created");
    assert.equal(rows[0].email_verified, true);
    assert.ok(rows[0].password, "the local password survives the OAuth sign-in");

    // No new code was emailed: there was no verification step to complete.
    assert.equal(mailCountFor(email), mailsBefore);

    // The account can still use its password afterwards.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    assert.equal(login.status, 200);
  });
});
