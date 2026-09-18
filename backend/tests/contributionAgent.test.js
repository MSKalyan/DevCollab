import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { analyzeCapability, capabilityLevel } from "../services/agent/stages/capabilityAnalyst.js";
import {
  analyzeWorkingStyle,
  summarizeExperience,
} from "../services/agent/stages/workingStyleAnalyst.js";
import { analyzeProject, analyzeStack, analyzeIssueDifficulty } from "../services/agent/stages/projectAnalyst.js";
import { matchIssues, capabilityFit, infrastructureFit } from "../services/agent/stages/matcher.js";
import {
  explainRecommendations,
  deterministicNarrative,
} from "../services/agent/stages/explainer.js";
import { evidenceVersion } from "../services/agent/index.js";
import { pathKind, domainOf } from "../config/domains.js";

// --- fixtures ------------------------------------------------------------

function pr({ repo = "psf/requests", lang = "Python", at = "2026-01-05T00:00:00Z", add = 40, del = 10, files = 2, paths = [] } = {}) {
  return {
    event_type: "MERGED_PR",
    repo_full_name: repo,
    language: lang,
    occurred_at: at,
    metadata: { additions: add, deletions: del, changed_files: files, file_paths: paths, skills: [lang.toLowerCase()] },
  };
}

const STRONG_EVIDENCE = [
  pr({ at: "2026-01-01T00:00:00Z", paths: ["requests/sessions.py"] }),
  pr({ at: "2026-01-02T00:00:00Z", paths: ["requests/models.py", "tests/test_models.py"] }),
  pr({ at: "2026-01-03T00:00:00Z" }),
  pr({ at: "2026-01-04T00:00:00Z" }),
  pr({ at: "2026-01-05T00:00:00Z", repo: "django/django" }),
  { event_type: "PR_REVIEW", repo_full_name: "django/django", occurred_at: "2026-01-06T00:00:00Z", metadata: {} },
  { event_type: "CONTRIBUTED_REPOSITORY", repo_full_name: "me/tool", language: "Python", occurred_at: "2026-01-01T00:00:00Z", metadata: { languages: ["Python"], topics: [] } },
];

const SKILLS = [
  { skill: "python", score: 1, evidence_count: 5, merged_pr_count: 5, repository_count: 3, review_count: 1 },
  { skill: "django", score: 0.5, evidence_count: 1, merged_pr_count: 1, repository_count: 0, review_count: 0 },
];

function repo(over = {}) {
  return {
    id: 1,
    full_name: "psf/requests",
    html_url: "https://github.com/psf/requests",
    primary_language: "Python",
    languages: { Python: 900000, HTML: 100000 },
    topics: ["http", "python"],
    stars: 52000,
    forks: 9000,
    open_issues_count: 130,
    last_pushed_at: new Date().toISOString(),
    ...over,
  };
}

function issue(over = {}) {
  return {
    id: 10,
    github_issue_id: 999,
    repository_id: 1,
    issue_number: 1234,
    title: "Add retry support to the HTTP client",
    body: "The client should retry on 5xx responses.",
    labels: ["good first issue"],
    repo_topics: ["http", "python"],
    repo_language: "Python",
    comments_count: 2,
    state: "open",
    updated_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    repo_full_name: "psf/requests",
    ...over,
  };
}

// --- domain config -------------------------------------------------------

describe("domain config", () => {
  test("classifies file paths into work kinds", () => {
    assert.equal(pathKind("src/app.py"), "product");
    assert.equal(pathKind("tests/test_app.py"), "tests");
    assert.equal(pathKind("docs/guide.rst"), "docs");
    assert.equal(pathKind(".github/workflows/ci.yml"), "ci");
    assert.equal(pathKind("Dockerfile"), "infrastructure");
    assert.equal(pathKind("package-lock.json"), "dependencies");
    assert.equal(pathKind("styles/main.css"), "styling");
  });

  test("maps skills to domains", () => {
    assert.equal(domainOf("react"), "frontend");
    assert.equal(domainOf("postgresql"), "data");
    assert.equal(domainOf("kubernetes"), "infrastructure");
    assert.equal(domainOf("nothing-like-this"), "other");
  });
});

