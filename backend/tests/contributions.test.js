import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import dotenv from "dotenv";
dotenv.config();

const USE_LIVE = process.env.RUN_LIVE_DB_TESTS === "1";
if (!USE_LIVE) {
  process.env.DATABASE_URL = "pg-mem:";
}
process.env.AUTH_RATE_LIMIT_MAX = "1000";
// These tests must not depend on a developer's local .env: the agent's behavior
// is asserted with no LLM configured, and a real key would silently flip the
// expected output to model-generated. App modules call dotenv.config() on import
// and dotenv never overwrites an existing variable, so setting an empty string
// (rather than deleting) survives that reload and keeps isLlmEnabled() false.
process.env.LLM_API_KEY = "";

const app = await import("../app.js").then((m) => m.default);

const TEST_DB = process.env.DATABASE_URL_TEST || "pg-mem:";

async function registerUser(prefix) {
  const email = `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Agent Tester", email, password: "password123" });
  assert.equal(res.status, 201);
  return { email, cookies: res.headers["set-cookie"] };
}

// Give the user a connected GitHub account plus evidence, mirroring what the
// backfill would have written.
async function seedEvidence(userId, { events }) {
  const pool = (await import("../models/db.js")).default;
  const account = await pool.query(
    `INSERT INTO github_accounts (user_id, github_user_id, login, backfill_status)
     VALUES ($1, $2, $3, 'COMPLETED') RETURNING id`,
    [userId, Math.floor(Math.random() * 1e9), `tester${Date.now()}`]
  );
  const accountId = account.rows[0].id;

  for (const e of events) {
    await pool.query(
      `INSERT INTO evidence_events
         (github_account_id, event_type, github_event_id, repo_id, repo_full_name,
          pr_number, language, metadata, occurred_at, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        accountId,
        e.event_type,
        e.github_event_id || `${e.event_type}:${Math.random()}`,
        e.repo_id ?? null,
        e.repo_full_name || null,
        e.pr_number ?? null,
        e.language || null,
        JSON.stringify(e.metadata || {}),
        e.occurred_at || null,
        e.source_url || null,
      ]
    );
  }

  // skill_evidence is normally computed by the backfill; seed it directly.
  const { upsertSkillsForAccount } = await import("../models/skillEvidenceModel.js");
  await upsertSkillsForAccount(accountId, [
    { skill: "python", score: 1, evidenceCount: 5, mergedPrCount: 5, reviewCount: 1, repositoryCount: 3, lastSeenAt: new Date() },
    { skill: "postgresql", score: 0.5, evidenceCount: 2, mergedPrCount: 2, reviewCount: 0, repositoryCount: 1, lastSeenAt: new Date() },
  ]);

  return accountId;
}

async function seedCorpus() {
  const pool = (await import("../models/db.js")).default;
  // A python/http issue (should match) and a rust/wasm issue (should not).
  const repo = await pool.query(
    `INSERT INTO curated_repositories
       (owner, name, full_name, enabled, primary_language, languages, topics, stars, forks, open_issues_count, last_pushed_at, html_url)
     VALUES ('psf','requests','psf/requests',TRUE,'Python',$1,$2,52000,9000,130,NOW(),'https://github.com/psf/requests')
     ON CONFLICT (full_name) DO UPDATE SET last_pushed_at = NOW()
     RETURNING id`,
    [JSON.stringify({ Python: 900000, HTML: 100000 }), JSON.stringify(["http", "python"])]
  );
  const repoId = repo.rows[0].id;

  const rust = await pool.query(
    `INSERT INTO curated_repositories
       (owner, name, full_name, enabled, primary_language, languages, topics, stars, forks, open_issues_count, last_pushed_at, html_url)
     VALUES ('rustwasm','wasm-bindgen','rustwasm/wasm-bindgen',TRUE,'Rust',$1,$2,8000,600,300,NOW(),'https://github.com/rustwasm/wasm-bindgen')
     ON CONFLICT (full_name) DO UPDATE SET last_pushed_at = NOW()
     RETURNING id`,
    [JSON.stringify({ Rust: 800000 }), JSON.stringify(["wasm", "rust"])]
  );
  const rustId = rust.rows[0].id;

  const issues = [
    { repoId, n: 9001, title: "Add retry support to the HTTP client", body: "python http client should retry on 5xx", labels: ["good first issue", "bug"] },
    { repoId, n: 9002, title: "Fix typo in postgresql adapter docs", body: "postgresql docs mention wrong param", labels: ["documentation"] },
    { repoId, n: 9004, title: "Improve postgresql query performance", body: "postgresql adapter is slow on large tables", labels: ["performance"] },
    { repoId, n: 9005, title: "Duplicate report of the same adapter crash", body: "same as the other one", labels: ["duplicate"] },
    { repoId: rustId, n: 9003, title: "Implement wasm SIMD intrinsics", body: "rust wasm simd implementation across the codebase", labels: ["epic"] },
  ];

  for (const i of issues) {
    await pool.query(
      `INSERT INTO github_issues
         (github_issue_id, repository_id, issue_number, title, body, state, labels,
          repo_topics, repo_language, comments_count, created_at, updated_at, is_pull_request, html_url)
       VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,2,NOW(),NOW(),FALSE,$9)
       ON CONFLICT (repository_id, issue_number) DO NOTHING`,
      [
        Math.floor(Math.random() * 1e9),
        i.repoId,
        i.n,
        i.title,
        i.body,
        JSON.stringify(i.labels),
        JSON.stringify(i.repoId === repoId ? ["http", "python"] : ["wasm", "rust"]),
        i.repoId === repoId ? "Python" : "Rust",
        `https://example.com/issues/${i.n}`,
      ]
    );
  }
}

