import {
  getGithubAccountByIdWithToken,
  setBackfillStatus,
  markBackfillCompleted,
} from "../../models/githubAccountModel.js";
import { insertEvidenceEvents, EVENT_TYPES, listEvidenceForAccount } from "../../models/evidenceModel.js";
import { upsertSkillsForAccount, deleteSkillsForAccount } from "../../models/skillEvidenceModel.js";
import { mapWithConcurrency } from "../../utils/concurrency.js";
import { getAuthenticatedUser } from "./githubUser.js";
import { listUserRepositories, getRepositoryLanguages } from "./githubRepositories.js";
import { listMergedPullRequests, listPullRequestFiles } from "./githubPullRequests.js";
import { listUserReviewedPullRequests } from "./githubReviews.js";
import { decryptGithubToken } from "../../utils/githubTokenCrypto.js";
import { createGithubClient } from "./githubClient.js";
import {
  extractSkillsFromRepository,
  extractSkillsFromPullRequest,
} from "../skills/skillExtractor.js";
import { calculateSkillScores } from "../skills/skillEvidenceCalculator.js";
import { setCache, delCache } from "../../utils/cache.js";

const MAX_PAGES = parseInt(process.env.GITHUB_BACKFILL_MAX_PAGES || "10", 10);
const MAX_PR_FILES = parseInt(process.env.GITHUB_BACKFILL_MAX_PR_FILES || "30", 10);
const MAX_REPOS_LANGUAGES = parseInt(process.env.GITHUB_BACKFILL_MAX_REPOS_LANGUAGES || "50", 10);
// Parallelism bounds. The octokit throttling plugin queues and retries on rate
// limits, so concurrent round-trips are safe; these caps just prevent a burst
// from hammering GitHub before the secondary rate limiter kicks in.
const CONCURRENCY_PRS = parseInt(process.env.GITHUB_BACKFILL_PR_CONCURRENCY || "8", 10);
const CONCURRENCY_LANGUAGES = parseInt(
  process.env.GITHUB_BACKFILL_LANGUAGE_CONCURRENCY || "10",
  10
);

const prSourceUrl = (pr) =>
  pr.html_url ||
  `https://github.com/${pr.repository?.full_name}/pull/${pr.number}`;

const prEventId = (pr) => `${pr.repository?.id}:${pr.number}`;

// GitHub search results carry the repo under `repository`, and full PR details
// (incl. merge_commit_sha) must be fetched separately via pulls.get.
async function getPullRequestDetail(client, repo, prNumber) {
  return client.request((octokit) =>
    octokit.rest.pulls.get({
      owner: repo.owner?.login,
      repo: repo.name,
      pull_number: prNumber,
    })
  );
}

// Build one CONTRIBUTED_REPOSITORY event per repo with its language skills.
async function recordContributedRepositories({ accountId, client, ownedRepos, mergedPrRepos }) {
  const reposByFullName = new Map();
  for (const repo of ownedRepos) {
    reposByFullName.set(repo.full_name, repo);
  }
  // Merged PRs also count as repos we contributed to.
  for (const [fullName, repo] of mergedPrRepos.entries()) {
    if (!reposByFullName.has(fullName)) {
      reposByFullName.set(fullName, repo);
    }
  }

  const repos = [...reposByFullName.values()];
  const eligible = repos.filter((r) => r.owner?.login && r.name).slice(0, MAX_REPOS_LANGUAGES);
  // Languages are enrichment only; a failure must not fail the backfill.
  const languageStatsByRepo = new Map();
  await mapWithConcurrency(eligible, CONCURRENCY_LANGUAGES, async (repo) => {
    try {
      const languageStats = await getRepositoryLanguages(client, repo.owner.login, repo.name);
      languageStatsByRepo.set(repo.full_name, languageStats);
    } catch {
      /* enrichment only */
    }
  });

  const events = [];
  for (const repo of repos) {
    const languageStats = languageStatsByRepo.get(repo.full_name) || {};
    const skills = extractSkillsFromRepository(repo, languageStats);
    events.push({
      githubAccountId: accountId,
      eventType: EVENT_TYPES.CONTRIBUTED_REPOSITORY,
      githubEventId: `repo:${repo.id}`,
      repoId: repo.id,
      repoFullName: repo.full_name,
      language: repo.language || null,
      metadata: {
        skills,
        languages: Object.keys(languageStats).slice(0, 10),
        topics: repo.topics || [],
        description: repo.description || null,
        owner: repo.owner?.login || null,
        name: repo.name || null,
      },
      occurredAt: repo.pushed_at || repo.updated_at || null,
      sourceUrl: repo.html_url || null,
    });
  }
  await insertEvidenceEvents(events);
  return reposByFullName.size;
}