// --- capability ----------------------------------------------------------

describe("capability analyst", () => {
  test("derives a level, score and confidence from evidence", () => {
    const c = analyzeCapability(STRONG_EVIDENCE, SKILLS);
    assert.ok(c.score > 0 && c.score <= 1, "score is normalized");
    assert.ok(c.confidence > 0 && c.confidence <= 1, "confidence is normalized");
    assert.ok(["newcomer", "intermediate", "advanced", "expert"].includes(c.level));
    for (const v of Object.values(c.dimensions)) {
      assert.ok(v >= 0 && v <= 1, `dimension in range: ${v}`);
    }
  });

  test("more evidence raises confidence", () => {
    const thin = analyzeCapability([pr()], []);
    const thick = analyzeCapability(STRONG_EVIDENCE, SKILLS);
    assert.ok(thick.confidence > thin.confidence, "confidence grows with evidence volume");
  });

  test("no evidence yields a zeroed, non-throwing profile", () => {
    const c = analyzeCapability([], []);
    assert.equal(c.score, 0);
    assert.equal(c.confidence, 0);
    assert.equal(c.level, "newcomer");
    assert.deepEqual(c.primaryLanguages, []);
  });

  test("merged-PR languages dominate repository languages", () => {
    const c = analyzeCapability(STRONG_EVIDENCE, SKILLS);
    assert.equal(c.primaryLanguages[0].name, "python");
    assert.ok(c.primaryLanguages[0].weight > 0.5);
  });

  test("review-heavy evidence raises reviewCapability independently of PRs", () => {
    const reviewer = [
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-01T00:00:00Z", metadata: {} },
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-02T00:00:00Z", metadata: {} },
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-03T00:00:00Z", metadata: {} },
    ];
    const c = analyzeCapability(reviewer, []);
    assert.ok(c.dimensions.reviewCapability > 0.2, "reviews register as capability");
    assert.equal(c.totals.merged_prs, 0);
  });

  test("tolerates legacy evidence with no enriched metadata", () => {
    const legacy = [{ event_type: "MERGED_PR", repo_full_name: "a/b", language: "Python", occurred_at: "2026-01-01T00:00:00Z", metadata: { skills: ["python"] } }];
    const c = analyzeCapability(legacy, []);
    assert.equal(c.totals.merged_prs, 1);
    assert.equal(c.totals.avg_pr_size, 0, "unknown diff size reported as zero, not NaN");
  });

  test("levels are gated by confidence so thin evidence cannot claim expertise", () => {
    // A perfect score on almost no evidence must not read as expert.
    assert.equal(capabilityLevel(0.9, 0.1), "intermediate");
    assert.equal(capabilityLevel(0.9, 0.9), "expert");
    assert.equal(capabilityLevel(0.2, 0.9), "newcomer");
  });
});

// --- working style -------------------------------------------------------

