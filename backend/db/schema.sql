-- DevCollab application database schema
-- Run in Supabase SQL editor, or locally with:
--   psql "$DATABASE_URL" -f db/schema.sql

-- Users -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password        VARCHAR(255),
  role            VARCHAR(50)  NOT NULL DEFAULT 'user',
  bio             TEXT,
  avatar          VARCHAR(512),
  github_username VARCHAR(255),
  location        VARCHAR(255),
  website         VARCHAR(512),
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Safe upgrades for databases created by the earlier blogging application.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(512);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(512);

-- Projects, reviews, tags, stars, forks, and collaboration requests were
-- removed: GitHub is the source of truth for projects. Developers' repositories
-- come from their connected GitHub account (see github_accounts / evidence_events).

-- Private developer contact requests -------------------------------------
CREATE TABLE IF NOT EXISTS contact_requests (
  id           SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message      TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(recipient_id, requester_id)
);

-- Make message optional for existing installs (schema re-runs each boot).
ALTER TABLE contact_requests ALTER COLUMN message DROP NOT NULL;

-- Conversations (one per accepted contact request) + messages -------------
CREATE TABLE IF NOT EXISTS conversations (
  id                 SERIAL PRIMARY KEY,
  contact_request_id INTEGER NOT NULL UNIQUE REFERENCES contact_requests(id) ON DELETE CASCADE,
  user_a             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at    TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_a);
CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  read_at         TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- Review reactions (like / dislike) -------------------------------------
-- Removed with the projects/reviews feature (GitHub is the source of truth).

-- Refresh tokens (server-side revocation) ------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(512) NOT NULL UNIQUE,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient ON contact_requests(recipient_id);
-- Password reset tokens (single-use, stored hashed) -------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP   NOT NULL,
  used_at    TIMESTAMP,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- GitHub accounts (evidence graph) --------------------------------------
