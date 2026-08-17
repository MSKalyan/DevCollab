import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Load env (test DB choice comes from process.env — a live DB is opt-in).
import dotenv from "dotenv";
dotenv.config();

// Default to an in-memory PostgreSQL so the full suite runs without a live DB,
// and without depending on DATABASE_URL_TEST in .env. Set
// RUN_LIVE_DB_TESTS=1 and DATABASE_URL_TEST to run against a real database.
const USE_LIVE = process.env.RUN_LIVE_DB_TESTS === "1";
if (!USE_LIVE) {
  process.env.DATABASE_URL = "pg-mem:";
}

const app = await import("../app.js").then((m) => m.default);

// Health check should always work without a database.
describe("GET /api/health", () => {
  test("returns OK status", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "OK");
  });
});

// Validation should reject bad payloads before any DB hit.
describe("POST /api/auth/register validation", () => {
  test("rejects missing/invalid fields with 400", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "a", email: "bad", password: "123" });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("rejects short password with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Alice", email: "alice@example.com", password: "123" });
    assert.equal(res.status, 400);
  });
});

describe("POST /api/auth/login validation", () => {
  test("rejects invalid email with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nope", password: "password123" });
    assert.equal(res.status, 400);
  });
});

// Smoke tests run against the in-memory PostgreSQL by default, or against a
// live database when DATABASE_URL_TEST is set.
const TEST_DB = process.env.DATABASE_URL_TEST || "pg-mem:";
const maybe = describe;

