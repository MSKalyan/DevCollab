// Stage 4: explainer.
//
// Turns the matcher's numbers into reasons a person can act on. Deterministic
// prose is built first and is always present; when an LLM is configured it
// refines the wording and adds the capability narrative. The LLM never changes
// a score, and a failed or malformed response leaves the deterministic text
// untouched.

import { completeJson, isLlmEnabled } from "../../../utils/llm.js";

const LEVEL_PROSE = {
  newcomer: "early in your open-source journey",
  intermediate: "building a track record as a contributor",
  advanced: "an experienced contributor with a solid merged history",
  expert: "a veteran of substantial, sustained contribution",
};

// Deterministic per-recommendation reasons, ordered by the strength of the
// signal that produced them so the most compelling reason reads first.
function buildWhy({ signals, matchedSkills, matchedTechnologies, missingTechnologies, project, capability, labelReasons = [] }) {
  const why = [];
  const { difficulty } = project;

  if (matchedSkills.length > 0) {
    const top = matchedSkills[0];
    const skillEntry = capability.skills?.find((s) => s.skill === top);
    const pct = signals.skill_match >= 0.5 ? "strong" : "partial";
    why.push(
      `${pct === "strong" ? "Strong" : "Direct"} ${top} evidence${
        skillEntry?.merged_pr_count ? ` (${skillEntry.merged_pr_count} merged PRs)` : ""
      }`
    );
    const extra = matchedSkills.slice(1, 3);
    if (extra.length) why.push(`Also uses ${extra.join(", ")}`);
  }

  if (matchedTechnologies.length > 0 && project.stack.primaryLanguage) {
    if (matchedTechnologies.includes(project.stack.primaryLanguage)) {
      why.push(`Project is primarily ${project.stack.primaryLanguage}, which matches your stack`);
    } else {
      why.push(`Stack overlap on ${matchedTechnologies.slice(0, 3).join(", ")}`);
    }
  }

  if (difficulty.difficulty === "starter") {
    why.push(difficulty.scope === "small"
      ? "Scoped as a starter task with a small expected change"
      : "Marked newcomer-friendly by the maintainers");
  } else if (difficulty.difficulty === "moderate") {
    why.push("Moderate difficulty — a realistic step up from starter work");
  }

  // Label-derived reasons come before the generic repo-activity ones: a work
  // type the user has demonstrably landed is more specific and more useful than
  // "this repository is active".
  const demonstrated = labelReasons.find((r) => r.kind === "demonstrated");
  if (demonstrated) {
    why.push(`You've had ${demonstrated.detail} merged before`);
  }
  const entry = labelReasons.find((r) => r.kind === "entry");
  if (entry) {
    why.push(entry.detail);
  }
  if (project.labels.primaryLabel && !demonstrated) {
    const modifiers = project.labels.modifiers.map((m) => m.label.toLowerCase());
    why.push(
      modifiers.length
        ? `Labelled ${project.labels.primaryLabel} (${modifiers.join(", ")})`
        : `Maintainers labelled this ${project.labels.primaryLabel}`
    );
  }

  if (project.friendliness.score >= 0.6) {
    why.push("Repository is actively maintained");
  }
  if (project.externalContributorSignal.accepts_outside_work) {
    why.push(
      `Accepts outside contributions (${project.stack.openIssues} open issues, ${project.stack.stars.toLocaleString()} stars)`
    );
  }
  if (signals.freshness >= 0.75) {
    why.push("Issue was updated recently, so maintainers are responsive");
  }
  if (missingTechnologies.length > 0 && why.length < 3) {
    why.push(`Would extend you into ${missingTechnologies.slice(0, 2).join(", ")}`);
  }

  return why.length ? why.slice(0, 4) : ["Related to your overall profile"];
}

// The single most useful thing to do first. Ordered by what actually blocks a
// merge for someone at this level.
function buildNextStep({ signals, project, capability, workingStyle }) {
  const { difficulty } = project;

  if (capability.level === "newcomer" && difficulty.difficulty !== "starter") {
    return "Read the issue and the linked code first — comment to confirm the expected approach before writing code.";
  }
  if (difficulty.difficulty === "starter") {
    return workingStyle?.preferredScope === "small"
      ? "Comment on the issue to claim it, then open a focused PR with a test."
      : "Comment on the issue to claim it, then keep the PR tight and reference the issue.";
  }
  if (difficulty.scope === "large" || difficulty.difficulty === "involved" || difficulty.difficulty === "deep") {
    return "Propose a design in the issue before implementing — a maintainer will want to agree on the approach.";
  }
  if (signals.freshness < 0.4) {
    return "The issue looks stale — ask whether it is still relevant before starting work.";
  }
  return "Introduce yourself on the issue with your proposed approach, then open a PR.";
}

export function explainRecommendation(entry, { capability, workingStyle }) {
  const {
    signals,
    matchedSkills,
    matchedTechnologies,
    missingTechnologies,
    labelReasons,
    project,
    issue,
    fitScore,
    rank,
  } = entry;

  return {
    rank,
    issue_id: issue.id,
    github_issue_id: issue.github_issue_id,
    number: issue.issue_number,
    title: issue.title,
    html_url: issue.html_url,
    repository: project.repository,
    repository_url: project.repository_url,
    repo_stars: project.stack.stars,
    repo_language: project.stack.primaryLanguage,
    labels: issue.labels || [],
    // The maintainer-declared intent, which is what the label chips in the UI
    // show and what makes a recommendation legible at a glance.
    work_type: project.labels.primaryWorkType,
    work_type_label: project.labels.primaryLabel,
    declared_intent: project.labels.declaredIntent,
    fit_score: fitScore,
    difficulty: project.difficulty.difficulty,
    scope: project.difficulty.scope,
    matched_skills: matchedSkills,
    why: buildWhy({
      signals,
      matchedSkills,
      matchedTechnologies,
      missingTechnologies,
      project,
      capability,
      labelReasons,
    }),
    next_step: buildNextStep({ signals, project, capability, workingStyle }),
    signals,
  };
}

