import dotenv from "dotenv";
dotenv.config();

import { connectRedis } from "../config/redis.js";
import client from "../config/redis.js";
import { initDatabase } from "../db/init.js";
import { popJob, ackJob, JOB_KEYS, JOB_TYPES, enqueueRepositorySync, enqueueIssueSync } from "./queue.js";
import { runBackfill } from "../services/github/backfill.js";
import { syncCuratedRepositories } from "../services/corpus/syncRepositories.js";
import { collectIssues } from "../services/corpus/collectIssues.js";
import { emit, mergeSyncMetrics } from "../utils/metrics.js";

// On boot, restore any jobs stranded in the processing list back to the queue.
async function restoreStrandedJobs() {
  if (!client.isReady) return 0;
  let restored = 0;
  try {
    // BrPopLPush moves jobs to a processing list only when the worker grabs
    // them. On a hard crash mid-job, a job left in processing is re-queued so
    // it runs on restart. Idempotent evidence inserts make this safe.
    const stranded = await client.lRange(JOB_KEYS.PROCESSING_KEY, 0, -1);
    if (stranded.length > 0) {
      const priority = [];
      const normal = [];
      for (const raw of stranded) {
        try {
          const job = JSON.parse(raw);
          if (job.type === JOB_TYPES.BACKFILL_GITHUB_USER) priority.push(raw);
          else normal.push(raw);
        } catch {
          normal.push(raw);
        }
      }
      for (const raw of priority) await client.rPush(JOB_KEYS.PRIORITY_QUEUE_KEY, raw);
      for (const raw of normal) await client.rPush(JOB_KEYS.QUEUE_KEY, raw);
      await client.del(JOB_KEYS.PROCESSING_KEY);
      restored = stranded.length;
    }
  } catch (err) {
    console.error("Failed to restore stranded jobs:", err.message);
  }
  return restored;
}

async function handleJob(job) {
  if (!job) return;
  try {
    switch (job.type) {
      case JOB_TYPES.BACKFILL_GITHUB_USER:
        console.log(`[worker] backfilling github_account id=${job.githubAccountId}`);
        await runBackfill(job.githubAccountId);
        emit("backfill_completed", { githubAccountId: job.githubAccountId });
        break;
      case JOB_TYPES.SYNC_CURATED_REPOSITORIES:
        emit("repository_sync_started", {});
        const repoMetrics = await syncCuratedRepositories();
        emit("repository_sync_completed", {
          repositories_found: repoMetrics.repositories_found,
          repositories_updated: repoMetrics.repositories_updated,
          repositories_failed: repoMetrics.repositories_failed,
          errors: repoMetrics.errors.length,
        });
        mergeSyncMetrics(repoMetrics);
        console.log(
          `[worker] repository sync: found=${repoMetrics.repositories_found} updated=${repoMetrics.repositories_updated} failed=${repoMetrics.repositories_failed}`
        );
        break;
      case JOB_TYPES.SYNC_GITHUB_ISSUES:
        emit("issue_sync_started", {});
        const issueMetrics = await collectIssues();
        emit("issue_sync_completed", {
          repos_scanned: issueMetrics.repos_scanned,
          issues_fetched: issueMetrics.issues_fetched,
          issues_created: issueMetrics.issues_created,
          issues_updated: issueMetrics.issues_updated,
          issues_skipped_pr: issueMetrics.issues_skipped_pr,
          issues_stale_closed: issueMetrics.issues_stale_closed,
          rate_limit_events: issueMetrics.rate_limit_events,
          errors: issueMetrics.errors.length,
        });
        mergeSyncMetrics(issueMetrics);
        console.log(
          `[worker] issue sync: fetched=${issueMetrics.issues_fetched} created=${issueMetrics.issues_created} ` +
          `updated=${issueMetrics.issues_updated} stale_closed=${issueMetrics.issues_stale_closed} ` +
          `rate_limits=${issueMetrics.rate_limit_events} failed_repos=${issueMetrics.repos_failed}`
        );
        break;
      default:
        console.warn(`[worker] unknown job type: ${job.type}`);
    }
  } catch (err) {
    console.error(`[worker] job failed (${job.type}):`, err.message);
  }
  await ackJob(job);
}

// Schedule recurring corpus maintenance. The worker never self-poisoned the
// queue: each interval run enqueues exactly one repo sync + issue sync.
function startScheduler() {
  const intervalMs = parseInt(process.env.ISSUE_SYNC_INTERVAL_MS || "10800000", 10); // 3h
  const run = async () => {
    try {
      await enqueueRepositorySync();
      await enqueueIssueSync();
    } catch (err) {
      console.error("[worker] scheduler enqueue failed:", err.message);
    }
  };
  // run once shortly after boot, then on the interval.
  setTimeout(run, 60 * 1000);
  setInterval(run, intervalMs);
  console.log(`[worker] corpus scheduler every ${intervalMs}ms`);
}

async function main() {
  await initDatabase();
  await connectRedis();
  const restored = await restoreStrandedJobs();
  if (restored > 0) console.log(`[worker] restored ${restored} stranded job(s)`);

  startScheduler();
  console.log("[worker] listening for jobs (Ctrl+C to stop)");
  // Process jobs serially to respect GitHub rate limits.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await popJob(5);
    if (job) await handleJob(job);
  }
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});