# DevCollab

DevCollab is a full-stack developer collaboration hub. Developers can create a profile, showcase projects, attach GitHub repositories and live demos, request code reviews, star and fork projects, and connect with potential collaborators. Connecting a GitHub account builds an **evidence-based skill profile** from real contribution history (merged PRs, repositories, reviews) instead of self-reported claims.

## Stack

- Frontend: React 19, React Router, Axios, Tailwind CSS
- Backend: Node.js, Express 5, JWT access and refresh-token authentication
- Database: PostgreSQL
- Cache/queue: Redis (graceful when unavailable)
- GitHub: OAuth App + `@octokit/rest` with throttling/retry
- Uploads: Amazon S3 via Multer
- Tests: `node --test` + supertest + pg-mem

## Run locally with Docker

From the repository root:

```bash
docker compose up --build
```

The frontend is available at `http://localhost:3000`; the API is at `http://localhost:5000/api`. Compose also starts a `worker` container that processes GitHub backfill jobs from the Redis queue.

## Run without Docker

1. Create a PostgreSQL database and set `DATABASE_URL`, `JWT_SECRET`, and `JWT_SECRET_REFRESH` in `backend/.env`.
2. Copy `backend/.env.example` to `backend/.env` (and `frontend/.env.example` to `frontend/.env`) and fill in the values. The schema is applied automatically on server boot.
3. Initialize or upgrade the database:

```bash
cd backend
psql "$DATABASE_URL" -f db/schema.sql
npm install
npm start
```

4. In another terminal, start the React app:

```bash
cd frontend
npm install
npm start
```

The schema is safe to run against an existing installation: it adds the DevCollab profile columns and creates the project, review, tag, star, fork, collaboration-request, `github_accounts`, `evidence_events`, and `skill_evidence` tables without deleting existing data.

## GitHub evidence graph

Connecting GitHub (`/github` in the app) runs a background backfill that builds an evidence graph:

- **OAuth:** server-side GitHub OAuth App flow. The access token is encrypted at rest with AES-256-GCM (`GITHUB_TOKEN_ENCRYPTION_KEY`) and never exposed to the browser.
- **`evidence_events`:** merged PRs, contributed repositories (non-fork repos you own or merged into), per-merge commits, and reviews — each with a source URL, deduplicated via a unique `(account, event_type, github_event_id)` constraint (safe to re-run).
- **`skill_evidence`:** deterministic, recency-decayed scores derived from that evidence (matched against a language/framework/database/infra lexicon).
- **Worker:** `node jobs/worker.js` processes a Redis queue (`BACKFILL_GITHUB_USER`). Redis is optional — if it is down, no jobs are lost and the status endpoint still reflects PostgreSQL state.

### GitHub environment variables

| Variable | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client id |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App secret (backend only) |
| `GITHUB_CALLBACK_URL` | e.g. `http://localhost:5000/api/auth/github/callback` |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for tokens at rest; **separate from `JWT_SECRET`** (generate with `openssl rand -hex 32`) |
| `GITHUB_BACKFILL_MAX_PAGES` / `GITHUB_BACKFILL_MAX_PR_FILES` / `GITHUB_BACKFILL_MAX_REPOS_LANGUAGES` | Backfill rate-limit guardrails |
| `GITHUB_CORPUS_TOKEN` | Optional read-only PAT for the worker's corpus repo/issue sync. Unauthenticated sync is capped at 60 requests/hour/IP and returns 403 once exhausted; a classic PAT (even with no scopes) raises this to 5000/hour |

To create a GitHub OAuth App, go to **Settings → Developer settings → OAuth Apps** and set the callback URL to your `GITHUB_CALLBACK_URL`.

## Main API areas

- `/api/auth` — registration, sign-in, profiles, tokens, and GitHub OAuth (`/api/auth/github`, `/api/auth/github/callback`)
- `/api/github` — backfill status, evidence/skill data, manual backfill retry
- `/api/projects` — project discovery, creation, updates, stars, forks, and collaboration requests
- `/api/reviews` — reviews, ratings, replies, and reactions
- `/api/admin` — user and project moderation

## Tests

```bash
cd backend
npm test
```

The suite uses pg-mem (or `DATABASE_URL_TEST`) so it runs without a live PostgreSQL; Redis is not required. Coverage includes auth + project smoke tests, the GitHub OAuth flow, backfill idempotency/error handling, and skill extraction/scoring determinism.
