# DevCollab — Refined Concept v2 (The GitHub Fit Layer)

> Second pass via the `idea-refine` skill (divergent expansion → convergence → sharpened one-pager).
> Supersedes the v1 one-pager: the concept is now clearer — an improvised inversion of *"build a platform around GitHub"* into *"augment GitHub itself."*

## Problem Statement

**How might we show a developer, in the place they already hunt, which open-source issues are genuinely worth their time — ranked by skills they've proven, not skills they claim?**

## The Improvised Shift (v1 → v2)

v1 said: *build a feed platform.* This pass inverts it.

| | v1 (feed platform) | v2 (fit layer) |
|---|---|---|
| Surface | New website — "why open another tab?" | Browser extension on GitHub + companion dashboard |
| Corpus | Self-built feed — cold start | GitHub's own search results ARE the corpus |
| User move | Migrate to a new habit | Zero behavior change; score appears where they already are |
| Adoption risk | Marketplace cold start | Extension install churn (mitigated by dashboard fallback) |

One improvised move kills v1's two biggest risks at once: the cold start and the "another platform" adoption friction.

## Recommended Direction

**DevCollab v2 = a proven-skills fit score, surfaced where issues are found.**

1. **GitHub OAuth → evidence graph.** Derive skills from real history, not self-report: languages weighted by merged PRs, repos contributed to, review participation. No manual profile builder — your history IS the profile.
2. **Issue ranker.** Score open "good first issue" issues against that graph: embedding similarity over issue body + labels + repo language/topics, blended with repo-friendliness signals (recent maintainer activity, PR acceptance rate).
3. **Two surfaces, one job.** The extension overlays a fit score + "why it matches" chips onto GitHub's issue search and issue pages; the one-screen dashboard ("today's top 10 for you") serves the daily habit and works without the extension.

The AI lives in the *accuracy of the score*; the trust lives in the *receipts* ("matches your 14 merged PRs using this stack in similar repos"). Every merged PR the user lands sharpens future scores — the retention loop is built into the product.

**The maintainer side is now free, not built:** once enough developers carry evidence-backed profiles, the "qualified contributor shortlists" feature is the same data through a second lens — a phase-2 configuration, not a v1 rebuild.

## Key Assumptions to Validate

- [ ] **A fit score changes behavior** — devs open and PR issues they'd otherwise have skipped. Pilot 20 devs, compare PR rate vs. control. *(Dealbreaker: if scores don't change behavior, this is a vitamin.)*
- [ ] **Embedding ranking beats keyword/tag ranking** for fit quality — A/B both rankers on the same pilot. *(Keyword ranker is the fallback MVP; the "AI" claim depends on this.)*
- [ ] **Users accept GitHub history reads and one extension install** — privacy must be surfaced, and extension churn is a real distribution risk; the dashboard is the fallback surface.
- [ ] **A good-first-issue corpus can be kept fresh within GitHub API rate limits** — needs a caching/backfill strategy early.
- [ ] **Score quality compounds** — each merged PR measurably improves future matches, driving return visits. *(The growth question, not the survival question.)*

## MVP Scope

One job, done well: **"score the good-first-issues I can realistically land, today."**

**In:**
- GitHub OAuth (only auth path).
- Evidence graph from history: languages, merged PRs, contributed repos.
- Embedding ranker over a curated popular-repo issue corpus (freshness-cached).
- Extension overlay: fit score + match-explanation chips on GitHub issue search/pages.
- Dashboard: one-screen "top 10 for you" digest.
- "Open on GitHub" — the conversation stays on GitHub.

**Out (v1):**
- Maintainer side, contributor inbox, invites — phase 2.
- In-app messaging/chat.
- Manual profile editing, resume import, social features.
- Payments, bounties, sponsorships.

## Not Doing (and Why)

- **Two-sided marketplace in v1** — the #1 cold-start risk; v2's data-first order makes it a phase-2 lens instead.
- **Self-reported skill tags** — unverifiable; the entire differentiation collapses into "LinkedIn for devs."
- **Standalone feed platform first** — v1's trap; the extension-first wedge is the fix.
- **AI chat / "explain this issue to me"** — demo candy; the job is ranking, and scope discipline wins.
- **In-app collaboration invites** — GitHub already routes this; not the job.
- **Job board / recruiter product** — a different product. (The long-term 10x is the *Skill Passport*: the same evidence graph packaged as a portable, verifiable credential any platform can consume. Moon-shot, not MVP.)

## Open Questions

- Which signals best predict "will land a PR here" — merged-PR language weight, repo stars, review activity, or a blend?
- Curated repo corpus vs. open GitHub search: coverage vs. reliability for v1.
- Issue-level embeddings (cost) vs. repo-level language/topic similarity for the first ranker.
- Extension-first vs. dashboard-first for launch: extension is the differentiator, dashboard is the reliable fallback — ship both, lead with whichever tests better.
