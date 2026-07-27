# DevCollab

DevCollab is a full-stack developer collaboration hub. Developers can create a profile, showcase projects, attach GitHub repositories and live demos, request code reviews, star and fork projects, and connect with potential collaborators.

## Stack

- Frontend: React 19, React Router, Axios, Tailwind CSS
- Backend: Node.js, Express 5, JWT access and refresh-token authentication
- Database: PostgreSQL
- Uploads: Amazon S3 via Multer

## Run locally with Docker

From the repository root:

```bash
docker compose up --build
```

The frontend is available at `http://localhost:3000`; the API is at `http://localhost:5000/api`.

## Run without Docker

1. Create a PostgreSQL database and set `DATABASE_URL`, `JWT_SECRET`, and `JWT_SECRET_REFRESH` in `backend/.env`.
2. Initialize or upgrade the database:

```bash
cd backend
psql "$DATABASE_URL" -f db/schema.sql
npm install
npm start
```

3. In another terminal, start the React app:

```bash
cd frontend
npm install
npm start
```

The schema is safe to run against an existing installation: it adds the DevCollab profile columns and creates the project, review, tag, star, fork, and collaboration-request tables without deleting existing data.

## Main API areas

- `/api/auth` — registration, sign-in, profiles, and tokens
- `/api/projects` — project discovery, creation, updates, stars, forks, and collaboration requests
- `/api/reviews` — reviews, ratings, replies, and reactions
- `/api/admin` — user and project moderation