// Record merged PRs (and a deterministic COMMIT per merge_commit_sha).
// Returns the repos these PRs hit so they can be covered by
// CONTRIBUTED_REPOSITORY evidence too.
async function recordMergedPullRequests({ accountId, client, login }) {
  let count = 0;
  const touchedRepos = new Map();
  let filesBudget = MAX_PR_FILES;
  const events = [];
  // Paginate with a bounded page count so a prolific dev cannot blow the rate cap.
  const prs = await listMergedPullRequests(client, login, { perPage: 100, maxPages: MAX_PAGES });

  // Process PRs concurrently: each one's detail + file fetches already run in
  // parallel, and now multiple PRs are in flight at once. Budget updates and
  // array pushes are synchronous, so the shared counters stay safe.
  await mapWithConcurrency(prs, CONCURRENCY_PRS, async (pr) => {
    const repo = pr.repository;
    if (!repo) return;
    if (repo.full_name) touchedRepos.set(repo.full_name, repo);
    const skills = [];
    let mergeCommitSha = null;
    if (filesBudget > 0) {
      const [files, detail] = await Promise.allSettled([
        listPullRequestFiles(client, repo.owner?.login, repo.name, pr.number, { perPage: 100 }),
        getPullRequestDetail(client, repo, pr.number),
      ]);
      if (files.status === "fulfilled") {
        skills.push(...extractSkillsFromPullRequest(pr, files.value));
      } else {
        skills.push(...extractSkillsFromPullRequest(pr, []));
      }
      if (detail.status === "fulfilled") {
        mergeCommitSha = detail.value.merge_commit_sha || null;
      }
      filesBudget -= 1;
    } else {
      skills.push(...extractSkillsFromPullRequest(pr, []));
    }

    events.push({
      githubAccountId: accountId,
      eventType: EVENT_TYPES.MERGED_PR,
      githubEventId: prEventId(pr),
      repoId: repo.id,
      repoFullName: repo.full_name,
      prNumber: pr.number,
      language: repo.language || null,
      metadata: {
        skills,
        title: pr.title || null,
        body: pr.body || null,
        labels: (pr.labels || []).map((l) => l.name),
        merged_at: pr.pull_request?.merged_at || pr.closed_at || null,
      },
      occurredAt: pr.pull_request?.merged_at || pr.closed_at || pr.updated_at,
      sourceUrl: prSourceUrl(pr),
    });

    if (mergeCommitSha) {
      events.push({
        githubAccountId: accountId,
        eventType: EVENT_TYPES.COMMIT,
        githubEventId: mergeCommitSha,
        repoId: repo.id,
        repoFullName: repo.full_name,
        commitSha: mergeCommitSha,
        metadata: { skills },
        occurredAt: pr.pull_request?.merged_at || pr.closed_at || null,
        sourceUrl: `${prSourceUrl(pr)}/commits/${mergeCommitSha}`,
      });
    }
    count += 1;
  });

  await insertEvidenceEvents(events);
  return { count, repos: touchedRepos };
}

