import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  tokensOf,
  analyzeIssueLabels,
  analyzeUserLabels,
  labelFit,
  preferredWorkTypes,
} from "../services/agent/stages/labelAnalyst.js";
import { analyzeIssueDifficulty, analyzeProject, analyzeStack } from "../services/agent/stages/projectAnalyst.js";
import { matchIssues } from "../services/agent/stages/matcher.js";
import { analyzeCapability } from "../services/agent/stages/capabilityAnalyst.js";
import { analyzeWorkingStyle } from "../services/agent/stages/workingStyleAnalyst.js";
import { explainRecommendations } from "../services/agent/stages/explainer.js";

// Label spellings taken verbatim from the live collected corpus, which is the
// whole reason this stage exists: a per-repository label vocabulary cannot be
// assumed.
const MESSY_BUG_LABELS = ["bug", "kind/bug", "kind:bug", "c bug"];

function prWithLabels(labels, { at = "2026-01-05T00:00:00Z", repo = "psf/requests" } = {}) {
  return {
    event_type: "MERGED_PR",
    repo_full_name: repo,
    language: "Python",
    occurred_at: at,
    metadata: { labels, additions: 40, deletions: 10, changed_files: 2, skills: ["python"] },
  };
}

function issue(labels, over = {}) {
  return {
    id: 1,
    github_issue_id: 99,
    repository_id: 1,
    issue_number: 100,
    title: "Add retry support to the HTTP client",
    body: "Retry on 5xx.",
    labels,
    repo_topics: ["http"],
    repo_language: "Python",
    comments_count: 1,
    state: "open",
    updated_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 20 * 864e5).toISOString(),
    repo_full_name: "psf/requests",
    ...over,
  };
}

function repo(over = {}) {
  return {
    id: 1,
    full_name: "psf/requests",
    html_url: "https://github.com/psf/requests",
    primary_language: "Python",
    languages: { Python: 900000 },
    topics: ["http"],
    stars: 52000,
    forks: 9000,
    open_issues_count: 130,
    last_pushed_at: new Date().toISOString(),
    ...over,
  };
}

// --- tokenization --------------------------------------------------------

describe("label tokens", () => {
  test("collapses separators so spellings converge", () => {
    assert.equal(tokensOf("kind/bug"), "kind bug");
    assert.equal(tokensOf("kind:bug"), "kind bug");
    assert.equal(tokensOf("Good First Issue"), "good first issue");
    assert.equal(tokensOf("difficulty: easy"), "difficulty easy");
    assert.equal(tokensOf("c bug"), "c bug");
  });
});

// --- issue label analysis ------------------------------------------------

