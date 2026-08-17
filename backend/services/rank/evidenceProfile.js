// User evidence profile for the ranker. Built from Phase 1 computed evidence
// (skill_evidence), joined with any persisted evidence for a GitHub account.

import {
  listSkillsForAccount,
} from "../../models/skillEvidenceModel.js";

function skillWeights(raw) {
  return (raw || []).map((s) => ({
    skill: s.skill,
    score: Number(s.score || 0),
    evidence_count: Number(s.evidence_count || 0),
    merged_pr_count: Number(s.merged_pr_count || 0),
    repository_count: Number(s.repository_count || 0),
    review_count: Number(s.review_count || 0),
  }));
}

export async function buildUserProfile(githubAccountId) {
  // (Phase 1 computed skills; room to later enrich with repo/PR evidence.)
  const skills = skillWeights(await listSkillsForAccount(githubAccountId));

  // Language/profile tokens: skill identifiers used for keyword matching.
  const languageTerms = new Set();
  const skillIndex = new Map();
  for (const s of skills) {
    skillIndex.set(s.skill, s);
    for (const bit of s.skill.split(/[\s_/-]+/)) {
      if (bit.length >= 2) languageTerms.add(bit.toLowerCase());
    }
  }

  return {
    githubAccountId,
    skills,
    skillIndex,
    languageTerms,
    isEmpty: skills.length === 0,
  };
}

export function profileTokenText(profile) {
  // Keywords derived from skill names; repeated proportionally to score so that
  // strong skills dominate the profile vector.
  const tokens = [];
  for (const s of profile.skills) {
    const weight = Math.max(1, Math.round(s.score * 10));
    for (const bit of s.skill.split(/[\s_/-]+/)) {
      const b = bit.toLowerCase();
      if (b.length >= 2) for (let i = 0; i < weight; i++) tokens.push(b);
    }
  }
  // Fall back to a plain mention when the user has skills but no strong score.
  if (tokens.length === 0) {
    for (const term of profile.languageTerms) tokens.push(term);
  }
  return tokens.join(" ");
}