async function recordPullRequestReviews({ accountId, client, login }) {
  const prs = await listUserReviewedPullRequests(client, login, { perPage: 100, maxPages: MAX_PAGES });
  const events = [];
  for (const pr of prs) {
    const repo = pr.repository;
    if (!repo) continue;
    events.push({
      githubAccountId: accountId,
      eventType: EVENT_TYPES.PR_REVIEW,
      githubEventId: `review:${repo.id}:${pr.number}`,
      repoId: repo.id,
      repoFullName: repo.full_name,
      prNumber: pr.number,
      language: repo.language || null,
      metadata: {
        title: pr.title || null,
        labels: (pr.labels || []).map((l) => l.name),
      },
      occurredAt: pr.pull_request?.merged_at || pr.updated_at,
      sourceUrl: pr.html_url || `https://github.com/${repo.full_name}/pull/${pr.number}`,
    });
  }
  await insertEvidenceEvents(events);
  return events.length;
}

// Recompute skill_evidence for an account from all its evidence events.
async function computeAndStoreSkills(accountId) {
  await deleteSkillsForAccount(accountId);
  // Re-read events from the DB: the source of truth.
  const skillScores = await calculateSkillScoresForAccount(accountId);
  await upsertSkillsForAccount(
    accountId,
    skillScores.map((s) => ({
      skill: s.skill,
      score: s.score,
      evidenceCount: s.evidence_count,
      mergedPrCount: s.merged_pr_count,
      reviewCount: s.review_count,
      repositoryCount: s.repository_count,
      lastSeenAt: s.last_seen_at,
    }))
  );
  await delCache(`github:skills:${accountId}`);
  await setCache(`github:skills:${accountId}`, skillScores, 300);
  return skillScores;
}

async function calculateSkillScoresForAccount(accountId) {
  const events = await listEvidenceForAccount(accountId);
  return calculateSkillScores(events);
}

// Full backfill for a signed-in GitHub account. `client` is injectable so tests
// can drive collection with stubs; production builds it from the stored token.
export async function runBackfill(accountId, { client } = {}) {
  const account = await getGithubAccountByIdWithToken(accountId);
  if (!account) throw new Error(`GitHub account ${accountId} not found`);
  if (!account.user_id) throw new Error(`GitHub account ${accountId} has no DevCollab user`);

  await setBackfillStatus(accountId, "RUNNING");
  await delCache(`github:backfill:${accountId}`);
  await setCache(`github:backfill:${accountId}`, "RUNNING", 60);

  try {
    let activeClient = client;
    if (!activeClient) {
      const token = decryptGithubToken(account.access_token_encrypted);
      activeClient = createGithubClient(token);
    }

    const githubUser = await getAuthenticatedUser(activeClient);
    const login = githubUser.login;

    const ownedRepos = await listUserRepositories(activeClient, login);
    // Non-fork repos the user owns or collaborates on count as contribution.
    const meaningfulRepos = ownedRepos.filter((r) => !r.fork);

    // PR discovery and review discovery use independent API buckets, so they
    // run concurrently; PR processing and reviews only touch the DB afterwards.
    const [prResult] = await Promise.all([
      recordMergedPullRequests({
        accountId,
        client: activeClient,
        login,
      }),
      recordPullRequestReviews({ accountId, client: activeClient, login }),
    ]);

    await recordContributedRepositories({
      accountId,
      client: activeClient,
      ownedRepos: meaningfulRepos,
      mergedPrRepos: prResult.repos,
    });

    await computeAndStoreSkills(accountId);

    await delCache(`github:skills:${accountId}`);
    await delCache(`github:evidence:${accountId}`);
    await delCache(`github:user:${githubUser.id}`);
    await markBackfillCompleted(accountId);
    await setCache(`github:backfill:${accountId}`, "COMPLETED", 60);

    return { status: "COMPLETED", login };
  } catch (err) {
    await setBackfillStatus(accountId, "FAILED", err?.message || "GitHub backfill failed");
    await delCache(`github:backfill:${accountId}`);
    await setCache(`github:backfill:${accountId}`, "FAILED", 60);
    throw err;
  }
}

export { computeAndStoreSkills };