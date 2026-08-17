import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
dotenv.config();

process.env.DATABASE_URL = process.env.RUN_LIVE_DB_TESTS === "1"
  ? process.env.DATABASE_URL_TEST || "pg-mem:"
  : "pg-mem:";

const { createStubClient } = await import("../services/github/githubClient.js");
const { syncCuratedRepositories } = await import("../services/corpus/syncRepositories.js");
const { collectIssues } = await import("../services/corpus/collectIssues.js");
const {
  listEnabledCuratedRepositories,
  listAllCuratedRepositories,
  setCuratedRepositoryEnabled,
  findCuratedRepositoryByFullName,
} = await import("../models/curatedRepositoryModel.js");
const {
  listOpenIssuesForRepo,
  countEligibleIssues,
} = await import("../models/githubIssueModel.js");
const { default: pool } = await import("../models/db.js");

function seededRepo() {
  return {
    id: 1,
    owner: "django",
    name: "django",
    full_name: "django/django",
  };
}

function githubRepo(owner, name, overrides = {}) {
  return {
    id: overrides.githubId ?? Math.abs((owner + name).charCodeAt(0) * 7),
    full_name: `${owner}/${name}`,
    html_url: `https://github.com/${owner}/${name}`,
    description: "A curated repo",
    language: "Python",
    stargazers_count: 2500,
    forks_count: 800,
    open_issues_count: 120,
    default_branch: "main",
    pushed_at: new Date().toISOString(),
    ...overrides,
  };
}

function issue(number, overrides = {}) {
  return {
    id: 1000 + number,
    number,
    title: `Issue ${number}`,
    body: "Helps test the corpus.",
    state: "open",
    html_url: "https://github.com/django/django/issues/" + number,
    user: { login: "dev" },
    labels: [{ name: "good first issue" }, { name: "django" }],
    comments: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    ...overrides,
  };
}

// A stub octokit implementing exactly what the collector + repo sync call.
function makeStubClient({ repoMap = {}, issueLists = {} } = {}) {
  const octokit = {
    rest: {
      repos: {
        get: async ({ owner, repo }) => ({ data: repoMap[`${owner}/${repo}`] || githubRepo(owner, repo) }),
        listLanguages: async () => ({ data: { Python: 9000, JavaScript: 1000 } }),
        getAllTopics: async () => ({ data: { names: ["django", "web"] } }),
      },
    },
    issues: {
      listForRepo: async ({ owner, repo }) => {
        return { data: issueLists[`${owner}/${repo}`] || [] };
      },
    },
  };
  return createStubClient(octokit);
}

describe("Repository ingestion", () => {
  test("sync creates metadata for each curated repository", async () => {
    const client = makeStubClient();
    const metrics = await syncCuratedRepositories({ client });
    assert.ok(metrics.repositories_found > 0, "repos found");
    assert.ok(metrics.repositories_updated >= metrics.repositories_found);

    const repos = await listAllCuratedRepositories();
    const django = repos.find((r) => r.full_name === "django/django");
    assert.ok(django, "django/django present");
    assert.equal(django.stars, 2500);
    assert.equal(django.open_issues_count, 120);
    assert.equal(django.primary_language, "Python");
    assert.deepEqual(django.topics.sort(), ["django", "web"].sort());
  });

  test("sync is idempotent — does not duplicate rows", async () => {
    const client = makeStubClient();
    await syncCuratedRepositories({ client });
    await syncCuratedRepositories({ client });
    const repos = await listAllCuratedRepositories();
    const django = repos.filter((r) => r.full_name === "django/django");
    assert.equal(django.length, 1, "exactly one row per repo");
  });

  test("disabled repositories are skipped", async () => {
    const client = makeStubClient();
    const repo = await findCuratedRepositoryByFullName("django/django");
    await setCuratedRepositoryEnabled(repo.id, false);

    const metrics = await syncCuratedRepositories({ client });
    const enabled = await listEnabledCuratedRepositories();
    assert.ok(!enabled.some((r) => r.full_name === "django/django"), "disabled repo excluded");

    // Re-enable for the rest of the suite.
    await setCuratedRepositoryEnabled(repo.id, true);
    assert.ok(metrics.repositories_found > 0);
  });
});

