process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
import dotenv from "dotenv";
import express from 'express';
import path from 'path';
import cookieParser from "cookie-parser";
import authRoutes from './routes/authRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
// import indexRoutes from './routes/indexRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import { fileURLToPath } from 'url';
import cors from "cors"
// Get the current directory (equivalent to __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Initialize dotenv to use environment variables
dotenv.config();

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "https://blogs-1-4a2q.onrender.com",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", backend: "running" });
});

// Routes
// app.use('/', indexRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/uploads', express.static(path.join(__dirname, 'public', 'uploads')));


// 404 page
app.use((req, res) => {
  res.status(404).send('Page Not Found');
});

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