describe("issue label analysis", () => {
  test("recognizes every real-world spelling of a bug label", () => {
    for (const label of MESSY_BUG_LABELS) {
      const r = analyzeIssueLabels([label]);
      assert.equal(r.primaryWorkType, "bug-fix", `"${label}" should read as a bug fix`);
    }
  });

  test("classifies the common work types", () => {
    assert.equal(analyzeIssueLabels(["documentation"]).primaryWorkType, "documentation");
    assert.equal(analyzeIssueLabels(["enhancement"]).primaryWorkType, "feature");
    assert.equal(analyzeIssueLabels(["performance"]).primaryWorkType, "performance");
    assert.equal(analyzeIssueLabels(["proposal"]).primaryWorkType, "design");
    assert.equal(analyzeIssueLabels(["flaky test"]).primaryWorkType, "testing");
    assert.equal(analyzeIssueLabels(["dependencies"]).primaryWorkType, "maintenance");
  });

  test("does not treat area/label-noise as a work type", () => {
    // These are real corpus labels that name a subsystem, not a kind of work.
    for (const label of ["area:adapters", "provider:fab", "turbopack", "internal", "redirects"]) {
      const r = analyzeIssueLabels([label]);
      assert.equal(r.primaryWorkType, null, `"${label}" must not imply a work type`);
    }
  });

  test("prefers a specific work type over the generic starter label", () => {
    const r = analyzeIssueLabels(["good first issue", "bug"]);
    assert.equal(r.primaryWorkType, "bug-fix", "the specific label is the primary work type");
    assert.equal(r.hasStarterLabel, true, "startership is still recorded");
  });

  test("multi-category labels expose all declared intent", () => {
    const r = analyzeIssueLabels(["bug", "performance"]);
    assert.deepEqual([...r.declaredIntent].sort(), ["Bug fix", "Performance"]);
    assert.ok(r.categories.length === 2);
  });

  test("triage labels reduce confidence but do not disqualify", () => {
    const clean = analyzeIssueLabels(["bug"]);
    const triaged = analyzeIssueLabels(["bug", "needs triage"]);
    assert.equal(clean.confidenceMultiplier, 1);
    assert.ok(triaged.confidenceMultiplier < 1);
    assert.equal(triaged.hardBlocked, false, "untriaged work is still actionable");
  });

  test("closed-off labels hard-block the issue", () => {
    for (const label of ["duplicate", "wontfix", "blocked", "invalid"]) {
      const r = analyzeIssueLabels([label]);
      assert.equal(r.hardBlocked, true, `"${label}" should be excluded`);
    }
  });

  test("difficulty qualifiers are parsed from the label text", () => {
    assert.equal(analyzeIssueLabels(["difficulty: easy"]).difficultyHint, "starter");
    assert.equal(analyzeIssueLabels(["effort: small"]).difficultyHint, "starter");
    assert.equal(analyzeIssueLabels(["difficulty: hard"]).difficultyHint, "involved");
    assert.equal(analyzeIssueLabels(["priority: critical"]).difficultyHint, "deep");
  });

  test("handles empty and missing labels", () => {
    for (const input of [[], null, undefined, [""], [null]]) {
      const r = analyzeIssueLabels(input || []);
      assert.equal(r.primaryWorkType, null);
      assert.equal(r.confidenceMultiplier, 1);
      assert.equal(r.hardBlocked, false);
    }
  });
});

// --- user label history --------------------------------------------------

describe("user label history", () => {
  test("learns work types from merged-PR labels", () => {
    const profile = analyzeUserLabels([
      prWithLabels(["bug"]),
      prWithLabels(["bug"]),
      prWithLabels(["documentation"]),
    ]);
    assert.equal(profile.isEmpty, false);
    const bug = profile.workTypes.find((w) => w.workType === "bug-fix");
    assert.equal(bug.merged_pr_count, 2);
    assert.equal(bug.strength, 1, "the dominant work type normalizes to 1");
    const docs = profile.workTypes.find((w) => w.workType === "documentation");
    assert.ok(docs.strength < 1);
  });

  test("ignores non-merged-PR events", () => {
    const profile = analyzeUserLabels([
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-01T00:00:00Z", metadata: { labels: ["bug"] } },
      { event_type: "CONTRIBUTED_REPOSITORY", repo_full_name: "a/b", occurred_at: "2026-01-01T00:00:00Z", metadata: {} },
    ]);
    assert.equal(profile.isEmpty, true);
    assert.equal(profile.labeled_pr_count, 0);
  });

  test("reports label coverage so a thin read is not overclaimed", () => {
    const profile = analyzeUserLabels([
      prWithLabels(["bug"]),
      { event_type: "MERGED_PR", repo_full_name: "a/b", occurred_at: "2026-01-06T00:00:00Z", metadata: {} },
    ]);
    assert.equal(profile.total_pr_count, 2);
    assert.equal(profile.labeled_pr_count, 1);
    assert.equal(profile.coverage, 0.5);
  });

  test("tracks newcomer-friendly history separately from work types", () => {
    const profile = analyzeUserLabels([prWithLabels(["good first issue"])]);
    assert.ok(profile.workTypes.some((w) => w.workType === "starter"));
  });

  test("returns an empty profile for a user with no labelled work", () => {
    const profile = analyzeUserLabels([]);
    assert.equal(profile.isEmpty, true);
    assert.deepEqual(profile.workTypes, []);
    assert.equal(profile.coverage, 0);
  });
});

// --- label fit -----------------------------------------------------------

