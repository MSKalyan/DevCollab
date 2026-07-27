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

-- Projects ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  github_url  VARCHAR(512),
  live_url    VARCHAR(512),
  image       VARCHAR(512),
  category    VARCHAR(100),
  status      VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP
);

-- Reviews -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_review_id  INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  rating            INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tech tags -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tech_tags (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
);

-- Project tags (many-to-many) -------------------------------------------
CREATE TABLE IF NOT EXISTS project_tags (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tech_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

-- Stars (replaces reactions/likes) --------------------------------------
CREATE TABLE IF NOT EXISTS stars (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- Forks -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forks (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forked_from_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Collaboration requests ------------------------------------------------
CREATE TABLE IF NOT EXISTS collab_requests (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, requester_id)
);

-- Private developer contact requests -------------------------------------
CREATE TABLE IF NOT EXISTS contact_requests (
  id           SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(recipient_id, requester_id)
);

-- Review reactions (like / dislike) -------------------------------------
CREATE TABLE IF NOT EXISTS review_reactions (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      VARCHAR(20) NOT NULL CHECK (type IN ('like', 'dislike')),
  PRIMARY KEY (review_id, user_id)
);

-- Refresh tokens (server-side revocation) ------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(512) NOT NULL UNIQUE,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_stars_project ON stars(project_id);
CREATE INDEX IF NOT EXISTS idx_forks_project ON forks(project_id);
CREATE INDEX IF NOT EXISTS idx_collab_requests_project ON collab_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient ON contact_requests(recipient_id);

-- Seed admin account (password: admin123) -------------------------------
INSERT INTO users (name, email, password, role)
VALUES (
  'admin',
  'admin@example.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrqnY8ZRz6q8FfY6nZ1hZ4hQ3Y3Y3Y3',
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- Seed some common tech tags --------------------------------------------
INSERT INTO tech_tags (name) VALUES
  ('JavaScript'), ('TypeScript'), ('React'), ('Node.js'), ('Python'),
  ('Django'), ('Flask'), ('FastAPI'), ('PostgreSQL'), ('MongoDB'),
  ('Express'), ('Next.js'), ('Vue.js'), ('Angular'), ('Docker'),
  ('Kubernetes'), ('AWS'), ('GCP'), ('Firebase'), ('TailwindCSS'),
  ('GraphQL'), ('REST API'), ('Redis'), ('Go'), ('Rust'),
  ('Java'), ('Spring Boot'), ('C++'), ('Swift'), ('Flutter'),
  ('React Native'), ('MongoDB'), ('MySQL'), ('Prisma'), ('Supabase')
ON CONFLICT (name) DO NOTHING;