CREATE TABLE IF NOT EXISTS github_accounts (
  id                     SERIAL PRIMARY KEY,
  user_id                INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  github_user_id         BIGINT  NOT NULL UNIQUE,
  login                  VARCHAR(255) NOT NULL,
  name                   VARCHAR(255),
  avatar_url             VARCHAR(512),
  profile_url            VARCHAR(512),
  access_token_encrypted TEXT,
  token_expires_at       TIMESTAMP,
  backfill_status        VARCHAR(20) NOT NULL DEFAULT 'NOT_CONNECTED',
  backfill_error         TEXT,
  last_backfill_started_at TIMESTAMP,
  last_synced_at         TIMESTAMP,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_accounts_user ON github_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_github_accounts_status ON github_accounts(backfill_status);

-- Evidence events (traceable to GitHub, deterministic + reproducible) ----
CREATE TABLE IF NOT EXISTS evidence_events (
  id                 SERIAL PRIMARY KEY,
  github_account_id  INTEGER NOT NULL REFERENCES github_accounts(id) ON DELETE CASCADE,
  event_type         VARCHAR(30) NOT NULL,
  github_event_id    VARCHAR(255) NOT NULL,
  repo_id            BIGINT,
  repo_full_name     VARCHAR(512),
  pr_number          INTEGER,
  commit_sha         VARCHAR(64),
  language           VARCHAR(100),
  metadata           JSONB DEFAULT '{}'::jsonb,
  occurred_at        TIMESTAMP,
  source_url         VARCHAR(1024),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_evidence_event UNIQUE (github_account_id, event_type, github_event_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_events_account ON evidence_events(github_account_id);
CREATE INDEX IF NOT EXISTS idx_evidence_events_repo ON evidence_events(repo_id);
CREATE INDEX IF NOT EXISTS idx_evidence_events_type ON evidence_events(event_type);

-- Skill evidence (derived confidence, not a claim of expertise) ---------
CREATE TABLE IF NOT EXISTS skill_evidence (
  id                 SERIAL PRIMARY KEY,
  github_account_id  INTEGER NOT NULL REFERENCES github_accounts(id) ON DELETE CASCADE,
  skill              VARCHAR(100) NOT NULL,
  score              DOUBLE PRECISION NOT NULL DEFAULT 0,
  evidence_count     INTEGER NOT NULL DEFAULT 0,
  merged_pr_count    INTEGER NOT NULL DEFAULT 0,
  review_count       INTEGER NOT NULL DEFAULT 0,
  repository_count   INTEGER NOT NULL DEFAULT 0,
  last_seen_at       TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_skill_evidence UNIQUE (github_account_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_skill_evidence_account ON skill_evidence(github_account_id);

-- Cached contribution-agent analysis ----------------------------------
-- The capability/working-style analysis is expensive to recompute and only
-- changes when the underlying evidence does, so it is persisted here keyed by
-- the evidence fingerprint it was derived from.
CREATE TABLE IF NOT EXISTS contribution_profiles (
  id                 SERIAL PRIMARY KEY,
  github_account_id  INTEGER NOT NULL UNIQUE REFERENCES github_accounts(id) ON DELETE CASCADE,
  evidence_version   VARCHAR(64) NOT NULL,
  capability         JSONB NOT NULL DEFAULT '{}'::jsonb,
  working_style      JSONB NOT NULL DEFAULT '{}'::jsonb,
  experience         JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative          TEXT,
  generated_by       VARCHAR(20) NOT NULL DEFAULT 'deterministic',
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Curated repositories (Phase 2: issue corpus source) ---------------------
-- A configurable list of repositories we collect issues from. Disabled repos
-- are skipped by the collector. Metadata is persisted here so the ranker does
-- not need to call the GitHub API per request.
CREATE TABLE IF NOT EXISTS curated_repositories (
  id               SERIAL PRIMARY KEY,
  github_repo_id   BIGINT,
  owner            VARCHAR(200) NOT NULL,
  name             VARCHAR(200) NOT NULL,
  full_name        VARCHAR(420) NOT NULL,
  enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
  priority         INTEGER      NOT NULL DEFAULT 100,
  html_url         VARCHAR(512),
  description      TEXT,
  primary_language VARCHAR(100),
  languages        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  topics           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  stars            INTEGER      NOT NULL DEFAULT 0,
  forks            INTEGER      NOT NULL DEFAULT 0,
  open_issues_count INTEGER     NOT NULL DEFAULT 0,
  default_branch   VARCHAR(100),
  last_pushed_at   TIMESTAMP,
  last_synced_at   TIMESTAMP,
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_curated_repo_id UNIQUE (github_repo_id),
  CONSTRAINT uq_curated_repo_full_name UNIQUE (full_name)
);

CREATE INDEX IF NOT EXISTS idx_curated_repos_enabled ON curated_repositories(enabled);
CREATE INDEX IF NOT EXISTS idx_curated_repos_language ON curated_repositories(primary_language);

-- GitHub issues (Phase 2: issue corpus) ------------------------------------
-- Actual issues only: PRs are filtered at ingestion time and by is_pull_request.
-- UNIQUE (repository_id, issue_number) is the deterministic GitHub issue identity.
CREATE TABLE IF NOT EXISTS github_issues (
  id               SERIAL PRIMARY KEY,
  github_issue_id  BIGINT NOT NULL,
  repository_id    INTEGER NOT NULL REFERENCES curated_repositories(id) ON DELETE CASCADE,
  issue_number     INTEGER NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  state            VARCHAR(20) NOT NULL DEFAULT 'open',
  html_url         VARCHAR(1024),
  author_login     VARCHAR(255),
  labels           JSONB NOT NULL DEFAULT '[]'::jsonb,
  repo_topics      JSONB NOT NULL DEFAULT '[]'::jsonb,
  repo_language    VARCHAR(100),
  comments_count   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP,
  updated_at       TIMESTAMP,
  closed_at        TIMESTAMP,
  is_pull_request  BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at       TIMESTAMP,
  last_seen_at     TIMESTAMP,
  created_at_db    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at_db    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_issue UNIQUE (repository_id, issue_number),
  CONSTRAINT uq_github_issue_id UNIQUE (github_issue_id)
);

CREATE INDEX IF NOT EXISTS idx_github_issues_repo ON github_issues(repository_id);
CREATE INDEX IF NOT EXISTS idx_github_issues_state ON github_issues(state);
CREATE INDEX IF NOT EXISTS idx_github_issues_pr ON github_issues(is_pull_request);
CREATE INDEX IF NOT EXISTS idx_github_issues_updated ON github_issues(updated_at);
CREATE INDEX IF NOT EXISTS idx_github_issues_seen ON github_issues(last_seen_at);

-- Seed the curated repository list (Phase 2 default corpus). New repositories
-- can be added here or via the sync endpoints without touching ranking code.
INSERT INTO curated_repositories (github_repo_id, owner, name, full_name, enabled, priority)
VALUES
  (NULL, 'facebook', 'react', 'facebook/react', TRUE, 100),
  (NULL, 'django', 'django', 'django/django', TRUE, 100),
  (NULL, 'pallets', 'flask', 'pallets/flask', TRUE, 100),
  (NULL, 'tiangolo', 'fastapi', 'tiangolo/fastapi', TRUE, 100),
  (NULL, 'vercel', 'next.js', 'vercel/next.js', TRUE, 100),
  (NULL, 'nodejs', 'node', 'nodejs/node', TRUE, 100),
  (NULL, 'redis', 'redis', 'redis/redis', TRUE, 100),
  (NULL, 'psf', 'requests', 'psf/requests', TRUE, 100),
  (NULL, 'golang', 'go', 'golang/go', TRUE, 100),
  (NULL, 'kubernetes', 'kubernetes', 'kubernetes/kubernetes', TRUE, 100),
  (NULL, 'hashicorp', 'terraform', 'hashicorp/terraform', TRUE, 100),
  (NULL, 'microsoft', 'typescript', 'microsoft/typescript', TRUE, 100),
  (NULL, 'rust-lang', 'rust', 'rust-lang/rust', TRUE, 100),
  (NULL, 'grafana', 'grafana', 'grafana/grafana', TRUE, 100),
  (NULL, 'go-gorm', 'gorm', 'go-gorm/gorm', TRUE, 100),
  (NULL, 'nestjs', 'nest', 'nestjs/nest', TRUE, 100),
  (NULL, 'typeorm', 'typeorm', 'typeorm/typeorm', TRUE, 100),
  (NULL, 'prisma', 'prisma', 'prisma/prisma', TRUE, 100),
  (NULL, 'elastic', 'kibana', 'elastic/kibana', TRUE, 100),
  (NULL, 'apache', 'airflow', 'apache/airflow', TRUE, 100),
  (NULL, 'openai', 'openai-python', 'openai/openai-python', TRUE, 100),
  (NULL, 'streamlit', 'streamlit', 'streamlit/streamlit', TRUE, 100),
  (NULL, 'dbt-labs', 'dbt-core', 'dbt-labs/dbt-core', TRUE, 100),
  (NULL, 'pydantic', 'pydantic', 'pydantic/pydantic', TRUE, 100)
ON CONFLICT (full_name) DO NOTHING;
