import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  issueText,
  buildIssueCorpus,
  profileVector,
  skillMatch,
  rankCorpus,
} from "../services/rank/rankerV1.js";
import { tokenize, cosineSimilarity } from "../services/rank/tfidf.js";
import { issueFreshness } from "../services/rank/freshness.js";
import { calculateRepositoryFriendliness } from "../services/rank/friendliness.js";
import { buildUserProfile } from "../services/rank/evidenceProfile.js";

function profileWith(skills) {
  return {
    skills: skills.map((s) => ({
      skill: s.skill,
      score: s.score ?? 0.5,
      merged_pr_count: s.merged_pr_count ?? 2,
      repository_count: s.repository_count ?? 1,
      review_count: 0,
    })),
    skillIndex: new Map(skills.map((s) => [s.skill, s])),
    languageTerms: new Set(skills.flatMap((s) => s.skill.split(/\s+/))),
    isEmpty: skills.length === 0,
  };
}

function issue(id, overrides = {}) {
  return {
    id,
    github_issue_id: id,
    repository_id: 1,
    issue_number: id,
    title: `Issue ${id}`,
    body: "",
    state: "open",
    labels: [],
    repo_topics: [],
    repo_language: "Python",
    updated_at: overrides.updated_at || new Date().toISOString(),
    ...overrides,
  };
}

function repo(id, overrides = {}) {
  return {
    id,
    github_repo_id: id,
    full_name: "django/django",
    owner: "django",
    name: "django",
    stars: 3000,
    forks: 800,
    open_issues_count: 150,
    last_pushed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("tokenizer + cosine", () => {
  test("tokenizes and computes cosine similarity", () => {
    const a = new Map([["redis", 1], ["django", 1]]);
    const b = new Map([["redis", 1], ["django", 1]]);
    const c = new Map([["go", 1]]);
    assert.equal(cosineSimilarity(a, b), 1);
    assert.equal(cosineSimilarity(a, c), 0);
  });

  test("stopwords are dropped", () => {
    const terms = tokenize("the and a Redis caching for Django");
    assert.ok(!terms.includes("the"));
    assert.ok(terms.includes("redis"));
  });
});

describe("rankCorpus", () => {
  test("highly relevant issue scores above an irrelevant issue", () => {
    const profile = profileWith([{ skill: "django", score: 0.9 }, { skill: "redis", score: 0.6 }]);
    const issues = [
      issue(1, { title: "Improve Redis caching in Django REST", labels: ["good first issue"], updated_at: new Date().toISOString() }),
      issue(2, { title: "Add Terraform module for AWS VPC", labels: ["help wanted"], updated_at: new Date().toISOString() }),
    ];
    const repos = new Map([[1, repo(1)]]) ;
    const ranked = rankCorpus(issues, repos, profile);
    assert.equal(ranked[0].issue_id, 1, "django+redis issue first");
    assert.ok(ranked[0].fit_score > ranked[1].fit_score);
  });

  test("strong evidence increases score over weak evidence", () => {
    const strong = profileWith([{ skill: "django", score: 0.95, merged_pr_count: 12 }]);
    const weak = profileWith([{ skill: "django", score: 0.1, merged_pr_count: 0 }]);
    const issues = [issue(1, { title: "Django admin improvements", labels: ["help wanted"], updated_at: new Date().toISOString() })];
    const repos = new Map([[1, repo(1)]]);
    const a = rankCorpus(issues, repos, strong)[0];
    const b = rankCorpus(issues, repos, weak)[0];
    assert.ok(a.fit_score > b.fit_score, "strong evidence outranks weak");
  });

  test("repository friendliness affects score", () => {
    const profile = profileWith([{ skill: "django", score: 0.7, merged_pr_count: 2 }]);
    const issues = [issue(1, { title: "Django related work", labels: ["good first issue"], updated_at: new Date().toISOString() })];
    const active = rankCorpus(issues, new Map([[1, repo(1, { last_pushed_at: new Date().toISOString(), stars: 3000 } )]]), profile)[0];
    const idle = rankCorpus(issues, new Map([[1, repo(1, { last_pushed_at: new Date(Date.now() - 400 * 864e5).toISOString(), stars: 2 } )]]), profile)[0];
    assert.ok(active.repository_friendliness_score > idle.repository_friendliness_score);
  });

  test("freshness affects score", () => {
    const profile = profileWith([{ skill: "django", score: 0.7, merged_pr_count: 2 }]);
    const fresh = issue(1, { title: "Django thing", updated_at: new Date().toISOString() });
    const old = issue(2, { title: "Django thing", updated_at: new Date(Date.now() - 400 * 864e5).toISOString() });
    const repos = new Map([[1, repo(1)]]);
    const ranked = rankCorpus([fresh, old], repos, profile);
    assert.equal(ranked[0].issue_id, 1, "fresher issue ranks higher");
  });

  test("missing skills / empty evidence does not crash", () => {
    const empty = profileWith([]);
    const issues = [issue(1, { title: "Anything", labels: [] })];
    const ranked = rankCorpus(issues, new Map([[1, repo(1)]]), empty);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].fit_score, 0, "no evidence => no match");
  });

  test("off-target issue does not outrank a matching issue", () => {
    const profile = profileWith([{ skill: "python", score: 0.9 }, { skill: "django", score: 0.8 }]);
    const issues = [
      issue(1, { title: "Django queryset optimization", labels: ["good first issue"], updated_at: new Date().toISOString() }),
      issue(2, { title: "Kotlin coroutines", labels: ["help wanted"], updated_at: new Date().toISOString() }),
    ];
    const ranked = rankCorpus(issues, new Map([[1, repo(1)]]), profile);
    assert.equal(ranked[0].issue_id, 1);
  });
});

