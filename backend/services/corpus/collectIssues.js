// Phase 2 issue collector: fetch open issues for every enabled curated
// repository and persist them idempotently. Handles PR filtering, label
// normalization, closed-issue detection, and rate-limit surfacing.

import { createGithubClient, GithubApiError } from "../github/githubClient.js";
import { listOpenIssues } from "../github/githubIssues.js";
import { listEnabledCuratedRepositories } from "../../models/curatedRepositoryModel.js";
import {
  upsertGithubIssue,
  markMissingIssuesStale,
} from "../../models/githubIssueModel.js";
import { normalizeLabels } from "../github/labels.js";
import { delCacheByPattern } from "../../utils/cache.js";

function isPullRequest(issue) {
  return Boolean(
    issue.pull_request ||
      String(issue.is_pull_request || "") === "true"
  );
}

function issueFromGitHub(issue, { repo, fetchedAt }) {
  return {
    githubIssueId: issue.id,
    repositoryId: repo.id,
    issueNumber: issue.number,
    title: issue.title || "",
    body: issue.body || null,
    state: issue.state || "open",
    htmlUrl: issue.html_url || null,
    authorLogin: issue.user?.login || null,
    labels: normalizeLabels((issue.labels || []).map((l) => l.name || l)),
    repoTopics: repo.topics || [],
    repoLanguage: repo.primary_language || repo.language || null,
    commentsCount: issue.comments || 0,
    createdAt: issue.created_at || null,
    updatedAt: issue.updated_at || null,
    closedAt: issue.closed_at || null,
    isPullRequest: isPullRequest(issue),
    fetchedAt,
  };
}

// Structured per-run metrics for the logs.
export function createCollectorMetrics() {
  return {
    started_at: Date.now(),
    repos_scanned: 0,
    repos_skipped_disabled: 0,
    repos_failed: 0,
    issues_fetched: 0,
    issues_created: 0,
    issues_updated: 0,
    issues_skipped_pr: 0,
    issues_skipped_closed: 0,
    issues_stale_closed: 0,
    rate_limit_events: 0,
    errors: [],
  };
}

// Collect a single repository's open issues into the corpus.
async function collectRepoIssues(client, repo, { metrics, fetchedAt, maxPages, perPage }) {
  const issues = await listOpenIssues(client, repo.owner, repo.name, {
    perPage,
    maxPages,
  });

  const seen = [];
  for (const ghIssue of issues) {
    metrics.issues_fetched += 1;
    // Never store PRs: GitHub's issues endpoint returns them.
    if (isPullRequest(ghIssue)) {
      metrics.issues_skipped_pr += 1;
      continue;
    }
    const stored = await upsertGithubIssue({
      ...issueFromGitHub(ghIssue, { repo, fetchedAt }),
    });
    await delCache(`github:issue:${ghIssue.id}`);
    if (stored.created_at_db && stored.updated_at_db) {
      // Decide created vs updated: rows created this run have created_at_db == NOW
      const ranAt = new Date(fetchedAt).toISOString();
      const createdDb = new Date(stored.created_at_db).toISOString();
      const withinRound = Math.abs(new Date(createdDb) - new Date(ranAt)) < 60_000;
      if (withinRound) {
        metrics.issues_created += 1;
      } else {
        metrics.issues_updated += 1;
      }
    } else {
      metrics.issues_updated += 1;
    }
    seen.push(ghIssue.number);
  }

  // Anything still open locally but absent from GitHub (closed/PR/delisted)
  // is marked stale so it stops being recommended.
  const stale = await markMissingIssuesStale(repo.id, seen, fetchedAt);
  metrics.issues_stale_closed += stale.length;
  return { seen };
}

// Main entry point: sync issues for all enabled curated repositories.
export async function collectIssues({ client, maxPages, perPage } = {}) {
  const metrics = createCollectorMetrics();
  const fetchedAt = new Date();

  const activeClient =
    client ||
    (process.env.NODE_ENV === "test"
      ? createGithubClient(undefined) // tests inject their own client
      : createGithubClient(process.env.GITHUB_CORPUS_TOKEN));

  const repos = await listEnabledCuratedRepositories();
  for (const repo of repos) {
    if (!repo.enabled) {
      metrics.repos_skipped_disabled += 1;
      continue;
    }
    metrics.repos_scanned += 1;
    try {
      await collectRepoIssues(activeClient, repo, {
        metrics,
        fetchedAt,
        maxPages: maxPages ?? parseInt(process.env.ISSUE_COLLECTOR_MAX_PAGES || "10", 10),
        perPage: perPage ?? parseInt(process.env.ISSUE_COLLECTOR_PER_PAGE || "100", 10),
      });
    } catch (err) {
      metrics.repos_failed += 1;
      metrics.errors.push({ repo: repo.full_name, message: err?.message || "collect failed" });
      if (err instanceof GithubApiError) {
        if (err.status === 429 || err.status === 403) metrics.rate_limit_events += 1;
      }
    }
  }

  // Guarantee the corpus view in Redis is refreshed after a sync.
  await delCacheByPattern("github:issues:*");

  metrics.duration_ms = Date.now() - metrics.started_at;
  return metrics;
}