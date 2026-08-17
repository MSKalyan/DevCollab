import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
dotenv.config();

// pg-mem by default; RUN_LIVE_DB_TESTS=1 (+ DATABASE_URL_TEST) to use real PG.
process.env.DATABASE_URL = process.env.RUN_LIVE_DB_TESTS === "1"
  ? process.env.DATABASE_URL_TEST || "pg-mem:"
  : "pg-mem:";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY || "test-encryption-key-do-not-use-in-prod";

const { createUser } = await import("../models/userModel.js");
const { upsertGithubAccount, findGithubAccountByUserId, setBackfillStatus } = await import("../models/githubAccountModel.js");
const models = await import("../models/evidenceModel.js");
const { listSkillsForAccount } = await import("../models/skillEvidenceModel.js");
const { runBackfill } = await import("../services/github/backfill.js");
const { buildGithubSnapshot } = await import("../controllers/authController.js");
const { createStubClient } = await import("../services/github/githubClient.js");
const { encryptGithubToken } = await import("../utils/githubTokenCrypto.js");

// Stub octokit implements exactly the REST methods the backfill uses.
function makeSearchResponse(items) {
  return { data: { total_count: items.length, items } };
}

function buildStubOctokit({ user, repos = [], prs = [], reviewPrs = [], mergeCommitSha = null }) {
  const defaultRepo = repoFor("owner", "sample-repo");

  const repoMap = new Map(repos.map((r) => [r.full_name, r]));
  const languagesFor = (fullName) => repoMap.get(fullName)?.languages || { Python: 100 };

  return {
    rest: {
      users: {
        getAuthenticated: async () => ({ data: user }),
      },
      repos: {
        listForAuthenticatedUser: async ({ page, per_page }) => {
          const start = (page - 1) * per_page;
          const slice = repos.slice(start, start + per_page);
          return { data: slice };
        },
        listLanguages: async ({ owner, repo }) => ({ data: languagesFor(`${owner}/${repo}`) }),
      },
      search: {
        issuesAndPullRequests: async ({ q }) => {
          if (q.includes("is:merged")) return makeSearchResponse(prs);
          if (q.includes("reviewed-by")) return makeSearchResponse(reviewPrs);
          return makeSearchResponse([]);
        },
      },
      pulls: {
        get: async () => ({ data: { merge_commit_sha: mergeCommitSha } }),
        listFiles: async () => ({ data: [{ filename: "app/views.py" }, { filename: "src/index.tsx" }] }),
      },
    },
  };
}

function repoFor(owner, name, { language = "Python", topics = [], id = null, fork = false } = {}) {
  const repo = {
    id: id || Math.abs(name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)),
    name,
    full_name: `${owner}/${name}`,
    language,
    topics,
    description: `${name} repo`,
    html_url: `https://github.com/${owner}/${name}`,
    owner: { login: owner },
    fork,
    pushed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  repo.languages = { [language]: 1000 };
  return repo;
}

function prFor(repo, number, { body = "", title = `PR #${number}` } = {}) {
  return {
    id: number,
    number,
    title,
    body,
    html_url: `${repo.html_url}/pull/${number}`,
    updated_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
    labels: [],
    repository: repo,
    pull_request: { merged_at: new Date().toISOString() },
  };
}

