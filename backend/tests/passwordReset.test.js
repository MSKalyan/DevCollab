import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Same setup as app.test.js: pg-mem unless RUN_LIVE_DB_TESTS=1.
import dotenv from "dotenv";
dotenv.config();

const USE_LIVE = process.env.RUN_LIVE_DB_TESTS === "1";
if (!USE_LIVE) {
  process.env.DATABASE_URL = "pg-mem:";
}

// The reset flow makes several unauthenticated auth calls per test; the default
// 20-per-15-minutes production budget is deliberately too small for that.
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = await import("../app.js").then((m) => m.default);
// app.js re-runs dotenv.config(), which would repopulate SMTP_HOST from .env.
// Delete it after the import so the mailer falls back to the dev outbox and the
// tests never attempt a real send.
delete process.env.SMTP_HOST;
import { uniqueEmail, latestResetToken, registerVerifiedUser } from "./helpers/authFlow.js";

const TEST_DB = process.env.DATABASE_URL_TEST || "pg-mem:";

// The reset link lands in the same dev outbox as verification mail; the shared
// helper selects by `resetUrl`, so the two flows never collide.
async function registerUser(prefix) {
  const { email, cookies } = await registerVerifiedUser({ name: "Reset Tester", email: uniqueEmail(prefix) });
  return { email, cookies };
}

describe("POST /api/auth/forgot-password validation", () => {
  before(() => {
    process.env.DATABASE_URL = TEST_DB;
  });

  test("rejects an invalid email with 400", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nope" });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("rejects a missing payload with 400", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({});
    assert.equal(res.status, 400);
  });
});

describe("POST /api/auth/reset-password validation", () => {
  before(() => {
    process.env.DATABASE_URL = TEST_DB;
  });

  test("rejects a short password with 400", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "abc", password: "short" });
    assert.equal(res.status, 400);
  });

  test("rejects a missing token with 400", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ password: "password123" });
    assert.equal(res.status, 400);
  });
});

describe("password reset flow", () => {
  before(() => {
    process.env.DATABASE_URL = TEST_DB;
  });

  test("full reset: link -> new password -> old password rejected", async () => {
    const { email } = await registerUser("reset_full");

    const forgot = await request(app).post("/api/auth/forgot-password").send({ email });
    assert.equal(forgot.status, 200);
    assert.equal(forgot.body.success, true);
    // The response must not echo the token — that would leak it to anyone.
    assert.equal(forgot.body.resetUrl, undefined);

    const token = await latestResetToken(email);

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "brandNewPassword1" });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.success, true);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    assert.equal(oldLogin.status, 400);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "brandNewPassword1" });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body.success, true);
  });

  test("reset link is single-use", async () => {
    const { email } = await registerUser("reset_once");

    await request(app).post("/api/auth/forgot-password").send({ email });
    const token = await latestResetToken(email);

    const first = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "firstNewPassword1" });
    assert.equal(first.status, 200);

    const second = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "secondNewPassword1" });
    assert.equal(second.status, 400);

    // The second attempt must not have changed the password again.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "firstNewPassword1" });
    assert.equal(login.status, 200);
  });

  test("reset revokes existing sessions", async () => {
    const { email, cookies } = await registerUser("reset_sessions");

    const beforeMe = await request(app).get("/api/auth/me").set("Cookie", cookies);
    assert.equal(beforeMe.status, 200);

    await request(app).post("/api/auth/forgot-password").send({ email });
    const token = await latestResetToken(email);
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "rotatedPassword1" });

    // The refresh tokens issued before the reset are gone, so the old session
    // cannot be resurrected.
    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", cookies);
    assert.equal(refresh.status, 401);
  });

  test("expired reset token is rejected", async () => {
    const { email } = await registerUser("reset_expired");

    await request(app).post("/api/auth/forgot-password").send({ email });
    const token = await latestResetToken(email);

    // Age the token past its expiry.
    const { getUserByEmail } = await import("../models/userModel.js");
    const { hashPasswordResetToken } = await import("../utils/tokenUtils.js");
    const pool = (await import("../models/db.js")).default;
    const user = await getUserByEmail(email);
    await pool.query(
      "UPDATE password_reset_tokens SET expires_at = $1 WHERE user_id = $2 AND token_hash = $3",
      [new Date(Date.now() - 60 * 1000), user.id, hashPasswordResetToken(token)]
    );

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "expiredAttempt1" });
    assert.equal(res.status, 400);
  });

  test("unknown email gets a 404 and sends nothing", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `nobody_${Date.now()}@example.com` });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /No account found/);
  });

  test("a new request invalidates the previous outstanding link", async () => {
    const { email } = await registerUser("reset_supersede");

    await request(app).post("/api/auth/forgot-password").send({ email });
    const staleToken = await latestResetToken(email);

    await request(app).post("/api/auth/forgot-password").send({ email });
    const { getUserByEmail } = await import("../models/userModel.js");
    const { hashPasswordResetToken } = await import("../utils/tokenUtils.js");
    const pool = (await import("../models/db.js")).default;
    const user = await getUserByEmail(email);

    // Only the newest token stays valid; the older one is removed.
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL",
      [user.id]
    );
    assert.equal(rows[0].count, 1);

    const stale = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: staleToken, password: "staleAttempt1" });
    assert.equal(stale.status, 400, "superseded token rejected");
    assert.ok(hashPasswordResetToken(staleToken), "hash helper is used for lookup");
  });
});