const PR_PATHS = {
  python: ["requests/sessions.py"],
};

describe("GET /api/contributions", () => {
  before(() => {
    process.env.DATABASE_URL = TEST_DB;
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/contributions");
    assert.equal(res.status, 401);
  });

  test("reports not-connected for a user with no GitHub account", async () => {
    const { cookies } = await registerUser("agent_nogithub");
    const res = await request(app).get("/api/contributions").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.connected, false);
    assert.deepEqual(res.body.recommendations, []);
    assert.equal(res.body.profile, null);
  });

  test("reports no_evidence for a connected account with no evidence", async () => {
    const { cookies } = await registerUser("agent_noevidence");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    await seedEvidence(me.body.id, { events: [] });

    const res = await request(app).get("/api/contributions").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.equal(res.body.connected, true);
    assert.equal(res.body.reason, "no_evidence");
  });

  test("returns an analyzed profile and ranked recommendations", async () => {
    const { cookies } = await registerUser("agent_full");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);

    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 1, occurred_at: "2026-01-01T00:00:00Z",
          metadata: { skills: ["python"], labels: ["bug"], additions: 40, deletions: 10, changed_files: 2, file_paths: PR_PATHS.python } },
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 2, occurred_at: "2026-01-02T00:00:00Z",
          metadata: { skills: ["python", "postgresql"], labels: ["kind/bug"], additions: 80, deletions: 20, changed_files: 3, file_paths: ["requests/models.py", "tests/test_models.py"] } },
        { event_type: "MERGED_PR", repo_full_name: "django/django", language: "Python", pr_number: 3, occurred_at: "2026-01-03T00:00:00Z",
          metadata: { skills: ["python"], labels: ["documentation"], additions: 120, deletions: 30, changed_files: 4 } },
        { event_type: "PR_REVIEW", repo_full_name: "django/django", occurred_at: "2026-01-04T00:00:00Z", metadata: {} },
      ],
    });
    await seedCorpus();

    const res = await request(app).get("/api/contributions?limit=5").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.connected, true);

    // Profile shape
    const profile = res.body.profile;
    assert.ok(profile, "profile returned");
    assert.ok(["newcomer", "intermediate", "advanced", "expert"].includes(profile.capability.level));
    assert.equal(profile.generated_by, "deterministic", "no LLM key means deterministic output");
    assert.ok(profile.narrative.length > 20, "narrative is present without an LLM");
    assert.equal(profile.workingStyle.summary.length > 0, true);
    assert.ok(profile.experience.merged_prs === 3);
    assert.ok(profile.capability.primaryLanguages[0].name === "python");

    // Label analyst output: the user's demonstrated work types, learned from
    // the labels on their merged PRs.
    assert.ok(profile.labels, "profile carries the label analysis");
    assert.ok(Array.isArray(profile.labels.workTypes));

    // Two `bug` and one `kind/bug` spelling must converge on one work type.
    const bug = profile.labels.workTypes.find((w) => w.workType === "bug-fix");
    assert.ok(bug, "bug-fix learned from merged-PR labels");
    assert.equal(bug.merged_pr_count, 2, "both bug spellings count together");
    assert.equal(profile.labels.coverage, 1, "all three PRs carried labels");
    assert.ok(Array.isArray(profile.labels.preferred_work_types));
    assert.equal(typeof profile.labels.coverage, "number");

    // Recommendations shape per the frozen contract
    assert.ok(res.body.recommendations.length > 0, "produced recommendations");
    const rec = res.body.recommendations[0];
    for (const field of ["rank", "issue_id", "number", "title", "html_url", "repository", "fit_score", "difficulty", "scope", "matched_skills", "why", "next_step", "signals", "work_type", "declared_intent"]) {
      assert.ok(field in rec, `recommendation exposes ${field}`);
    }
    assert.ok("label_fit" in rec.signals, "label fit is a scored signal");
    assert.ok(Array.isArray(rec.why) && rec.why.length > 0);
    assert.ok(rec.why.some((w) => /python/i.test(w)), `reason names the matched skill: ${JSON.stringify(rec.why)}`);
    assert.ok(rec.fit_score > 0 && rec.fit_score <= 100);
    assert.equal(rec.rank, 1);
  });

  test("ranks a python issue above an unrelated rust issue", async () => {
    const { cookies } = await registerUser("agent_rank");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);

    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 10, occurred_at: "2026-02-01T00:00:00Z",
          metadata: { skills: ["python"], additions: 50, deletions: 10, changed_files: 2 } },
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 11, occurred_at: "2026-02-02T00:00:00Z",
          metadata: { skills: ["python"], additions: 60, deletions: 15, changed_files: 3 } },
      ],
    });
    await seedCorpus();

    const res = await request(app).get("/api/contributions?limit=10").set("Cookie", cookies);
    assert.equal(res.status, 200);
    const recs = res.body.recommendations;
    assert.ok(recs.length >= 2, "both repos have eligible issues");

    const pythonRec = recs.find((r) => r.repository === "psf/requests");
    const rustRec = recs.find((r) => r.repository === "rustwasm/wasm-bindgen");
    assert.ok(pythonRec, "python issue recommended");
    if (rustRec) {
      assert.ok(
        pythonRec.fit_score > rustRec.fit_score,
        `python issue (${pythonRec.fit_score}) outranks unrelated rust issue (${rustRec.fit_score})`
      );
    }
  });

  test("filters by difficulty", async () => {
    const { cookies } = await registerUser("agent_filter");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 20, occurred_at: "2026-03-01T00:00:00Z",
          metadata: { skills: ["python"], additions: 40, deletions: 10, changed_files: 2 } },
      ],
    });
    await seedCorpus();

    const res = await request(app).get("/api/contributions?difficulty=starter").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.ok(res.body.recommendations.every((r) => r.difficulty === "starter"), "only starter issues returned");
  });

  test("filters by work type derived from labels", async () => {
    const { cookies } = await registerUser("agent_worktype");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 21, occurred_at: "2026-03-02T00:00:00Z",
          metadata: { skills: ["python"], labels: ["bug"], additions: 40, deletions: 10, changed_files: 2 } },
      ],
    });
    await seedCorpus();

    const res = await request(app).get("/api/contributions?work_type=bug-fix").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.ok(res.body.recommendations.length > 0, "bug-fix work exists in the corpus");
    assert.ok(
      res.body.recommendations.every((r) => r.work_type === "bug-fix"),
      `only bug-fix work returned: ${JSON.stringify(res.body.recommendations.map((r) => r.work_type))}`
    );
  });

  test("an unrecognized work_type is ignored rather than emptying the results", async () => {
    const { cookies } = await registerUser("agent_badworktype");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 22, occurred_at: "2026-03-03T00:00:00Z",
          metadata: { skills: ["python"], labels: ["bug"], additions: 40, deletions: 10, changed_files: 2 } },
      ],
    });
    await seedCorpus();

    const res = await request(app).get("/api/contributions?work_type=nonsense").set("Cookie", cookies);
    assert.equal(res.status, 200);
    assert.equal(res.body.filters.work_type, null, "invalid filter is dropped");
    assert.ok(res.body.recommendations.length > 0);
  });

  test("issues labelled duplicate are never recommended", async () => {
    const { cookies } = await registerUser("agent_dup");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 23, occurred_at: "2026-03-04T00:00:00Z",
          metadata: { skills: ["python"], labels: ["bug"], additions: 40, deletions: 10, changed_files: 2 } },
      ],
    });
    await seedCorpus();

    const res = await request(app).get("/api/contributions?limit=20").set("Cookie", cookies);
    assert.equal(res.status, 200);
    const titles = res.body.recommendations.map((r) => r.title);
    assert.ok(
      !titles.some((t) => /Duplicate report/i.test(t)),
      `duplicate issue should be excluded, got ${JSON.stringify(titles)}`
    );
  });

  test("caches the analysis and reuses it for unchanged evidence", async () => {
    const { cookies } = await registerUser("agent_cache");
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    await seedEvidence(me.body.id, {
      events: [
        { event_type: "MERGED_PR", repo_full_name: "psf/requests", language: "Python", pr_number: 30, occurred_at: "2026-04-01T00:00:00Z",
          metadata: { skills: ["python"], additions: 10, deletions: 5, changed_files: 1 } },
      ],
    });
    await seedCorpus();

    const first = await request(app).get("/api/contributions").set("Cookie", cookies);
    assert.equal(first.status, 200);

    const pool = (await import("../models/db.js")).default;
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM contribution_profiles WHERE github_account_id = (SELECT id FROM github_accounts WHERE user_id = $1)",
      [me.body.id]
    );
    assert.equal(rows[0].count, 1, "analysis cached once");

    const second = await request(app).get("/api/contributions").set("Cookie", cookies);
    assert.equal(second.status, 200);
    assert.equal(second.body.profile.narrative, first.body.profile.narrative, "cached narrative reused");
  });
});
