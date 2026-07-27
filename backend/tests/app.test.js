import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Load env (test DB connection comes from process.env.DATABASE_URL_TEST if set).
import dotenv from "dotenv";
dotenv.config();

import app from "../app.js";

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

// The following smoke tests require a live PostgreSQL test database.
// Set DATABASE_URL_TEST to run them; they are skipped otherwise.
const TEST_DB = process.env.DATABASE_URL_TEST;
const maybe = TEST_DB ? describe : describe.skip;

maybe("Auth + projects smoke (needs DATABASE_URL_TEST)", () => {
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
});