describe("GitHub backfill", () => {
  let userId;
  let account;

  before(async () => {
    const user = await createUser("Dev", "backfill@example.com", "password123");
    userId = user.id;
  });

  test("runs a full backfill and stores evidence + skills", async () => {
    const repo = repoFor("django-project-org", "blog", { language: "Python", topics: ["django", "postgresql"] });
    const secondRepo = repoFor("django-project-org", "api", { language: "Python", topics: ["django"] });
    const prs = [
      prFor(repo, 101, { title: "Add Redis caching to Django views", body: "uses redis" }),
      prFor(secondRepo, 202, { title: "TypeScript UI", body: "react components" }),
    ];
    const reviewPr = prFor(repo, 55);

    const octokit = buildStubOctokit({
      user: { id: 9001, login: "devbot", name: "Dev Bot", avatar_url: "", html_url: "" },
      repos: [repo, secondRepo],
      prs,
      reviewPrs: [reviewPr],
      mergeCommitSha: "abc123",
    });
    const client = createStubClient(octokit);

    const encrypted = encryptGithubToken("gh_token_FOO");
    const acc = await upsertGithubAccount({
      userId,
      githubUserId: 9001,
      login: "devbot",
      name: "Dev Bot",
      avatarUrl: "",
      profileUrl: "",
      accessTokenEncrypted: encrypted,
      tokenExpiresAt: null,
    });
    account = await findGithubAccountByUserId(userId);
    assert.ok(account);

    const result = await runBackfill(account.id, { client });
    assert.equal(result.status, "COMPLETED");

    const completed = await findGithubAccountByUserId(userId);
    assert.equal(completed.backfill_status, "COMPLETED");
    assert.ok(completed.last_synced_at);
  });

  test("repeated backfill is idempotent (no duplicate evidence)", async () => {
    const before1 = await models.countEvidenceByType(account.id);
    const counts1 = before1.reduce((a, r) => ((a[r.event_type] = Number(r.total)), a), {});

    // Re-run with the same stub — unique constraints must swallow duplicates.
    const repo = repoFor("django-project-org", "blog", { language: "Python", topics: ["django"] });
    const octokit = buildStubOctokit({
      user: { id: 9001, login: "devbot", name: "Dev Bot", avatar_url: "", html_url: "" },
      repos: [repo],
      prs: [prFor(repo, 101)],
      reviewPrs: [],
      mergeCommitSha: "abc123",
    });
    await runBackfill(account.id, { client: createStubClient(octokit) });

    const after = await models.countEvidenceByType(account.id);
    const counts2 = after.reduce((a, r) => ((a[r.event_type] = Number(r.total)), a), {});

    for (const type of Object.keys(counts1)) {
      assert.equal(counts2[type], counts1[type], `${type} count must not grow on re-run`);
    }
    // Merged PR + COMMIT from the same repo/PR must still be exactly one each.
    assert.equal(counts2.MERGED_PR, 2);
    assert.equal(counts2.COMMIT, 1);
    assert.equal(counts2.CONTRIBUTED_REPOSITORY, 2);
  });

  test("skill evidence is derived and persisted", async () => {
    const skills = await listSkillsForAccount(account.id);
    const names = skills.map((s) => s.skill);
    assert.ok(skills.length >= 3, JSON.stringify(skills));
    assert.ok(names.includes("django"));
    assert.ok(names.includes("python"));
    // Django appears on more evidence than merely-authored PRs.
    const django = skills.find((s) => s.skill === "django");
    assert.ok(django.evidence_count >= 2, JSON.stringify(django));
    assert.ok(django.score > 0 && django.score <= 1);
  });

  test("contributed repositories are listed with metadata", async () => {
    const repos = await models.listContributedRepositories(account.id);
    assert.ok(repos.length >= 2, JSON.stringify(repos));
    const blog = repos.find((r) => r.repo_full_name === "django-project-org/blog");
    assert.ok(blog, "blog repo present");
    assert.equal(blog.language, "Python");
    assert.ok(blog.source_url.startsWith("https://github.com/"));
    assert.ok(blog.metadata.topics.includes("django"), "topics persisted");
    assert.ok(blog.metadata.languages.includes("Python"), "languages persisted");
    assert.ok(blog.metadata.description, "description persisted");
  });

  test("public profile snapshot exposes evidence (and stays null when not connected)", async () => {
    const snapshot = await buildGithubSnapshot(userId);
    assert.ok(snapshot, "snapshot present when connected");
    assert.equal(snapshot.username, "devbot");
    assert.equal(snapshot.statistics.merged_prs, 2);
    assert.equal(snapshot.statistics.reviews, 1);
    assert.ok(snapshot.skills.length >= 3, JSON.stringify(snapshot.skills));
    assert.ok(snapshot.repositories.length >= 2);
    const blog = snapshot.repositories.find((r) => r.fullName === "django-project-org/blog");
    assert.ok(blog, "blog repo in snapshot");
    assert.equal(blog.language, "Python");
    assert.equal(blog.description, "blog repo");
    assert.deepEqual(blog.topics, ["django", "postgresql"]);

    assert.equal(await buildGithubSnapshot(999999), null, "unconnected user -> null");
  });

  test("marks FAILED when the GitHub API rejects the token", async () => {
    setBackfillStatus(account.id, "COMPLETED", null);
    const failing = {
      rest: {
        users: {
          getAuthenticated: async () => {
            const err = new Error("Bad credentials");
            err.status = 401;
            throw err;
          },
        },
      },
    };
    await assert.rejects(
      runBackfill(account.id, { client: createStubClient(failing) }),
      /Bad credentials/
    );
    const failed = await findGithubAccountByUserId(userId);
    assert.equal(failed.backfill_status, "FAILED");
  });

  test("disconnect deletes evidence and frees the GitHub binding", async () => {
    const { deleteGithubAccountForUser } = await import("../models/githubAccountModel.js");
    const { countEvidenceForAccount } = await import("../models/githubAccountModel.js");

    assert.ok((await countEvidenceForAccount(account.id)) > 0, "evidence existed");
    const deleted = await deleteGithubAccountForUser(userId);
    assert.ok(deleted, "account row deleted");
    assert.equal(await findGithubAccountByUserId(userId), null, "account gone");
    assert.equal(await buildGithubSnapshot(userId), null, "snapshot gone after disconnect");

    // Reconnect the same GitHub identity now succeeds (guard sees no binding).
    const encrypted = encryptGithubToken("gh_token_FOO");
    await upsertGithubAccount({
      userId,
      githubUserId: 9001,
      login: "devbot",
      name: "Dev Bot",
      avatarUrl: "",
      profileUrl: "",
      accessTokenEncrypted: encrypted,
      tokenExpiresAt: null,
    });
    assert.ok(await findGithubAccountByUserId(userId), "reconnected");
  });
});