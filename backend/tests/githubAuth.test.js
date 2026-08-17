import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import dotenv from "dotenv";
dotenv.config();

// pg-mem by default; RUN_LIVE_DB_TESTS=1 (+ DATABASE_URL_TEST) to use real PG.
process.env.DATABASE_URL = process.env.RUN_LIVE_DB_TESTS === "1"
  ? process.env.DATABASE_URL_TEST || "pg-mem:"
  : "pg-mem:";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.GITHUB_CLIENT_ID = "test_client_id";
process.env.GITHUB_CLIENT_SECRET = "test_client_secret";
process.env.GITHUB_CALLBACK_URL = "http://localhost:5000/api/auth/github/callback";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY || "test-encryption-key-do-not-use-in-prod";

const app = await import("../app.js").then((m) => m.default);
const { __setIdentityResolver, __setExchangeImpl } = await import("../services/github/githubAuth.js");
const { findGithubAccountByUserId } = await import("../models/githubAccountModel.js");
const { encryptGithubToken, decryptGithubToken } = await import("../utils/githubTokenCrypto.js");

async function registerAndGetCookies() {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "OAuth Tester", email: `oauth_${Date.now()}@example.com`, password: "password123" });
  return res.headers["set-cookie"];
}

function parseCookieValue(cookies, name) {
  for (const c of cookies) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

let cookies;
let state;

describe("GitHub OAuth", () => {
  before(async () => {
    cookies = await registerAndGetCookies();
  });

  after(() => {
    __setIdentityResolver(null);
    __setExchangeImpl(null);
  });

  test("GET /api/auth/github redirects to GitHub authorize URL with state cookie", async () => {
    const res = await request(app).get("/api/auth/github").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.url.startsWith("https://github.com/login/oauth/authorize"));
    assert.ok(res.body.data.url.includes("client_id=test_client_id"));
    assert.ok(res.body.data.url.includes("state="));

    const sc = res.headers["set-cookie"];
    state = parseCookieValue(sc, "github_oauth_state");
    assert.ok(state, "state cookie must be set");
  });

  test("GET /api/auth/github requires auth", async () => {
    const res = await request(app).get("/api/auth/github");
    assert.equal(res.status, 401);
  });

  test("callback with invalid/missing state is rejected", async () => {
    const res = await request(app)
      .get("/api/auth/github/callback?code=fake&state=wrong")
      .set("Cookie", cookies);
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /error=invalid_state/);
  });

  test("callback with denied authorization redirects with error param", async () => {
    const res = await request(app)
      .get("/api/auth/github/callback?error=access_denied&state=preshared-state")
      .set("Cookie", appendStateCookies(["github_oauth_state=preshared-state"]));
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /error=access_denied/);
  });

  test("callback failure (fetch rejects) redirects to frontend error", async () => {
    __setIdentityResolver(async () => {
      throw new Error("network failure");
    });
    const stateCookies = [...cookies];
    stateCookies.push("github_oauth_state=fixed-state-1");
    const res = await request(app)
      .get("/api/auth/github/callback?code=badcode&state=fixed-state-1")
      .set("Cookie", stateCookies);
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /\/github\?error=/);
  });

  test("successful callback stores encrypted token + creates github_account", async () => {
    __setIdentityResolver(async () => ({
      id: 42,
      login: "octo",
      name: "Octo",
      avatar_url: "https://example.com/a.png",
      html_url: "https://github.com/octo",
    }));

    // Stub the code->token exchange.
    __setExchangeImpl(async () => ({
      accessToken: "gh_token_secret_abc",
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
    }));

    const stateCookies = [...cookies];
    stateCookies.push("github_oauth_state=fixed-state-2");
    const res = await request(app)
      .get("/api/auth/github/callback?code=goodcode&state=fixed-state-2")
      .set("Cookie", stateCookies);

    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^http:\/\/localhost:3000\/github$/);

    const userClaim = await findUserFromCookies();
    assert.ok(userClaim, "github_account created");

    const raw = await rawAccountRow(userClaim.id);
    assert.ok(raw.access_token_encrypted);
    assert.notEqual(raw.access_token_encrypted, "gh_token_secret_abc");
    assert.equal(decryptGithubToken(raw.access_token_encrypted), "gh_token_secret_abc");
    assert.ok(!raw.access_token_encrypted.includes("gh_token_secret_abc"));
  });
});

async function findUserFromCookies() {
  // Decode the registered user id from the access token cookie.
  const jwt = parseCookieValue(cookies, "access_token");
  const { verifyAccessToken } = await import("../utils/tokenUtils.js");
  return verifyAccessToken(jwt);
}

async function rawAccountRow(userId) {
  const { default: pool } = await import("../models/db.js");
  const r = await pool.query("SELECT * FROM github_accounts WHERE user_id = $1", [userId]);
  return r.rows[0];
}

function appendStateCookies(arr) {
  return [...cookies, ...arr];
}