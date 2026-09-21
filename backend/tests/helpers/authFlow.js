// Shared test helpers for the auth flows.
//
// Email verification gates every session, so a suite that wants a logged-in user
// must both register and confirm the code. `registerVerifiedUser` does the whole
// round-trip through the HTTP API: the code is read out of the mailer's dev
// outbox (SMTP is never configured in tests), which keeps the tests honest about
// the real flow instead of reaching into the database.
import request from "supertest";
import assert from "node:assert/strict";

let appPromise;
async function getApp() {
  if (!appPromise) {
    appPromise = import("../../app.js").then((m) => m.default);
  }
  return appPromise;
}

let outboxPromise;
async function getOutbox() {
  if (!outboxPromise) {
    outboxPromise = import("../../utils/mailer.js").then((m) => m.getDevOutbox());
  }
  return outboxPromise;
}

export function uniqueEmail(prefix = "user") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
}

// Newest verification code captured for an address.
export async function latestVerificationCode(email) {
  const outbox = await getOutbox();
  const mail = [...outbox].reverse().find((m) => m.to === email && m.code);
  assert.ok(mail, `verification email captured for ${email}`);
  return mail.code;
}

export async function latestResetToken(email) {
  const outbox = await getOutbox();
  const mail = [...outbox].reverse().find((m) => m.to === email && m.resetUrl);
  assert.ok(mail, `reset email captured for ${email}`);
  const match = mail.resetUrl.match(/[?&]token=([a-f0-9]+)/);
  assert.ok(match, "reset url carries a token");
  return match[1];
}

// POST /api/auth/register, asserting the unverified contract: 201, no session
// cookies, and a code on its way.
export async function registerPendingUser({
  name = "Test User",
  email = uniqueEmail(),
  password = "password123",
} = {}) {
  const app = await getApp();
  const res = await request(app).post("/api/auth/register").send({ name, email, password });
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.verification_required, true);
  assert.ok(!res.headers["set-cookie"], "registration must not start a session");
  return { name, email, password, response: res };
}

// Full round-trip: register, read the code from the outbox, verify, and return
// the session cookies. This is the replacement for the old "register returns
// cookies" assumption in every suite.
export async function registerVerifiedUser({
  name = "Test User",
  email = uniqueEmail(),
  password = "password123",
} = {}) {
  const app = await getApp();
  const pending = await registerPendingUser({ name, email, password });
  const code = await latestVerificationCode(email);
  const verify = await request(app).post("/api/auth/verify-email").send({ email, code });
  assert.equal(verify.status, 200, `verify failed: ${JSON.stringify(verify.body)}`);
  const cookies = verify.headers["set-cookie"];
  assert.ok(cookies, "verification issues session cookies");
  return { ...pending, code, cookies };
}