describe("label fit", () => {
  const newcomer = { level: "newcomer", confidence: 0.8 };
  const advanced = { level: "advanced", confidence: 0.9 };

  test("a newcomer fits starter work better than deep design work", () => {
    const starter = labelFit(null, analyzeIssueLabels(["good first issue", "documentation"]), newcomer);
    const deep = labelFit(null, analyzeIssueLabels(["epic", "design"]), newcomer);
    assert.ok(starter.score > deep.score, `${starter.score} should beat ${deep.score}`);
  });

  test("demonstrated history raises fit for the same work type", () => {
    const history = analyzeUserLabels([prWithLabels(["bug"]), prWithLabels(["bug"])]);
    const bugIssue = analyzeIssueLabels(["bug"]);
    const withHistory = labelFit(history, bugIssue, newcomer);
    const without = labelFit(null, bugIssue, newcomer);
    assert.ok(withHistory.score > without.score, "past merged work of this type is a positive signal");
    assert.ok(withHistory.reasons.some((r) => r.kind === "demonstrated"));
    assert.match(withHistory.reasons.find((r) => r.kind === "demonstrated").detail, /2 merged PRs labelled Bug fix/);
  });

  test("a newcomer with no history is steered toward entry work", () => {
    const entry = labelFit(null, analyzeIssueLabels(["good first issue"]), newcomer);
    assert.ok(entry.reasons.some((r) => r.kind === "entry"));

    const stretch = labelFit(null, analyzeIssueLabels(["performance"]), newcomer);
    assert.ok(stretch.reasons.some((r) => r.kind === "stretch"));
  });

  test("an expert candidate is not pushed toward all-starter work", () => {
    const history = analyzeUserLabels([prWithLabels(["performance"]), prWithLabels(["bug"])]);
    const starter = labelFit(history, analyzeIssueLabels(["good first issue"]), advanced);
    const matching = labelFit(history, analyzeIssueLabels(["performance"]), advanced);
    assert.ok(matching.score > starter.score);
  });

  test("untriaged issues score below triaged equivalents", () => {
    const history = analyzeUserLabels([prWithLabels(["bug"])]);
    const clean = labelFit(history, analyzeIssueLabels(["bug"]), advanced);
    const triaged = labelFit(history, analyzeIssueLabels(["bug", "needs triage"]), advanced);
    assert.ok(triaged.score < clean.score);
  });

  test("scores stay within 0..1", () => {
    const history = analyzeUserLabels([prWithLabels(["bug"])]);
    for (const labels of [["bug"], ["epic"], ["good first issue"], ["wontfix"], ["needs triage", "bug"]]) {
      const fit = labelFit(history, analyzeIssueLabels(labels), advanced);
      assert.ok(fit.score >= 0 && fit.score <= 1, `${labels}: ${fit.score}`);
    }
  });
});

// --- preferred work types ------------------------------------------------

describe("preferred work types", () => {
  test("prioritizes what the user has landed, most frequent first", () => {
    const profile = analyzeUserLabels([
      prWithLabels(["bug"]), prWithLabels(["bug"]), prWithLabels(["documentation"]),
    ]);
    const preferred = preferredWorkTypes(profile, { level: "intermediate" });
    assert.equal(preferred[0], "bug-fix");
  });

  test("falls back to entry-level work for a user with no label history", () => {
    const preferred = preferredWorkTypes(analyzeUserLabels([]), { level: "newcomer" });
    assert.ok(preferred.includes("starter"));
    assert.ok(preferred.includes("documentation"));
  });
});

// --- integration with difficulty and matching ----------------------------

