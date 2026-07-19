-- Blogs application database schema
-- Run in Supabase SQL editor, or locally with:
--   psql "$DATABASE_URL" -f db/schema.sql

-- Users -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255),
  role       VARCHAR(50)  NOT NULL DEFAULT 'user',
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Blogs -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blogs (
  id         SERIAL PRIMARY KEY,
  author     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  content    TEXT NOT NULL,
  category   VARCHAR(100),
  image      VARCHAR(512),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Comments (self-referencing for replies) --------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id                SERIAL PRIMARY KEY,
  blog_id           INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Comment reactions (like / dislike) -------------------------------------
CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('like', 'dislike')),
  PRIMARY KEY (comment_id, user_id)
);

-- Blog reactions (like / dislike) ---------------------------------------
-- The ON CONFLICT (blog_id, user_id) in blogController requires this
-- unique constraint so each user has at most one reaction per blog.
CREATE TABLE IF NOT EXISTS reactions (
  blog_id    INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('like', 'dislike')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blog_id, user_id)
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

-- Seed admin account (password: admin123) -------------------------------
-- Hash generated with bcryptjs rounds=10 for the string "admin123".
INSERT INTO users (name, email, password, role)
VALUES (
  'admin',
  'admin@example.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrqnY8ZRz6q8FfY6nZ1hZ4hQ3Y3Y3Y3',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
