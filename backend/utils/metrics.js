// Minimal structured metrics/logger for Phase 2 sync jobs and ranking.
// Keeps infra out of the service modules; Postgres is the source of truth,
// Redis/console are informational.

let counters = {
  repositories_synced: 0,
  issues_fetched: 0,
  issues_created: 0,
  issues_updated: 0,
  issues_skipped: 0,
  github_api_errors: 0,
  rate_limit_events: 0,
  recommendations_generated: 0,
};

let listeners = [];

export function setMetricsSource(source) {
  counters = source || counters;
}

export function metricsSnapshot() {
  return { ...counters };
}

export function emit(event, fields = {}) {
  const line = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  if (process.env.NODE_ENV !== "test") {
    console.log(`[metrics] ${JSON.stringify(line)}`);
  }
  for (const fn of listeners) fn({ ...line, counters: metricsSnapshot() });
  return line;
}

export function onMetric(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function mergeSyncMetrics(metrics) {
  if (!metrics) return;
  counters.repositories_synced += metrics.repositories_updated ?? metrics.repos_found ?? 0;
  counters.issues_fetched += metrics.issues_fetched ?? 0;
  counters.issues_created += metrics.issues_created ?? 0;
  counters.issues_updated += metrics.issues_updated ?? 0;
  counters.issues_skipped +=
    (metrics.issues_skipped_pr ?? 0) + (metrics.issues_skipped_closed ?? 0);
  counters.rate_limit_events += metrics.rate_limit_events ?? 0;
}

export function increment(name, by = 1) {
  counters[name] = (counters[name] || 0) + by;
}