describe("labels feed difficulty and ranking", () => {
  test("a starter label still short-circuits difficulty", () => {
    const d = analyzeIssueDifficulty(issue(["good first issue"]), analyzeStack(repo()));
    assert.equal(d.difficulty, "starter");
    assert.deepEqual(d.intent, ["Newcomer-friendly"]);
  });

  test("a work-type label moves difficulty in the right direction", () => {
    const docs = analyzeIssueDifficulty(issue(["documentation"]), analyzeStack(repo()));
    const perf = analyzeIssueDifficulty(issue(["performance"]), analyzeStack(repo()));
    assert.ok(perf.score > docs.score, "performance reads harder than docs");
  });

  test("multi-category labels are exposed on the project analysis", () => {
    const p = analyzeProject(issue(["kind/bug", "needs triage"]), repo());
    assert.equal(p.labels.primaryWorkType, "bug-fix");
    assert.deepEqual(p.labels.modifiers.map((m) => m.id), ["triage"]);
    assert.ok(p.labels.confidenceMultiplier < 1);
  });

  test("work-type filter returns only that kind of work", () => {
    const events = [prWithLabels(["bug"]), prWithLabels(["bug"])];
    const capability = analyzeCapability(events, []);
    const workingStyle = analyzeWorkingStyle(events);
    const labelProfile = analyzeUserLabels(events);
    const repos = new Map([[1, repo()]]);
    const issues = [
      issue(["bug"], { id: 1 }),
      issue(["documentation"], { id: 2 }),
      issue(["performance"], { id: 3 }),
    ];

    const filtered = matchIssues({
      capability, workingStyle, userLabelProfile: labelProfile,
      rankProfile: { skills: [], languageTerms: new Set(), skillIndex: new Map(), isEmpty: true },
      issues, reposByRepoId: repos, workTypeFilter: "bug-fix",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].project.labels.primaryWorkType, "bug-fix");
  });

  test("closed-off issues are excluded from the pool by default", () => {
    const events = [prWithLabels(["bug"])];
    const capability = analyzeCapability(events, []);
    const workingStyle = analyzeWorkingStyle(events);
    const repos = new Map([[1, repo()]]);
    const issues = [issue(["bug"], { id: 1 }), issue(["duplicate"], { id: 2 }), issue(["wontfix"], { id: 3 })];

    const ranked = matchIssues({
      capability, workingStyle, userLabelProfile: analyzeUserLabels(events),
      rankProfile: { skills: [], languageTerms: new Set(), skillIndex: new Map(), isEmpty: true },
      issues, reposByRepoId: repos,
    });
    assert.equal(ranked.length, 1, "duplicate and wontfix issues are dropped");
    assert.equal(ranked[0].issue.id, 1);
  });

  test("an untriaged issue cannot outrank a vetted one of the same kind", () => {
    const events = [prWithLabels(["bug"]), prWithLabels(["bug"])];
    const capability = analyzeCapability(events, []);
    const workingStyle = analyzeWorkingStyle(events);
    const repos = new Map([[1, repo()]]);
    const issues = [
      issue(["bug", "needs triage"], { id: 1, title: "Same work untriaged" }),
      issue(["bug"], { id: 2, title: "Same work vetted" }),
    ];

    const ranked = matchIssues({
      capability, workingStyle, userLabelProfile: analyzeUserLabels(events),
      rankProfile: { skills: [], languageTerms: new Set(), skillIndex: new Map(), isEmpty: true },
      issues, reposByRepoId: repos,
    });
    assert.equal(ranked[0].issue.id, 2, "the vetted issue ranks first");
  });

  test("recommendations expose work type, intent and label-derived reasons", () => {
    const events = [prWithLabels(["bug"]), prWithLabels(["bug"])];
    const capability = analyzeCapability(events, []);
    const workingStyle = analyzeWorkingStyle(events);
    const repos = new Map([[1, repo()]]);

    const ranked = matchIssues({
      capability, workingStyle, userLabelProfile: analyzeUserLabels(events),
      rankProfile: { skills: [], languageTerms: new Set(), skillIndex: new Map(), isEmpty: true },
      issues: [issue(["kind/bug"])], reposByRepoId: repos,
    });
    const [rec] = explainRecommendations(ranked, { capability, workingStyle });

    assert.equal(rec.work_type, "bug-fix");
    assert.equal(rec.work_type_label, "Bug fix");
    assert.ok(rec.declared_intent.includes("Bug fix"));
    assert.ok(
      rec.why.some((w) => /merged before/i.test(w)),
      `expected a demonstrated-history reason, got ${JSON.stringify(rec.why)}`
    );
  });
});
