import pool from "./db.js";

function parseJson(value) {
  if (value === null || value === undefined) return value;
  return typeof value === "string" ? JSON.parse(value) : value;
}

// The analysis is only valid for the evidence it was derived from, so it is
// stored against a version fingerprint. A mismatch means recompute.
export async function findContributionProfile(githubAccountId, evidenceVersion) {
  const result = await pool.query(
    `SELECT * FROM contribution_profiles
     WHERE github_account_id = $1 AND evidence_version = $2`,
    [githubAccountId, evidenceVersion]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    capability: parseJson(row.capability) || {},
    working_style: parseJson(row.working_style) || {},
    experience: parseJson(row.experience) || {},
  };
}

export async function upsertContributionProfile(githubAccountId, {
  evidenceVersion,
  capability,
  workingStyle,
  experience,
  narrative,
  generatedBy,
}) {
  const result = await pool.query(
    `INSERT INTO contribution_profiles (
       github_account_id, evidence_version, capability, working_style,
       experience, narrative, generated_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (github_account_id)
     DO UPDATE SET
       evidence_version = EXCLUDED.evidence_version,
       capability = EXCLUDED.capability,
       working_style = EXCLUDED.working_style,
       experience = EXCLUDED.experience,
       narrative = EXCLUDED.narrative,
       generated_by = EXCLUDED.generated_by,
       updated_at = NOW()
     RETURNING id`,
    [
      githubAccountId,
      evidenceVersion,
      JSON.stringify(capability || {}),
      JSON.stringify(workingStyle || {}),
      JSON.stringify(experience || {}),
      narrative || null,
      generatedBy || "deterministic",
    ]
  );
  return result.rows[0];
}

export async function deleteContributionProfile(githubAccountId) {
  await pool.query("DELETE FROM contribution_profiles WHERE github_account_id = $1", [
    githubAccountId,
  ]);
}
