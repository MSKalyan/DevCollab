import { test, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Same setup as app.test.js: pg-mem unless RUN_LIVE_DB_TESTS=1.
import dotenv from "dotenv";
dotenv.config();

process.env.DATABASE_URL =
  process.env.RUN_LIVE_DB_TESTS === "1"
    ? process.env.DATABASE_URL_TEST || "pg-mem:"
    : "pg-mem:";
process.env.NODE_ENV = "test";
// Every case here drives several unauthenticated auth calls (register, verify,
// resend), so the production 20-per-15-minutes budget would throttle the suite
// long before its assertions ran.
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = await import("../app.js").then((m) => m.default);
// app.js re-runs dotenv.config(), which would repopulate SMTP_HOST from .env.
// Delete it after the import so the mailer falls back to the dev outbox and no
// test ever attempts a real send (same as tests/passwordReset.test.js).
delete process.env.SMTP_HOST;

const { getDevOutbox } = await import("../utils/mailer.js");
const { registerPendingUser, registerVerifiedUser, latestVerificationCode, uniqueEmail } =
  await import("./helpers/authFlow.js");
const { getUserByEmail } = await import("../models/userModel.js");
const pool = (await import("../models/db.js")).default;

const PASSWORD = "password123";

// A code guaranteed to differ from the real one, so a "wrong code" attempt can
// never accidentally be right.
function wrongCode(code, offset) {
  return String((Number(code) + offset) % 1_000_000).padStart(6, "0");
}

function verificationMailsFor(email) {
  return getDevOutbox().filter((m) => m.to === email && m.code);
}

describe("POST /api/auth/register (pending account)", () => {
  test("returns 201, echoes the address, and starts no session", async () => {
    const email = uniqueEmail("reg");
    const { response } = await registerPendingUser({ name: "Reg Tester", email });

    assert.equal(response.body.success, true);
    assert.equal(response.body.verification_required, true);
    assert.equal(response.body.data.email, email);
    assert.equal(response.headers["set-cookie"], undefined);
  });

  test("mails the code but never returns it", async () => {
    const email = uniqueEmail("reg_secret");
    const { response } = await registerPendingUser({ email });

    const code = await latestVerificationCode(email);
    assert.match(code, /^\d{6}$/, "a six-digit code was mailed");

    // A caller who never received the mail must not be able to lift the code out
    // of the response, not even as a digit sequence inside another field.
    const digitRuns = JSON.stringify(response.body).match(/\d{6}/g) || [];
    assert.ok(!digitRuns.includes(code), `code leaked in response: ${JSON.stringify(response.body)}`);
  });

  test("leaves authenticated routes unreachable", async () => {
    await registerPendingUser({ email: uniqueEmail("reg_ungated") });

    const me = await request(app).get("/api/auth/me");
    assert.equal(me.status, 401);
    const notifications = await request(app).get("/api/notifications");
    assert.equal(notifications.status, 401);
  });

  test("an already-verified address is a 409", async () => {
    const email = uniqueEmail("reg_taken");
    await registerVerifiedUser({ email });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Copycat", email, password: PASSWORD });
    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
  });
});

describe("POST /api/auth/verify-email", () => {
  test("the emailed code verifies the account and starts a real session", async () => {
    const email = uniqueEmail("verify_ok");
    const { name } = await registerPendingUser({ name: "Verify Tester", email });
    const code = await latestVerificationCode(email);

    const res = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.email_verified, true);

    const cookies = res.headers["set-cookie"];
    assert.ok(cookies, "verification issues the session cookies");
    assert.ok(cookies.some((c) => c.startsWith("access_token=")));
    assert.ok(cookies.some((c) => c.startsWith("refresh_token=")));

    // The proof: the session actually works against a protected route.
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    assert.equal(me.status, 200);
    assert.equal(me.body.name, name);
    assert.equal(me.body.email, email);
    assert.equal(me.body.email_verified, true);
    assert.equal(me.body.has_password, true);
  });

  test("the code is single-use", async () => {
    const email = uniqueEmail("verify_once");
    await registerPendingUser({ email });
    const code = await latestVerificationCode(email);

    const first = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(first.status, 200);

    const replay = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(replay.status, 400);
    assert.equal(replay.headers["set-cookie"], undefined, "a replayed code starts no session");
  });

  test("a wrong code reports the attempts remaining", async () => {
    const email = uniqueEmail("verify_wrong");
    await registerPendingUser({ email });
    const code = await latestVerificationCode(email);

    const first = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: wrongCode(code, 1) });
    assert.equal(first.status, 400);
    assert.match(first.body.message, /Incorrect code\. 4 attempts left\./);
    assert.equal(first.headers["set-cookie"], undefined);

    // Walk down to the singular boundary message.
    for (const [offset, left] of [[2, 3], [3, 2], [4, 1]]) {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .send({ email, code: wrongCode(code, offset) });
      assert.equal(res.status, 400);
      assert.match(
        res.body.message,
        new RegExp(`Incorrect code\\. ${left} attempt${left === 1 ? "" : "s"} left\\.`)
      );
    }

    // Nothing above consumed or invalidated the real code.
    const correct = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(correct.status, 200);
  });

  test("exhausting the attempts locks the code out", async () => {
    const email = uniqueEmail("verify_lockout");
    await registerPendingUser({ email });
    const code = await latestVerificationCode(email);

    for (let offset = 1; offset <= 4; offset += 1) {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .send({ email, code: wrongCode(code, offset) });
      assert.equal(res.status, 400, `wrong attempt ${offset}`);
    }

    const fifth = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: wrongCode(code, 5) });
    assert.equal(fifth.status, 400);
    assert.match(fifth.body.message, /Too many incorrect codes/);

    // The sixth call is refused outright, even with the right code.
    const sixth = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.headers["set-cookie"], undefined);

    // ...and the account is still unverified.
    const login = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    assert.equal(login.status, 403);
  });

  test("an expired code is rejected", async () => {
    const email = uniqueEmail("verify_expired");
    await registerPendingUser({ email });
    const code = await latestVerificationCode(email);

    // Age the live code past its expiry, the same direct-update trick the reset
    // suite uses for its tokens.
    const user = await getUserByEmail(email);
    await pool.query(
      "UPDATE email_verification_codes SET expires_at = $1 WHERE user_id = $2",
      [new Date(Date.now() - 60 * 1000), user.id]
    );

    const res = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(res.status, 400);
    assert.equal(res.headers["set-cookie"], undefined);
  });

  test("an unknown address is rejected like a bad code", async () => {
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: uniqueEmail("verify_nobody"), code: "123456" });
    assert.equal(res.status, 400);
    assert.equal(res.headers["set-cookie"], undefined);
  });
});

