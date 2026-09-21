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

## Accounts: email verification and OAuth sign-in

Three ways to get an account, all of which end in the same session cookies:

**Email + password.** `POST /api/auth/register` creates the account *unverified* and emails a 6-digit code; it issues **no** session. `POST /api/auth/verify-email` with `{email, code}` confirms the address and only then signs the user in. Until then any authenticated route is closed and `POST /api/auth/login` answers `403 {code: "EMAIL_NOT_VERIFIED"}`, re-sending a code when none is live.

- Codes expire after 10 minutes, are single-use, and allow 5 attempts before a new one is required. Only the newest code per user is valid, and re-requesting is rate-limited to one per 60 seconds (`POST /api/auth/resend-verification`).
- Registering an address that is already **verified** is a `409`. Registering one that is still **pending** is a `200` that re-sends a code and leaves the stored password untouched — otherwise anyone who knows an address could plant a password and take the account over the moment the real owner verified.
- Codes are stored as SHA-256 digests (`email_verification_codes`), so a database leak cannot be replayed, exactly like password reset tokens.

**Google Sign-In.** The browser sends Google's ID token to `POST /api/auth/google`; only the backend verifies it against Google's keys (`GOOGLE_CLIENT_ID`). The account is matched by the Google subject first (so a later address change keeps the same account) and by verified email second, then created if neither matches. An unverified Google address is refused with `403`, and a Google identity is never allowed to take over an address that already belongs to another account.

**GitHub sign-in.** `GET /api/auth/github/login` (public) returns the GitHub authorize URL with the minimal `read:user user:email` scopes. The callback lands on the **same** `/api/auth/github/callback` endpoint as "connect GitHub", because a GitHub OAuth App registers exactly one callback URL: the two flows are distinguished by which state cookie the returned `state` matches, and they redirect to different pages. Sign-in only trusts an address GitHub reports as verified, so an unverified address can never be used to claim an account. An account created this way starts already verified — the address was just proved.

All three paths funnel through `services/auth/session.js`, so cookies, refresh-token rotation, and the `/api/auth/me` response shape cannot drift between them. `GET /api/auth/me` returns `{id, name, email, role, email_verified, has_password, has_google, created_at}`.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Sign-In client id; must match the frontend's `REACT_APP_GOOGLE_CLIENT_ID` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App credentials, shared by sign-in and connect |
| `GITHUB_CALLBACK_URL` | The single registered callback, e.g. `http://localhost:5000/api/auth/github/callback` |
| `FRONTEND_URL` | Where OAuth callbacks redirect (no trailing slash) |
| `AUTH_RATE_LIMIT_MAX` | Per-IP, per-15-minute budget covering `login`, `register`, `verify-email`, `resend-verification`, `forgot-password`, and `reset-password` (default `20`) |

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

## Password reset

From `/login`, **Forgot password?** takes the user to `/forgot-password`. The backend looks the address up in the database: if no account exists it returns a 404 `No account found with that email.` and sends nothing; only registered addresses get an email. A single-use link is emailed to `/reset-password?token=...`; it expires after 60 minutes, and requesting a new link invalidates any earlier one.

Tokens are stored as SHA-256 digests (`password_reset_tokens`), so a database leak cannot be replayed. Redeeming a token sets the new password, deletes every other reset token for that user, and revokes all of the user's refresh tokens so any stolen session dies with the old password.

Email is sent over SMTP. Without `SMTP_HOST` (local development, tests) the reset link is written to the server console instead, so the flow works with no mail provider configured.

| Variable | Purpose |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | SMTP relay; when `SMTP_HOST` is unset, reset links are logged instead of sent |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials (omit for unauthenticated relays) |
| `MAIL_FROM` | From header, e.g. `DevCollab <no-reply@devcollab.com>` |
| `FRONTEND_URL` | Base URL used to build the reset link (no trailing slash) |
| `AUTH_RATE_LIMIT_MAX` | Per-IP, per-15-minute budget for the unauthenticated auth endpoints (default `20`) |

## Contribution agent

`GET /api/contributions` answers *"where can this person actually contribute?"* rather than *"which repositories mention their keywords"*. A five-stage agent workflow runs over two inputs:

```
evidence_events ─► capability analyst ────┐
                ─► working-style analyst ─┤
                ─► label analyst ─────────┼─► matcher ─► explainer ─► ranked issues
github_issues   ─► project analyst ───────┘
```

- **Capability analyst** — infers an overall level (`newcomer` → `expert`) plus six dimensions (language depth, code volume, review capability, breadth, consistency, collaboration) from evidence counts. Confidence is tracked separately and gates the upper levels, so a three-event account cannot be labelled an expert.
- **Working-style analyst** — infers *how* someone works: archetype, whether they lean towards code or review, whether their changed files skew to tests/docs/CI/infrastructure, their preferred change scope, and whether their cadence is steady, bursty, or occasional. Every trait carries the raw numbers behind it.
- **Label analyst** — reads maintainer-declared intent from issue labels, and (more usefully) learns which work types have actually been *merged* from this person by reading the labels on their merged PRs. See below.
- **Project analyst** — for each issue, derives the repo's stack from collected language/topic metadata, estimates issue difficulty and scope, and reuses the existing friendliness/freshness signals.
- **Matcher** — combines skill match, capability fit, infrastructure fit, label fit, keyword similarity, friendliness, and freshness. Capability fit means a newcomer is not handed an `epic` in a 200k-star repo, and an expert is not offered only starter labels.
- **Explainer** — produces a grounded `why` list and a concrete `next_step` per recommendation.