maybe("Auth + projects smoke (pg-mem or DATABASE_URL_TEST)", () => {
  let cookies;

  before(async () => {
    process.env.DATABASE_URL = TEST_DB;
  });

  test("registers, creates a project, lists and deletes it", async () => {
    const email = `test_${Date.now()}@example.com`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Tester", email, password: "password123" });
    assert.equal(reg.status, 201);
    cookies = reg.headers["set-cookie"];

    const create = await request(app)
      .post("/api/projects/create")
      .set("Cookie", cookies)
      .field("title", "Hello World")
      .field("description", "This is a test project description.")
      .field("category", "test");
    assert.equal(create.status, 201);
    const projectId = create.body.data.id;

    const list = await request(app).get("/api/projects").set("Cookie", cookies);
    assert.equal(list.status, 200);

    const del = await request(app).delete(`/api/projects/${projectId}`).set("Cookie", cookies);
    assert.equal(del.status, 200);
  });

  test("contact request appears in the recipient's notifications", async () => {
    const { getUserByEmail } = await import("../models/userModel.js");
    const emailA = `notif_a_${Date.now()}@example.com`;
    const regA = await request(app)
      .post("/api/auth/register")
      .send({ name: "Notif A", email: emailA, password: "password123" });
    assert.equal(regA.status, 201);
    const cookiesA = regA.headers["set-cookie"];

    const emailB = `notif_b_${Date.now()}@example.com`;
    const regB = await request(app)
      .post("/api/auth/register")
      .send({ name: "Notif B", email: emailB, password: "password123" });
    assert.equal(regB.status, 201);
    const cookiesB = regB.headers["set-cookie"];

    const a = await getUserByEmail(emailA);
    assert.ok(a, "user A created");

    const contact = await request(app)
      .post(`/api/auth/developers/${a.id}/contact`)
      .set("Cookie", cookiesB)
      .send({ message: "Hey, would love to connect!" });
    assert.equal(contact.status, 201);

    const notif = await request(app).get("/api/notifications").set("Cookie", cookiesA);
    assert.equal(notif.status, 200);
    const found = notif.body.data.requests.find(
      (r) => r.type === "contact" && r.sender_name === "Notif B"
    );
    assert.ok(found, "recipient sees the contact request");
    assert.equal(found.message, "Hey, would love to connect!");
  });

  test("accepted contact request opens a chat with message exchange", async () => {
    const { getUserByEmail } = await import("../models/userModel.js");
    const emailA = `chat_a_${Date.now()}@example.com`;
    const regA = await request(app)
      .post("/api/auth/register")
      .send({ name: "Chat A", email: emailA, password: "password123" });
    const cookiesA = regA.headers["set-cookie"];
    const emailB = `chat_b_${Date.now()}@example.com`;
    const regB = await request(app)
      .post("/api/auth/register")
      .send({ name: "Chat B", email: emailB, password: "password123" });
    const cookiesB = regB.headers["set-cookie"];

    const a = await getUserByEmail(emailA);
    assert.ok(a, "user A created");

    // B sends a contact request (no message required).
    const contact = await request(app)
      .post(`/api/auth/developers/${a.id}/contact`)
      .set("Cookie", cookiesB)
      .send({});
    assert.equal(contact.status, 201);

    // A sees it and accepts.
    const notif = await request(app).get("/api/notifications").set("Cookie", cookiesA);
    const req = notif.body.data.requests.find(
      (r) => r.type === "contact" && r.sender_name === "Chat B"
    );
    assert.ok(req, "A sees the pending request");
    const accept = await request(app)
      .post(`/api/contact-requests/${req.id}/accept`)
      .set("Cookie", cookiesA);
    assert.equal(accept.status, 200);

    // A gets a conversation and sends a message.
    const chatsA = await request(app).get("/api/chats").set("Cookie", cookiesA);
    const conv = chatsA.body.data.conversations.find((c) => c.other_name === "Chat B");
    assert.ok(conv, "conversation created for A");
    const send = await request(app)
      .post(`/api/chats/${conv.id}/messages`)
      .set("Cookie", cookiesA)
      .send({ body: "Hi B!" });
    assert.equal(send.status, 201);

    // B sees the conversation with an unread count and can read the message.
    const chatsB = await request(app).get("/api/chats").set("Cookie", cookiesB);
    const convB = chatsB.body.data.conversations.find((c) => c.other_name === "Chat A");
    assert.ok(convB, "conversation created for B");
    assert.ok(Number(convB.unread) >= 1, "B has unread");
    const msgs = await request(app)
      .get(`/api/chats/${convB.id}/messages`)
      .set("Cookie", cookiesB);
    assert.ok(
      msgs.body.data.messages.some((m) => m.body === "Hi B!"),
      "B sees the message"
    );
  });

  test("recipient can reject a contact request", async () => {
    const { getUserByEmail } = await import("../models/userModel.js");
    const emailA = `rej_a_${Date.now()}@example.com`;
    const regA = await request(app)
      .post("/api/auth/register")
      .send({ name: "Rej A", email: emailA, password: "password123" });
    const cookiesA = regA.headers["set-cookie"];
    const emailB = `rej_b_${Date.now()}@example.com`;
    const regB = await request(app)
      .post("/api/auth/register")
      .send({ name: "Rej B", email: emailB, password: "password123" });
    const cookiesB = regB.headers["set-cookie"];

    const a = await getUserByEmail(emailA);
    await request(app)
      .post(`/api/auth/developers/${a.id}/contact`)
      .set("Cookie", cookiesB)
      .send({});
    const notif = await request(app).get("/api/notifications").set("Cookie", cookiesA);
    const req = notif.body.data.requests.find(
      (r) => r.type === "contact" && r.sender_name === "Rej B"
    );
    assert.ok(req, "pending request seen");
    const reject = await request(app)
      .post(`/api/contact-requests/${req.id}/reject`)
      .set("Cookie", cookiesA);
    assert.equal(reject.status, 200);
    assert.equal(reject.body.data.request.status, "rejected");

    // No conversation is created for a rejected request.
    const chatsA = await request(app).get("/api/chats").set("Cookie", cookiesA);
    assert.ok(
      !chatsA.body.data.conversations.some((c) => c.other_name === "Rej B"),
      "no conversation after reject"
    );
  });
});