describe("POST /api/auth/login before verification", () => {
  test("is 403 EMAIL_NOT_VERIFIED and starts no session", async () => {
    const email = uniqueEmail("login_pending");
    await registerPendingUser({ email, password: PASSWORD });
    const code = await latestVerificationCode(email);

    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
    assert.equal(res.body.data.email, email);
    assert.equal(typeof res.body.code_sent, "boolean");
    assert.equal(res.headers["set-cookie"], undefined, "an unverified login must not start a session");

    // A live code was already outstanding, so nothing was re-mailed and the
    // original code is still the one that works.
    assert.equal(res.body.code_sent, false);
    const verify = await request(app).post("/api/auth/verify-email").send({ email, code });
    assert.equal(verify.status, 200);

    // The same credentials now succeed and report the verified account.
    const login = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    assert.equal(login.status, 200);
    assert.equal(login.body.success, true);
    assert.equal(login.body.data.user.email, email);
    assert.equal(login.body.data.user.email_verified, true);
    assert.ok(login.headers["set-cookie"], "a verified login starts the session");
  });

  test("re-sends a fresh code when none is live", async () => {
    const email = uniqueEmail("login_resend");
    await registerPendingUser({ email, password: PASSWORD });

    // Expire the outstanding code and push its creation past the resend cooldown,
    // so the login attempt is the only thing that can mail the next one.
    const user = await getUserByEmail(email);
    await pool.query(
      "UPDATE email_verification_codes SET expires_at = $1, created_at = $2 WHERE user_id = $3",
      [new Date(Date.now() - 60 * 1000), new Date(Date.now() - 5 * 60 * 1000), user.id]
    );

    const blocked = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
    assert.equal(blocked.body.code_sent, true);
    assert.equal(blocked.headers["set-cookie"], undefined);

    const verify = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: await latestVerificationCode(email) });
    assert.equal(verify.status, 200, "the auto-sent code verifies the account");
  });
});