export function explainRecommendations(entries, profile) {
  return entries.map((e) => explainRecommendation(e, profile));
}

// Deterministic narrative — always available, no model required.
export function deterministicNarrative({ capability, workingStyle, experience }) {
  const top = capability.primaryLanguages.slice(0, 3).map((l) => l.name);
  const level = LEVEL_PROSE[capability.level] || "a contributor";

  const parts = [
    `You read as ${level}.`,
    top.length
      ? `Your strongest demonstrated work is in ${top.join(", ")}.`
      : "Your GitHub evidence shows repository ownership but little merged contribution yet.",
  ];

  if (experience.merged_prs > 0) {
    parts.push(
      `${experience.merged_prs} merged pull request${experience.merged_prs === 1 ? "" : "s"} across ${experience.repositories} repositor${experience.repositories === 1 ? "y" : "ies"}.`
    );
  }
  if (experience.avg_pr_size > 0) {
    parts.push(`Typical change size is about ${experience.avg_pr_size} lines.`);
  }
  parts.push(workingStyle.summary);

  if (capability.confidence < 0.35) {
    parts.push(
      "This read is based on limited evidence — connecting more history will sharpen it."
    );
  }

  return parts.join(" ");
}

// Ask the model to phrase the narrative and refine reason wording. Any failure
// returns the deterministic input unchanged.
export async function enrichWithLlm({ capability, workingStyle, experience, labelProfile = null, recommendations }) {
  if (!isLlmEnabled()) {
    return { narrative: deterministicNarrative({ capability, workingStyle, experience }), generated_by: "deterministic" };
  }

  const payload = {
    capability: {
      level: capability.level,
      score: capability.score,
      confidence: capability.confidence,
      dimensions: capability.dimensions,
      primary_languages: capability.primaryLanguages.map((l) => l.name),
      top_skills: capability.skills.slice(0, 8).map((s) => ({
        skill: s.skill,
        strength: s.strength,
        merged_prs: s.merged_pr_count,
      })),
      domains: capability.domains,
    },
    working_style: {
      archetype: workingStyle.archetype,
      traits: workingStyle.traits.map((t) => ({ trait: t.trait, evidence: t.evidence })),
      preferred_scope: workingStyle.preferredScope,
      cadence: workingStyle.cadence,
      focus: workingStyle.focus,
    },
    experience,
    // Work types maintainers have actually merged from this person. Giving the
    // model this evidence is what lets it explain a work-type match concretely
    // instead of describing the issue in isolation.
    demonstrated_work_types: labelProfile?.isEmpty
      ? "none recorded"
      : (labelProfile?.workTypes || []).map((w) => ({
          work_type: w.workType,
          merged_prs: w.merged_pr_count,
          coverage: w.share,
        })),
    label_coverage: labelProfile?.coverage ?? 0,
    recommendations: recommendations.slice(0, 8).map((r) => ({
      title: r.title,
      repository: r.repository,
      work_type: r.work_type,
      declared_intent: r.declared_intent,
      difficulty: r.difficulty,
      scope: r.scope,
      fit_score: r.fit_score,
      matched_skills: r.matched_skills,
      signals: r.signals,
    })),
  };

  const result = await completeJson({
    system:
      "You analyze a developer's GitHub evidence and explain open-source contribution fit. " +
      "Respond with JSON only. Be concrete and grounded strictly in the numbers provided — " +
      "never invent skills, projects, or metrics. Where two values differ (for example an " +
      "issue scope of \"small\" against a preferred scope of \"medium\"), never describe them " +
      "as matching. No flattery, no filler.",
    user:
      `Here is a developer's computed evidence profile:\n\n${JSON.stringify(payload, null, 2)}\n\n` +
      `Return JSON with exactly these keys:\n` +
      `- "narrative": 2-4 sentences describing this developer's capability and working style.\n` +
      `- "refinements": an array of objects {"title": <exact issue title>, "why": [<up to 3 short reasons>]}. ` +
      `Write every reason as plain language a developer would say out loud — never mention internal ` +
      `signal names (label_fit, capability_fit, infrastructure_fit, keyword_similarity, friendliness, ` +
      `freshness) or raw decimals. Say what the signal means instead: "matches the bug-fix work you've ` +
      `had merged before" rather than "perfect label_fit (1)". Only include items where you can make ` +
      `the reason materially more specific than the numbers alone.\n` +
      `- "summary": one sentence on the kind of open-source work this person should look for.`,
    // Reasoning models (gpt-oss/qwen3 on Groq) count hidden reasoning tokens
    // against this budget, so it is sized well above the visible JSON.
    maxTokens: 2500,
  });

  if (!result) {
    return { narrative: deterministicNarrative({ capability, workingStyle, experience }), generated_by: "deterministic" };
  }

  // Merge refinements by title. Only `why` is adopted from the model; every
  // number stays as computed.
  const refinements = new Map();
  if (Array.isArray(result.refinements)) {
    for (const r of result.refinements) {
      if (r && typeof r.title === "string" && Array.isArray(r.why) && r.why.length > 0) {
        refinements.set(r.title, r.why.filter((w) => typeof w === "string" && w.trim()).slice(0, 3));
      }
    }
  }

  return {
    narrative:
      typeof result.narrative === "string" && result.narrative.trim()
        ? result.narrative.trim()
        : deterministicNarrative({ capability, workingStyle, experience }),
    summary: typeof result.summary === "string" ? result.summary.trim() : null,
    refinements,
    generated_by: "llm",
  };
}
