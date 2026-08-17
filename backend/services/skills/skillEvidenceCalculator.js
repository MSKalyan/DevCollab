// Deterministic skill scoring over evidence events. Isolated so Phase 2 can
// swap in embeddings/ML without touching controllers or models.
//
// Baseline weights (recency decayed):
//   MERGED_PR               = strong
//   CONTRIBUTED_REPOSITORY  = strong (repo the user owns/collaborates on)
//   COMMIT                  = strong
//   PR_REVIEW               = medium
//
// Recency: each event's weight halves every RECENCY_HALF_LIFE_DAYS.

const EVENT_WEIGHTS = {
  MERGED_PR: 3.0,
  CONTRIBUTED_REPOSITORY: 2.5,
  COMMIT: 2.5,
  PR_REVIEW: 1.0,
};

const RECENCY_HALF_LIFE_DAYS = 365;

export function recencyMultiplier(occurredAt, now = new Date()) {
  if (!occurredAt) return 1; // unknown date: keep neutral weight
  const when = new Date(occurredAt).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(when)) return 1;
  const days = Math.max(0, (nowMs - when) / (24 * 60 * 60 * 1000));
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

function eventMetricTotals(events) {
  const totals = {};
  for (const ev of events) {
    const { event_type } = ev;
    for (const skill of ev.metadata?.skills || []) {
      const t = (totals[skill] = totals[skill] || {
        evidenceCount: 0,
        mergedPrCount: 0,
        reviewCount: 0,
        repositoryCount: 0,
        weight: 0,
        lastSeen: null,
      });
      t.evidenceCount += 1;
      if (event_type === "MERGED_PR") t.mergedPrCount += 1;
      if (event_type === "PR_REVIEW") t.reviewCount += 1;
      if (event_type === "CONTRIBUTED_REPOSITORY") t.repositoryCount += 1;
      const w = (EVENT_WEIGHTS[event_type] || 0) * recencyMultiplier(ev.occurred_at);
      t.weight += w;
      const seen = new Date(ev.occurred_at || ev.created_at);
      if (!t.lastSeen || seen > t.lastSeen) t.lastSeen = seen;
    }
  }
  return totals;
}

// Compute normalized 0..1 skill scores. Sorting is stable (descending weight).
export function calculateSkillScores(events, now = new Date()) {
  const totals = eventMetricTotals(events);
  const maxWeight = Math.max(1, ...Object.values(totals).map((t) => t.weight));

  return Object.entries(totals)
    .map(([skill, t]) => ({
      skill,
      score: Number((t.weight / maxWeight).toFixed(4)),
      evidence_count: t.evidenceCount,
      merged_pr_count: t.mergedPrCount,
      review_count: t.reviewCount,
      repository_count: t.repositoryCount,
      last_seen_at: t.lastSeen ? t.lastSeen.toISOString() : null,
    }))
    .sort((a, b) => b.score - a.score || b.evidence_count - a.evidence_count);
}