import pool from "./db.js";

export async function listSkillsForAccount(githubAccountId) {
  const result = await pool.query(
    `SELECT skill, score, evidence_count, merged_pr_count, review_count,
            repository_count, last_seen_at, updated_at
     FROM skill_evidence
     WHERE github_account_id = $1
     ORDER BY score DESC, evidence_count DESC`,
    [githubAccountId]
  );
  return result.rows;
}

export async function upsertSkillForAccount(githubAccountId, {
  skill,
  score,
  evidenceCount,
  mergedPrCount,
  reviewCount,
  repositoryCount,
  lastSeenAt,
}) {
  const result = await pool.query(
    `INSERT INTO skill_evidence (
       github_account_id, skill, score, evidence_count, merged_pr_count,
       review_count, repository_count, last_seen_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (github_account_id, skill)
     DO UPDATE SET
       score = EXCLUDED.score,
       evidence_count = EXCLUDED.evidence_count,
       merged_pr_count = EXCLUDED.merged_pr_count,
       review_count = EXCLUDED.review_count,
       repository_count = EXCLUDED.repository_count,
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at = NOW()
     RETURNING id`,
    [
      githubAccountId,
      skill,
      score,
      evidenceCount,
      mergedPrCount,
      reviewCount,
      repositoryCount,
      lastSeenAt || null,
    ]
  );
  return result.rows[0];
}

export async function deleteSkillsForAccount(githubAccountId) {
  await pool.query("DELETE FROM skill_evidence WHERE github_account_id = $1", [
    githubAccountId,
  ]);
}

// Bulk upsert: one multi-row statement instead of a round-trip per skill.
export async function upsertSkillsForAccount(githubAccountId, skills) {
  if (!skills || skills.length === 0) return;
  const CHUNK = 200;
  for (let start = 0; start < skills.length; start += CHUNK) {
    const chunk = skills.slice(start, start + CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((s, i) => {
      const base = i * 8;
      params.push(
        githubAccountId,
        s.skill,
        s.score,
        s.evidenceCount,
        s.mergedPrCount,
        s.reviewCount,
        s.repositoryCount,
        s.lastSeenAt ?? null
      );
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, NOW())`
      );
    });
    await pool.query(
      `INSERT INTO skill_evidence (
         github_account_id, skill, score, evidence_count, merged_pr_count,
         review_count, repository_count, last_seen_at, updated_at
       ) VALUES ${values.join(", ")}
       ON CONFLICT (github_account_id, skill)
       DO UPDATE SET
         score = EXCLUDED.score,
         evidence_count = EXCLUDED.evidence_count,
         merged_pr_count = EXCLUDED.merged_pr_count,
         review_count = EXCLUDED.review_count,
         repository_count = EXCLUDED.repository_count,
         last_seen_at = EXCLUDED.last_seen_at,
         updated_at = NOW()`,
      params
    );
  }
}