### Label analyst

Labels are the maintainers' own declaration of what a piece of work is, which makes them the most direct signal available — but the vocabulary is wildly inconsistent between repositories. The corpus contains `bug`, `kind/bug`, `kind:bug`, `c bug`, `bug/1 unconfirmed`, `failed test`, `flaky test`, and `type/docs` for the same handful of concepts.

Matching therefore works on a tokenized form where every non-alphanumeric run becomes a space, so `kind/bug`, `kind:bug` and `c bug` all collapse to `kind bug` and match one pattern — no per-repository spelling table. Anything the taxonomy does not recognise (area labels such as `area:adapters`, `provider:fab`, `turbopack`) correctly yields no work type rather than a wrong one.

The analyst does two things:

- **Classifies each issue** into a work type (`bug-fix`, `documentation`, `feature`, `performance`, `refactor`, `testing`, `infrastructure`, `design`, `security`, `maintenance`, `starter`) with a difficulty implication, plus *modifier* labels that adjust confidence. Triage-flavoured labels (`needs triage`, `unconfirmed`) reduce confidence; closed-off ones (`duplicate`, `wontfix`, `blocked`) remove the issue from the pool entirely, since recommending them wastes the reader's time.
- **Learns the user's demonstrated work types** from the labels their merged PRs carried. A merged PR held a label because a maintainer accepted that description of the work, so this is a record of what the person is *ready for* rather than what they claim. A user whose merged work is 8 bug fixes and 2 doc changes is not the same candidate as one whose work is performance and breaking changes.

The result drives a `label_fit` score, the `work_type` filter, work-type badges on each card, and a **Demonstrated work types** panel that doubles as filter chips.

`GET /api/contributions?work_type=bug-fix` narrows the pool before ranking (an unrecognised value is ignored rather than returning nothing). Issues whose labels imply no work type still get a neutral label score rather than being penalised.

### Optional LLM enrichment

The agent is **fully functional with no LLM configured**. Every score is computed deterministically; the model only supplies prose. Set `LLM_API_KEY` to add a capability narrative and sharper per-recommendation reasons — a missing, slow, or malformed response degrades to the deterministic text and cannot change a score. Any OpenAI-compatible endpoint works by setting `LLM_BASE_URL` (OpenAI, Groq, OpenRouter, Together, local Ollama).

| Variable | Purpose |
|---|---|
| `LLM_API_KEY` | Enables LLM enrichment; unset = deterministic-only (default) |
| `LLM_BASE_URL` | OpenAI-compatible base URL (default `https://api.openai.com/v1`) |
| `LLM_MODEL` | Model name (default `gpt-4o-mini`) |
| `LLM_TIMEOUT_MS` | Per-call timeout before falling back to deterministic text (default `20000`) |
| `CONTRIBUTION_AGENT_MAX_CORPUS` | Max issues scored per request (default `400`) |
| `GITHUB_BACKFILL_MAX_PR_FILE_PATHS` | Changed-file paths stored per merged PR; these drive the working-style traits |

#### Groq setup

Groq is OpenAI-compatible, so it needs only config — no code change, no SDK. In `backend/.env`:

```bash
LLM_API_KEY=gsk_...                                  # https://console.groq.com/keys
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=openai/gpt-oss-120b                        # or openai/gpt-oss-20b (cheaper/faster)
```

Recommended model ids (Groq retires models periodically — check `https://console.groq.com/docs/models`):

| Model id | Notes |
|---|---|
| `openai/gpt-oss-120b` | Best quality among current production models; ~$0.15/$0.60 per 1M tokens |
| `openai/gpt-oss-20b` | Cheaper and faster; adequate for narrative wording |
| `qwen/qwen3.8-27b` | Alternative with a much larger context window (preview tier) |

The backend logs its active model at boot (`Contribution agent: LLM enrichment on (<model> via <url>)`), and every failed call logs the HTTP status, model, and base URL — so a bad key or a retired model id is diagnosable from the logs rather than a silent quality drop. Because these models are reasoning models, the completion budget is sized to cover hidden reasoning tokens as well as the visible JSON.


Analysis is cached in `contribution_profiles` keyed by an evidence fingerprint, so an unchanged history reuses the previous narrative instead of paying for another LLM call. Existing accounts need a backfill re-run to populate the diff-size and changed-path signals that working-style analysis reads; without them those traits report as unknown rather than guessing.

## Main API areas

- `/api/auth` — registration, email-verification codes, password sign-in, Google Sign-In, GitHub sign-in/connect OAuth, profiles, and token refresh
- `/api/github` — backfill status, evidence/skill data, manual backfill retry
- `/api/projects` — project discovery, creation, updates, stars, forks, and collaboration requests
- `/api/contributions` — agent-analyzed capability + working-style profile and matched open-source issues
- `/api/reviews` — reviews, ratings, replies, and reactions
- `/api/admin` — user and project moderation

## Tests

```bash
cd backend
npm test
```

The suite uses pg-mem (or `DATABASE_URL_TEST`) so it runs without a live PostgreSQL; Redis is not required. Coverage includes the registration + OTP verification contract (attempt caps, code expiry, single-use, resend cooldown, pending re-register), Google and GitHub sign-in, auth + project smoke tests, backfill idempotency/error handling, and skill extraction/scoring determinism. Tests never send mail: the dev outbox in `utils/mailer.js` captures the code, and `tests/helpers/authFlow.js` drives the whole register → verify round-trip.