describe("skillMatch", () => {
  test("returns matched skills with evidence weights", () => {
    const profile = profileWith([{ skill: "django", score: 0.87, merged_pr_count: 12 }, { skill: "redis", score: 0.62, merged_pr_count: 4 }]);
    const i = issue(1, { title: "Re DIS cache in Django REST Framework", labels: ["redis"], repo_topics: ["django"] });
    const m = skillMatch(profile, i);
    assert.equal(m.matchedSkills.length >= 1, true);
    assert.ok(m.score > 0);
  });

  test("weak single-repo evidence scores lower than merged-PR evidence", () => {
    const strong = profileWith([{ skill: "django", score: 0.8, merged_pr_count: 12 }]);
    const weak = profileWith([{ skill: "django", score: 0.8, merged_pr_count: 0 }]);
    const i = issue(1, { title: "Find only django code here", repo_topics: ["django"] });
    assert.ok(skillMatch(strong, i).score > skillMatch(weak, i).score);
  });
});

describe("explanations", () => {
  test("matched skills appear and explanations trace to components", () => {
    const profile = profileWith([{ skill: "django", score: 0.9, merged_pr_count: 12 }]);
    const i = issue(1, { title: "Django admin improvements", labels: ["good first issue"], updated_at: new Date().toISOString() });
    const rec = rankCorpus([i], new Map([[1, repo(1)]]), profile)[0];
    assert.ok(Array.isArray(rec.why) && rec.why.length > 0);
    assert.ok(rec.matched_skills.includes("django"));
    const joined = rec.why.join(" | ").toLowerCase();
    assert.ok(joined.includes("django"), "explanation references the evidence skill");
  });

  test("empty match yields an honest low-key explanation", () => {
    const profile = profileWith([{ skill: "kotlin", score: 0.9, merged_pr_count: 3 }]);
    const i = issue(1, { title: "Rust allocator internals", labels: [] });
    const rec = rankCorpus([i], new Map([[1, repo(1)]]), profile)[0];
    assert.ok(rec.why.length >= 1);
  });
});

describe("issueFreshness", () => {
  test("recent is higher than old", () => {
    const recent = issueFreshness({ updated_at: new Date().toISOString() });
    const old = issueFreshness({ updated_at: new Date(Date.now() - 500 * 864e5).toISOString() });
    assert.ok(recent > old);
  });
});

describe("friendliness", () => {
  test("active repo is friendlier than an idle one", () => {
    const active = calculateRepositoryFriendliness(repo(1, { last_pushed_at: new Date().toISOString(), stars: 3000 }));
    const idle = calculateRepositoryFriendliness(repo(1, { last_pushed_at: new Date(Date.now() - 400 * 864e5).toISOString(), stars: 5 }));
    assert.ok(active.score > idle.score);
    assert.ok(active.score >= 0 && active.score <= 1);
  });

  test("null repo yields 0 without crashing", () => {
    assert.equal(calculateRepositoryFriendliness(null).score, 0);
  });
});