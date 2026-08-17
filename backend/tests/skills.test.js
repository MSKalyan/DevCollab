import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateSkillScores, recencyMultiplier } from "../services/skills/skillEvidenceCalculator.js";
import {
  extractSkillsFromRepository,
  extractSkillsFromPullRequest,
} from "../services/skills/skillExtractor.js";

const ev = (type, skills, occurredAt, extra = {}) => ({
  event_type: type,
  metadata: skills ? { skills } : {},
  occurred_at: occurredAt || new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...extra,
});

describe("recencyMultiplier", () => {
  test("halves every 365 days", () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    assert.equal(recencyMultiplier(new Date(now - 365 * day), now), 0.5);
    assert.equal(recencyMultiplier(null), 1);
    assert.equal(recencyMultiplier(undefined, now), 1);
  });
});

describe("calculateSkillScores", () => {
  test("merged PR + repos + reviews outscore a single weak event (deterministic)", () => {
    const now = new Date();
    const events = [];
    // 10 merged Django PRs, 3 Django repos, 2 Django reviews
    for (let i = 0; i < 10; i++) events.push(ev("MERGED_PR", ["django"], now.toISOString()));
    for (let i = 0; i < 3; i++) events.push(ev("CONTRIBUTED_REPOSITORY", ["django"], now.toISOString()));
    for (let i = 0; i < 2; i++) events.push(ev("PR_REVIEW", ["django"], now.toISOString()));
    // A lone Python repo
    events.push(ev("CONTRIBUTED_REPOSITORY", ["python"], now.toISOString()));

    const scores = calculateSkillScores(events, now);
    const django = scores.find((s) => s.skill === "django");
    const python = scores.find((s) => s.skill === "python");

    assert.ok(django.score > python.score, `django(${django.score}) should beat python(${python.score})`);
    assert.equal(django.merged_pr_count, 10);
    assert.equal(django.repository_count, 3);
    assert.equal(django.review_count, 2);
    assert.equal(python.merged_pr_count, 0);
    assert.ok(scores[0].score >= scores[1].score, "scores sorted descending");
    assert.ok(django.score > 0 && django.score <= 1);
  });

  test("recency matters: recent evidence > old evidence", () => {
    const now = new Date().toISOString();
    const yearAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const recent = calculateSkillScores(
      [ev("MERGED_PR", ["react"], now), ev("MERGED_PR", ["react"], yearAgo)],
      new Date()
    );
    const weightNow = 3 * recencyMultiplier(now);
    const weightOld = 3 * recencyMultiplier(yearAgo);
    assert.ok(weightNow > weightOld);
    assert.equal(recent[0].skill, "react");
  });

  test("no evidence yields an empty list", () => {
    assert.deepEqual(calculateSkillScores([]), []);
  });
});

describe("skillExtractor", () => {
  test("extracts from repository languages and topics", () => {
    const repo = {
      language: "Python",
      topics: ["django", "postgresql", "docker"],
      name: "my-api",
      description: "A Django REST API",
    };
    const languages = { Python: 9000, JavaScript: 1000 };
    const skills = extractSkillsFromRepository(repo, languages);
    const set = new Set(skills);
    assert.ok(set.has("python"), JSON.stringify(skills));
    assert.ok(set.has("django"));
    assert.ok(set.has("postgresql"));
    assert.ok(set.has("docker"));
  });

  test("languages below 5% share do not count", () => {
    const repo = { language: "Python", topics: [] };
    const languages = { Python: 9500, JavaScript: 500 }; // JS = 5% exactly -> should count
    const skills = extractSkillsFromRepository(repo, languages);
    assert.ok(skills.includes("javascript"));
  });

  test("extracts from PR text and file extensions", () => {
    const pr = { title: "Add Redis caching to Django views", body: "uses the redis py client" };
    const files = [{ filename: "app/views.py" }, { filename: "src/index.tsx" }];
    const skills = extractSkillsFromPullRequest(pr, files);
    const set = new Set(skills);
    assert.ok(set.has("redis"));
    assert.ok(set.has("django"));
    assert.ok(set.has("python"));
    assert.ok(set.has("react"), JSON.stringify(skills)); // .tsx => react
  });

  test("c does not false-positive inside other words", () => {
    const skills = extractSkillsFromPullRequest({ title: "Refactor controller logic", body: "" }, []);
    assert.ok(!skills.includes("c"), JSON.stringify(skills));
  });
});