describe("working style analyst", () => {
  test("infers a preferred scope from diff sizes", () => {
    const small = analyzeWorkingStyle([
      pr({ add: 20, del: 5, files: 2 }), pr({ add: 30, del: 8, files: 3 }), pr({ add: 15, del: 4, files: 1 }),
    ]);
    assert.equal(small.preferredScope, "small");
  });

  test("detects a test-writing habit from changed paths", () => {
    const s = analyzeWorkingStyle([
      pr({ paths: ["src/a.py", "tests/test_a.py"] }),
      pr({ paths: ["src/b.py", "tests/test_b.py"] }),
    ]);
    assert.ok(s.traits.some((t) => t.trait === "tests-included"), "tests trait present");
    assert.ok(s.focus.tests > 0);
  });

  test("identifies documentation work", () => {
    const s = analyzeWorkingStyle([
      pr({ paths: ["docs/a.rst", "docs/b.rst", "README.md"] }),
      pr({ paths: ["docs/c.rst"] }),
    ]);
    assert.equal(s.archetype, "documentation-contributor");
  });

  test("reviewer archetype when reviews outnumber PRs", () => {
    const s = analyzeWorkingStyle([
      pr(),
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-02T00:00:00Z", metadata: {} },
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-03T00:00:00Z", metadata: {} },
      { event_type: "PR_REVIEW", repo_full_name: "a/b", occurred_at: "2026-01-04T00:00:00Z", metadata: {} },
    ]);
    assert.equal(s.archetype, "reviewer-maintainer");
  });

  test("every trait carries the evidence behind it", () => {
    const s = analyzeWorkingStyle(STRONG_EVIDENCE);
    assert.ok(s.traits.length > 0);
    for (const t of s.traits) {
      assert.ok(typeof t.trait === "string" && t.trait.length > 0);
      assert.ok(t.evidence && t.evidence.length > 0, `trait ${t.trait} explains itself`);
      assert.ok(t.score >= 0 && t.score <= 1);
    }
  });

  test("empty evidence produces a valid style without throwing", () => {
    const s = analyzeWorkingStyle([]);
    assert.equal(s.archetype, "observer");
    assert.deepEqual(s.traits, []);
    assert.ok(s.summary.length > 0);
  });

  test("experience summarizes the capability totals", () => {
    const c = analyzeCapability(STRONG_EVIDENCE, SKILLS);
    const e = summarizeExperience(c);
    assert.equal(e.merged_prs, 5);
    assert.equal(e.reviews, 1);
    assert.ok(e.repositories >= 2, "counts every repo touched, not just owned");
  });

  test("surfaces skill_evidence as graded skills, not just languages", () => {
    const c = analyzeCapability(STRONG_EVIDENCE, SKILLS);
    assert.ok(Array.isArray(c.skills), "skills array is present");
    assert.equal(c.skills.length, SKILLS.length);
    const python = c.skills.find((s) => s.skill === "python");
    assert.ok(python, "python skill present");
    assert.equal(python.strength, "strong", "5 merged PRs reads as strong");
    assert.equal(python.merged_pr_count, 5);
    // A skill with no merged PRs must not be labelled strong.
    const django = c.skills.find((s) => s.skill === "django");
    assert.notEqual(django.strength, "strong");
  });
});

// --- project analysis ----------------------------------------------------

describe("project analyst", () => {
  test("normalizes language bytes into shares", () => {
    const stack = analyzeStack(repo());
    assert.equal(stack.primaryLanguage, "python");
    assert.equal(stack.languages[0].name, "python");
    assert.ok(Math.abs(stack.languages[0].share - 0.9) < 0.001);
    assert.ok(stack.technologies.includes("http"), "topics count as technologies");
  });

  test("starter labels lower the difficulty estimate", () => {
    const easy = analyzeIssueDifficulty(issue({ labels: ["good first issue"], body: "small" }), analyzeStack(repo()));
    const hard = analyzeIssueDifficulty(issue({ labels: ["epic", "needs design"], body: "x".repeat(2500) }), analyzeStack(repo()));
    assert.equal(easy.difficulty, "starter");
    assert.ok(hard.score > easy.score, "complex labels score harder");
    assert.equal(easy.scope, "small");
  });

  test("starter label is decisive even in a very large repository", () => {
    const labelled = analyzeIssueDifficulty(issue({ labels: ["good first issue"] }), analyzeStack(repo({ stars: 200000 })));
    assert.equal(labelled.difficulty, "starter", "maintainer label beats repo size heuristics");
    assert.ok(labelled.reason, "explains why it is considered starter work");
  });

  test("an unlabelled issue in a huge repo is not called starter", () => {
    const plain = analyzeIssueDifficulty(
      issue({ labels: [], comments_count: 20, body: "y".repeat(3000) }),
      analyzeStack(repo({ stars: 200000 }))
    );
    assert.notEqual(plain.difficulty, "starter");
  });

  test("heavy discussion increases estimated difficulty", () => {
    const quiet = analyzeIssueDifficulty(issue({ labels: [], comments_count: 0 }), analyzeStack(repo()));
    const loud = analyzeIssueDifficulty(issue({ labels: [], comments_count: 30 }), analyzeStack(repo()));
    assert.ok(loud.score > quiet.score);
  });

  test("analyzeProject exposes stack, difficulty, friendliness and accessibility", () => {
    const p = analyzeProject(issue(), repo());
    assert.equal(p.repository, "psf/requests");
    assert.ok(p.difficulty.difficulty);
    assert.ok(p.friendliness.score >= 0 && p.friendliness.score <= 1);
    assert.ok(p.accessibility >= 0 && p.accessibility <= 1);
    assert.equal(p.externalContributorSignal.accepts_outside_work, true);
  });

  test("handles a missing repository without throwing", () => {
    const p = analyzeProject(issue({ repo_full_name: "x/y" }), null);
    assert.equal(p.friendliness.score, 0);
    assert.ok(p.difficulty.difficulty, "still classifies the issue");
  });
});

