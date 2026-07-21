# 📝 Blogs – Full Stack Blog Application

A full-stack blog platform built with **React.js**, **Express.js**, **PostgreSQL**, and **JWT authentication**.
Users can sign up, create/manage blogs with image uploads, comment, and admins can manage users and blogs.

---

## 🧩 Tech Stack

| Layer | Technology |
|-------|-------------|
| Frontend | React 19, React Router 7, Axios, Tailwind CSS |
| Backend | Node.js + Express 5 |
| Database | PostgreSQL (Supabase) |
| Auth | JSON Web Token (JWT) — access + refresh tokens in httpOnly cookies, server-side refresh-token revocation |
| File Uploads | Amazon S3 via `multer-s3` |
| Security | Helmet, CORS with credentials, rate-limited auth endpoints |
| OAuth | Google Sign-In (`google-auth-library`) |

---

## 📋 Prerequisites

Install these before starting:

- **Node.js** >= 18 (check with `node -v`)
- **npm** >= 9 (check with `npm -v`)
- **PostgreSQL** >= 14 (check with `psql --version`)

---

## ⚙️ Full Setup Instructions

### 1️⃣ Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Blogs.git
cd Blogs
```

### 2️⃣ Set up PostgreSQL and create the database

Start PostgreSQL, then create a database and user:

```bash
# Linux/macOS (sudo may be required)
sudo -u postgres psql

# Inside the psql prompt:
CREATE DATABASE blogsdb;
CREATE USER bloguser WITH ENCRYPTED PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE blogsdb TO bloguser;
\q
```

> On Windows use `psql -U postgres` and the same SQL commands.

### 3️⃣ Create the `.env` file (backend)

Copy the example file and edit the values:

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and set:

```env
PORT=5000
DATABASE_URL=postgresql://bloguser:password@localhost:5432/blogsdb
JWT_SECRET=some_long_random_string
GOOGLE_CLIENT_ID=your_google_oauth_client_id   # optional, only for Google login
```

- `DATABASE_URL` must match the user/db you created in step 2.
- `JWT_SECRET` can be any long random string (e.g. `openssl rand -hex 32`).
- Leave `GOOGLE_CLIENT_ID` blank if you are not using Google Sign-In.

### 4️⃣ Create the database tables

Tables are **not** created automatically. Run the schema SQL:

```bash
cd backend
psql "$DATABASE_URL" -f db/schema.sql
```

Or, if `$DATABASE_URL` is not exported in your shell:

```bash
psql -U bloguser -h localhost -d blogsdb -f db/schema.sql
```

This creates the `users`, `blogs`, `comments`, and `comment_reactions` tables
and seeds an admin account (`admin@example.com` / `admin123`).

### 5️⃣ Install backend dependencies and start the server

```bash
cd backend
npm install
npm start
```

The backend runs on `http://localhost:5000`.
For auto-restart on changes use `npm run dev` (nodemon).

Verify it is up:

```bash
curl http://localhost:5000/api/health
# {"status":"OK","backend":"running"}
```

### 6️⃣ Set up the frontend

In a new terminal:

```bash
cd frontend
npm install
```

(Optional) Create `frontend/.env` to point the API base at the backend:

```env
REACT_APP_API_BASE_URL=/api
```

The dev server proxies `/api` to `http://localhost:5000` automatically
(`frontend/package.json` → `"proxy": "http://localhost:5000"`).

Start the frontend:

```bash
npm start
```

The React app runs on `http://localhost:3000`.

### 7️⃣ Log in

- Open `http://localhost:3000`
- Register a new account, or log in with the seeded admin:
  - Email: `admin@example.com`
  - Password: `admin123`

---

## 🐘 Connecting to PostgreSQL

The backend connects to PostgreSQL via the `DATABASE_URL` in `backend/.env`.
Format: `postgresql://<user>:<password>@<host>:<port>/<database>`

### Install & start PostgreSQL

**Ubuntu/Debian**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS (Homebrew)**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Windows**
Download and install the PostgreSQL installer from https://www.postgresql.org/download/windows/,
then start the "PostgreSQL" service from Services.

### Create the database and user

```bash
# Linux/macOS (run as the postgres superuser)
sudo -u postgres psql
```
```sql
CREATE DATABASE blogsdb;
CREATE USER bloguser WITH ENCRYPTED PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE blogsdb TO bloguser;
\q
```
> Windows: open `SQL Shell (psql)` and use the same SQL commands.

### Verify the connection

```bash
psql "postgresql://bloguser:password@localhost:5432/blogsdb" -c "\dt"
```
This should list the tables after you run `db/schema.sql` (step 4 above).

### Useful psql commands

| Command | Description |
|---------|-------------|
| `\l` | List databases |
| `\c blogsdb` | Connect to the blogsdb database |
| `\dt` | List tables |
| `\d users` | Show the `users` table structure |
| `SELECT * FROM users;` | View all users |
| `\q` | Quit psql |

### Connection troubleshooting

- **`connection refused`** – PostgreSQL is not running or listening on 5432.
  Check `sudo systemctl status postgresql` (Linux) or the service (Windows/macOS).
- **`password authentication failed`** – the password in `DATABASE_URL`
  does not match the one set with `CREATE USER`.
- **`database "blogsdb" does not exist`** – create it with `CREATE DATABASE blogsdb;`.
- **Special characters in password** (e.g. `@`, `:`, `/`) must be
  percent-encoded in `DATABASE_URL`.

---

## 📁 Project Structure

```
Blogs/
├── backend/        Express API (routes, controllers, models)
│   ├── db/schema.sql   Database schema
│   └── .env.example    Environment template
└── frontend/       React app (src/)
```

---

## 👨‍💻 Author

**MOSALIKANTI SRINIVASA KALYAN**
