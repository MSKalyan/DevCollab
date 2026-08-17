// Bounded-concurrency map. Runs `fn` over `items` with at most `limit` async
// workers in flight at once. Used by the backfill to parallelize GitHub API
// round-trips without blowing rate limits. The octokit throttling plugin still
// queues retries when a limit is hit, so this is safe to over-issue.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}