// --- matcher -------------------------------------------------------------

describe("matcher", () => {
  const capability = analyzeCapability(STRONG_EVIDENCE, SKILLS);
  const workingStyle = analyzeWorkingStyle(STRONG_EVIDENCE);
  const rankProfile = { skills: SKILLS, languageTerms: new Set(["python"]), skillIndex: new Map(), isEmpty: false };

  test("capability fit prefers work at or just above the user's level", () => {
    const starter = capabilityFit(capability, workingStyle, { difficulty: "starter", scope: "small" });
    const deep = capabilityFit(capability, workingStyle, { difficulty: "deep", scope: "large" });
    assert.ok(starter > deep, "a starter task fits a capability-appropriate user better than a deep one");
  });

  test("newcomer is not matched to deep work", () => {
    const newcomer = { level: "newcomer", confidence: 0.8 };
    const fitDeep = capabilityFit(newcomer, { preferredScope: "small" }, { difficulty: "deep", scope: "large" });
    const fitStarter = capabilityFit(newcomer, { preferredScope: "small" }, { difficulty: "starter", scope: "small" });
    assert.ok(fitStarter > fitDeep);
    assert.ok(fitDeep < 0.5, "deep work scores poorly for a newcomer");
  });

  test("infrastructure fit rewards a primary-language hit", () => {
    const fit = infrastructureFit(capability, { stack: analyzeStack(repo()) });
    assert.ok(fit.primaryHit, "python project matches a python user");
    assert.ok(fit.score > 0.5);
    assert.ok(fit.matched.includes("python"));
  });

  test("infrastructure fit is zero when nothing overlaps", () => {
    const fit = infrastructureFit(
      { primaryLanguages: [{ name: "rust", weight: 1 }], skills: [] },
      { stack: analyzeStack(repo()) }
    );
    assert.ok(fit.score < 0.2, "no overlap scores low");
  });

  test("ranks a matching issue above an unrelated one and explains why", () => {
    const repos = new Map([[1, repo()]]);
    const issues = [
      issue({ id: 1, title: "Add retry support to the HTTP client", body: "python http client retry" }),
      issue({ id: 2, title: "Update the Kubernetes operator CRD", body: "golang kubernetes controller reconcile", labels: ["epic"], repo_language: "Go" }),
    ];
    const ranked = matchIssues({ capability, workingStyle, rankProfile, issues, reposByRepoId: repos });
    assert.equal(ranked[0].issue.id, 1, "the matching issue ranks first");
    assert.ok(ranked[0].fitScore > ranked[1].fitScore);
    assert.ok(ranked[0].signals.skill_match > 0, "skill match is reported");
  });

  test("difficulty filter narrows the result set", () => {
    const repos = new Map([[1, repo()]]);
    const issues = [issue({ id: 1, labels: ["good first issue"], body: "tiny" }), issue({ id: 2, labels: ["epic"], body: "x".repeat(3000) })];
    const filtered = matchIssues({ capability, workingStyle, rankProfile, issues, reposByRepoId: repos, difficultyFilter: "starter" });
    assert.ok(filtered.length >= 1);
    assert.ok(filtered.every((r) => r.project.difficulty.difficulty === "starter"));
  });

  test("fit scores stay within 0..100 and ranks are sequential", () => {
    const repos = new Map([[1, repo()]]);
    const issues = [issue({ id: 1 }), issue({ id: 2, title: "other", body: "unrelated" })];
    const ranked = matchIssues({ capability, workingStyle, rankProfile, issues, reposByRepoId: repos });
    ranked.forEach((r, i) => {
      assert.ok(r.fitScore >= 0 && r.fitScore <= 100, `fit in range: ${r.fitScore}`);
      assert.equal(r.rank, i + 1);
    });
  });
});