describe("POST /api/auth/resend-verification", () => {
  test("immediately after registering it is a 429 with a numeric retry_after", async () => {
    const email = uniqueEmail("resend_cool");
    await registerPendingUser({ email });
    const mailed = verificationMailsFor(email).length;

    const res = await request(app).post("/api/auth/resend-verification").send({ email });
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.equal(typeof res.body.retry_after, "number");
    assert.ok(res.body.retry_after > 0 && res.body.retry_after <= 60, `retry_after=${res.body.retry_after}`);

    // The cooldown held: no second code went out.
    assert.equal(verificationMailsFor(email).length, mailed);
  });

  test("once the cooldown has passed it mails a code that supersedes the old one", async () => {
    const email = uniqueEmail("resend_supersede");
    await registerPendingUser({ email });
    const staleCode = await latestVerificationCode(email);

    // Age the live code past the 60s cooldown.
    const user = await getUserByEmail(email);
    await pool.query(
      "UPDATE email_verification_codes SET created_at = $1 WHERE user_id = $2",
      [new Date(Date.now() - 5 * 60 * 1000), user.id]
    );

    const res = await request(app).post("/api/auth/resend-verification").send({ email });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.email, email);
    assert.equal(res.body.data.retry_after, 60);

    const freshCode = await latestVerificationCode(email);

    const stale = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: staleCode });
    assert.equal(stale.status, 400, "the superseded code no longer verifies");

    const fresh = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: freshCode });
    assert.equal(fresh.status, 200, "the newest code is the live one");
    assert.ok(fresh.headers["set-cookie"]);
  });

  test("an unknown address is a 404", async () => {
    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: uniqueEmail("resend_nobody") });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test("an already-verified address is a 400", async () => {
    const email = uniqueEmail("resend_verified");
    await registerVerifiedUser({ email });

    const res = await request(app).post("/api/auth/resend-verification").send({ email });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});

describe("registering twice while pending", () => {
  test("is a 200 that re-codes the account without touching the stored password", async () => {
    const email = uniqueEmail("dup_pending");
    await registerPendingUser({ name: "Original Owner", email, password: "originalPass1" });
    const staleCode = await latestVerificationCode(email);

    const second = await request(app)
      .post("/api/auth/register")
      .send({ name: "Impostor", email, password: "impostorPass1" });
    assert.equal(second.status, 200);
    assert.equal(second.body.success, true);
    assert.equal(second.body.verification_required, true);
    assert.equal(second.body.data.email, email);
    assert.equal(second.headers["set-cookie"], undefined);

    const freshCode = await latestVerificationCode(email);

    const stale = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: staleCode });
    assert.equal(stale.status, 400, "the first code was replaced");

    const verify = await request(app)
      .post("/api/auth/verify-email")
      .send({ email, code: freshCode });
    assert.equal(verify.status, 200);

    // The password supplied at the second registration never took effect.
    const original = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "originalPass1" });
    assert.equal(original.status, 200);

    const impostor = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "impostorPass1" });
    assert.equal(impostor.status, 400);
  });
});
