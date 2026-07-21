process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
import dotenv from "dotenv";
import express from 'express';
import path from 'path';
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import authRoutes from './routes/authRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import { fileURLToPath } from 'url';
import cors from "cors"
// Get the current directory (equivalent to __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Trust the first proxy hop (e.g. Render) so rate limiting and secure cookies
// read the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// Initialize dotenv to use environment variables
dotenv.config();

// Security headers
app.use(helmet());

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "https://blogs-1-4a2q.onrender.com",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Brute-force protection on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", backend: "running" });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentRoutes);


// 404 page
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Page Not Found' });
});

export default app;

// Only start listening when this file is run directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