// --- explainer -----------------------------------------------------------

describe("explainer", () => {
  const capability = analyzeCapability(STRONG_EVIDENCE, SKILLS);
  const workingStyle = analyzeWorkingStyle(STRONG_EVIDENCE);
  const rankProfile = { skills: SKILLS, languageTerms: new Set(["python"]), skillIndex: new Map(), isEmpty: false };

  test("produces an actionable reason and a next step for every recommendation", () => {
    const repos = new Map([[1, repo()]]);
    const ranked = matchIssues({ capability, workingStyle, rankProfile, issues: [issue()], reposByRepoId: repos });
    const [rec] = explainRecommendations(ranked, { capability, workingStyle });

    assert.ok(rec.why.length > 0, "explains the suggestion");
    assert.ok(rec.next_step.length > 0, "tells the user what to do");
    assert.equal(rec.repository, "psf/requests");
    assert.equal(rec.number, 1234);
    assert.equal(rec.difficulty, "starter");
    assert.ok(rec.matched_skills.includes("python"));
    assert.ok(typeof rec.fit_score === "number");
    // The reason must be grounded in real matched signal, not a generic line.
    assert.ok(rec.why.some((w) => /python/i.test(w)), `why mentions the matched skill: ${JSON.stringify(rec.why)}`);
  });

  test("deterministic narrative works with no LLM configured", () => {
    const narrative = deterministicNarrative({
      capability,
      workingStyle,
      experience: summarizeExperience(capability),
    });
    assert.ok(narrative.length > 40);
    assert.ok(/python/i.test(narrative), "names the strongest language");
  });

  test("narrative flags low-confidence reads instead of overclaiming", () => {
    const thin = analyzeCapability([pr()], []);
    const narrative = deterministicNarrative({ capability: thin, workingStyle: analyzeWorkingStyle([pr()]), experience: summarizeExperience(thin) });
    assert.ok(/limited evidence/i.test(narrative));
  });
});

// --- caching fingerprint -------------------------------------------------

describe("evidence version fingerprint", () => {
  test("is stable for identical evidence", () => {
    assert.equal(evidenceVersion(STRONG_EVIDENCE), evidenceVersion([...STRONG_EVIDENCE]));
  });

  test("changes when evidence is added", () => {
    assert.notEqual(evidenceVersion(STRONG_EVIDENCE), evidenceVersion([...STRONG_EVIDENCE, pr({ at: "2026-03-01T00:00:00Z" })]));
  });

  test("changes when the newest evidence moves", () => {
    const shifted = STRONG_EVIDENCE.map((e) => ({ ...e, occurred_at: "2027-01-01T00:00:00Z" }));
    assert.notEqual(evidenceVersion(STRONG_EVIDENCE), evidenceVersion(shifted));
  });
});
