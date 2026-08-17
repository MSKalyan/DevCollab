# DevCollab — Phase 0 + Phase 1 Implementation Plan

Scope: GitHub OAuth + evidence graph backfill. NO corpus/ranker/extension/dashboard redesign yet.

## Stack facts from inspection

- Backend: Express 5 (ESM), `node --test`, supertest, pg-mem for tests.`/api/auth`, `/api/projects`, `/api/admin`, `/api/reviews`.
- Auth: `users` table + JWT access cookie + refresh tokens stored in `refresh_tokens`. `requireAuth` cookie/bearer middleware. `utils/tokenUtils.js`, `utils/response.js` helpers.
- DB: single idempotent `db/schema.sql` (CREATE TABLE IF NOT EXISTS + safe ALTER). Applied by `db/init.js` at boot; pg-mem reads the same file for tests.
- Redis: `config/redis.js` client + `utils/cache.js` (getCache/setCache/delCache/delCacheByPattern). Graceful when Redis unavailable.
- No existing job/worker infrastructure → introduce a minimal Redis-list queue + `jobs/worker.js` process.

## Changes

### 1. Config / env (Phase 0)
- Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `GITHUB_TOKEN_ENCRYPTION_KEY` to `backend/.env.example`.
- GITHUB_TOKEN_ENCRYPTION_KEY is a separate key for AES-256-GCM token encryption — never reuse JWT_SECRET.

### 2. Database schema (`db/schema.sql`, appended, idempotent)
- `github_accounts`: user_id (FK users, UNIQUE), github_user_id BIGINT UNIQUE, login, name, avatar_url, profile_url, access_token_encrypted, token_expires_at, backfill_status, backfill_error, last_synced_at, last_backfill_started_at, created_at, updated_at.
- `evidence_events`: github_account_id FK, event_type, github_event_id (repo_id matter), repo_id, repo_full_name, pr_number, commit_sha, language, metadata JSONB, occurred_at, source_url, created_at. UNIQUE(github_account_id, event_type, github_event_id).
- `skill_evidence`: github_account_id FK, skill, score, evidence_count, merged_pr_count, review_count, repository_count, last_seen_at, created_at, updated_at. UNIQUE(github_account_id, skill).
- Indexes on github_user_id, github_account_id, backfill_status.

### 3. Dependencies
- `@octokit/rest` + `@octokit/plugin-throttling` (rate-limit / Retry-After handling, retries, pagination).

### 4. Services (`backend/services/`)
- `github/githubClient.js` — create Octokit client (app token auth for API, user token), throttling plugin, pagination helpers, error normalization.
- `github/githubAuth.js` — authorize URL + state generation, code exchange (`fetch` POST), token crypto (AES-256-GCM encrypt/decrypt using GITHUB_TOKEN_ENCRYPTION_KEY).
- `github/githubUser.js`, `githubRepositories.js`, `githubPullRequests.js`, `githubReviews.js` — narrow API wrappers.
- `github/backfill.js` — orchestrates user/repos/PRs/reviews collect + persist evidence_events (idempotent inserts) + skill recompute.
- `skills/skillExtractor.js` — deterministic lexicon (languages/frameworks/dbs/infra) extraction from repo languages/topics, PR text, file extensions.
- `skills/skillEvidenceCalculator.js` — recency-weighted scoring over evidence_events (isolated, Phase 2 replaceable).

### 5. Models (`backend/models/`)
- `githubAccountModel.js`, `evidenceModel.js`, `skillEvidenceModel.js`.

### 6. Queue + worker
- `jobs/queue.js` — Redis BLPUSH/BRPOP with retry list; job = { type: 'BACKFILL_GITHUB_USER', githubAccountId }.
- `jobs/worker.js` — separate process `node jobs/worker.js`, processes jobs, updates github_accounts.backfill_status, streams status to Redis `github:backfill:*`.

### 7. Routes / controllers
- `routes/githubAuthRoutes.js` mounted at `/api/auth`: `GET /github` (requireAuth → state cookie + redirect), `GET /github/callback` (validate state + code, exchange, upsert account, enqueue backfill, redirect to frontend `/github`).
- `routes/githubRoutes.js` mounted at `/api/github`: `GET /status`, `GET /evidence`, `POST /backfill` (retry).

### 8. Frontend
- `pages/GitHub.jsx` — Connect GitHub button, status polling (QUEUED/RUNNING), evidence stats + skill bars. `/github` route + sidebar link.

### 9. Tests (`backend/tests/`)
- `githubAuth.test.js` — initiation redirect, invalid/missing state, code exchange failure, encrypted token stored.
- `githubBackfill.test.js` — backfill with stubbed octokit client, idempotency, pagination, rate-limit/API failure, skill calculation determinism.
- Run full existing suite before/after.

## Acceptance flow
Connect GitHub → OAuth → encrypted token stored → worker backfill → evidence_events in pg → skill_evidence computed → Redis cached → status COMPLETED → frontend shows profile.