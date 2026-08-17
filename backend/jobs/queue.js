import client from "../config/redis.js";

// Minimal Redis-backed job queue. Only the immediate queue lives in Redis;
// durable state (backfill_status, last_synced_at) lives in PostgreSQL, which is
// the source of truth the worker restores from on startup.

const QUEUE_KEY = "devcollab:jobs";
const PRIORITY_QUEUE_KEY = "devcollab:jobs:priority";
const PROCESSING_KEY = "devcollab:jobs:processing";

export const JOB_TYPES = {
  BACKFILL_GITHUB_USER: "BACKFILL_GITHUB_USER",
  SYNC_CURATED_REPOSITORIES: "SYNC_CURATED_REPOSITORIES",
  SYNC_GITHUB_ISSUES: "SYNC_GITHUB_ISSUES",
};

export const JOB_KEYS = { QUEUE_KEY, PRIORITY_QUEUE_KEY, PROCESSING_KEY };

async function push(key, job) {
  if (!client.isReady) return { queued: false };
  await client.lPush(key, JSON.stringify(job));
  return { queued: true };
}

// User-triggered work goes on the priority queue so the worker drains it ahead
// of long-running corpus sync jobs that would otherwise delay a connect.
export function enqueueBackfill(githubAccountId) {
  return push(PRIORITY_QUEUE_KEY, { type: JOB_TYPES.BACKFILL_GITHUB_USER, githubAccountId });
}

export function enqueueRepositorySync() {
  return push(QUEUE_KEY, { type: JOB_TYPES.SYNC_CURATED_REPOSITORIES });
}

export function enqueueIssueSync() {
  return push(QUEUE_KEY, { type: JOB_TYPES.SYNC_GITHUB_ISSUES });
}

// Blocking pop with a processing-side relocation so a kill does not drop the
// job. Priority jobs are drained first (non-blocking), then the worker blocks
// on the normal queue. Returns null on timeout.
export async function popJob(timeoutSeconds = 5) {
  if (!client.isReady) return null;
  const priorityJob = await client.rPopLPush(PRIORITY_QUEUE_KEY, PROCESSING_KEY, 0);
  if (priorityJob) return JSON.parse(priorityJob);
  // brpoplpush moves atomically to the processing list; commit the pop after
  // the worker finishes processing by removing the key ourselves.
  const job = await client.brPopLPush(QUEUE_KEY, PROCESSING_KEY, timeoutSeconds);
  return job ? JSON.parse(job) : null;
}

export async function ackJob(job) {
  if (!client.isReady || !job) return;
  await client.lRem(PROCESSING_KEY, -1, JSON.stringify(job));
}

export function queueStats() {
  return { queueKey: QUEUE_KEY, priorityQueueKey: PRIORITY_QUEUE_KEY, processingKey: PROCESSING_KEY };
}