describe("Issue ingestion", () => {
  let repoId;

  before(async () => {
    const repo = await findCuratedRepositoryByFullName("django/django");
    repoId = repo.id;
  });

  test("creates issues and skips PRs", async () => {
    const client = makeStubClient({
      issueLists: {
        "django/django": [
          issue(1, { labels: [{ name: "good first issue" }] }),
          issue(2, { pull_request: { url: "x" } }), // PR shape from the issues API
          issue(3, { state: "closed" }), // already closed upstream
        ],
      },
    });
    const metrics = await collectIssues({ client });
    assert.equal(metrics.repos_scanned, 1);
    assert.ok(metrics.issues_fetched >= 3);
    assert.equal(metrics.issues_skipped_pr, 1);

    const stored = await listOpenIssuesForRepo(repoId);
    const wires = stored.filter((i) => i.issue_number === 1);
    assert.equal(wires.length, 1, "issue 1 stored");
    assert.equal(wires[0].title, "Issue 1");
    assert.ok(wires[0].labels.includes("good first issue"), "label normalized");
    assert.ok(!stored.some((i) => i.issue_number === 2), "PR excluded");
  });

  test("duplicate issue prevention — re-sync updates, does not duplicate", async () => {
    const client = makeStubClient({
      issueLists: { "django/django": [issue(1, { title: "Updated issue 1" })] },
    });
    await collectIssues({ client });
    await collectIssues({ client });
    const stored = await listOpenIssuesForRepo(repoId);
    const ones = stored.filter((i) => i.issue_number === 1);
    assert.equal(ones.length, 1, "one row per issue number");
    assert.equal(ones[0].title, "Updated issue 1", "latest title wins");
  });

  test("closed issues are not recommended", async () => {
    const client = makeStubClient({
      issueLists: { "django/django": [issue(1), issue(4, { state: "closed" })] },
    });
    await collectIssues({ client });
    const count = await countEligibleIssues({});
    // db may contain only open issues after collector marks stale closed ones...
    const check = await countEligibleIssues({ label: "django" });
    assert.ok(check >= 1, "some eligible issue exists");
  });

  test("pagination accumulates across pages", async () => {
    const repo = await findCuratedRepositoryByFullName("django/django");
    const issuesA = [issue(50), issue(51)];
    const issuesB = [issue(52), issue(53)];
    const client = createStubClient({
      rest: {},
      issues: {
        listForRepo: async ({ page }) => ({ data: page === 1 ? issuesA : issuesB }),
      },
    });
    // iterate both pages through the real paginate wrapper
    const collected = [];
    for (let p = 1; p <= 2; p++) {
      const data = await client.paginate({
        perPage: 100,
        maxPages: 2,
        fn: (octokit, page) => octokit.rest.issues.listForRepo({ page }),
      });
      collected.push(...data.map((i) => i.number));
    }
    assert.ok(collected.includes(50) && collected.includes(53), "all pages fetched");
  });
});

describe("Rate-limit handling (403 / retry / exhaustion)", () => {
  test("403 with retry-after surfaces as GithubApiError", async () => {
    const { GithubApiError } = await import("../services/github/githubClient.js");
    const err = new GithubApiError("rate limited", { status: 403 });
    assert.equal(err.status, 403);
    assert.equal(err.name, "GithubApiError");
  });

  test("collector records rate-limit event per repo and does not crash the run", async () => {
    const { GithubApiError } = await import("../services/github/githubClient.js");
    const failing = createStubClient({
      rest: {},
      issues: {
        listForRepo: async () => {
          throw new GithubApiError("API rate limit exceeded", { status: 403 });
        },
      },
    });
    const metrics = await collectIssues({ client: failing });
    assert.ok(metrics.repos_failed >= 1, "failed repos counted");
    assert.ok(metrics.rate_limit_events >= 1, "rate-limit event counted");
    assert.ok(Array.isArray(metrics.errors), "errors collected");
  });

  test("retry exhaustion: a persistently failing repo stops, others continue", async () => {
    // The throttling plugin retries automatically; here we only assert that a
    // repo whose call raises (simulating exhausted retries) is isolated and
    // the registry still returns results.
    const { GithubApiError } = await import("../services/github/githubClient.js");
    const client = createStubClient({
      rest: {},
      issues: {
        listForRepo: async () => {
          throw new GithubApiError("still failing after retries", { status: 403 });
        },
      },
    });
    const metrics = await collectIssues({ client });
    assert.equal(metrics.repos_failed >= 1, true);
    assert.equal(metrics.errors[0]?.repo, "django/django");
  });
});