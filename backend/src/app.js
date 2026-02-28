import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import announcementRoutes from './routes/announcements.js';
import quizRoutes from './routes/quiz.js';
import chatRoutes from './routes/chat.js';
import courseRoutes from './routes/courses.js';
import theoryRoutes from './routes/theory.js';
import reviewRoutes from './routes/reviews.js';
import leaderboardRoutes from './routes/leaderboard.js';
import directChatRoutes from './routes/directChat.js';
import userRoutes from './routes/users.js';
import complaintRoutes from './routes/complaints.js';
import { protect } from './middleware/auth.js';
import { startCronJobs } from './services/cronScheduler.js';
import User from './models/User.js';
import Task from './models/Task.js';
import QuizAttempt from './models/QuizAttempt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Ensure upload directory exists ─────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── MongoDB ────────────────────────────────────────────────────
connectDB();

// ── Middleware ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static file serving (uploaded PDFs) ────────────────────────
app.use('/uploads', express.static(uploadsDir));

// ── Health ─────────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
    res.json({ success: true, message: 'Focus Enhancer API v4.2', timestamp: new Date().toISOString() });
});

// ── Public stats (landing page) ────────────────────────────────
app.get('/api/stats', async (_req, res) => {
    try {
        const [users, tasks, quizzes] = await Promise.all([
            User.countDocuments(),
            Task.countDocuments(),
            QuizAttempt.countDocuments(),
        ]);
        res.json({ success: true, data: { users, tasks, quizzes } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/tasks', protect, taskRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/quiz', protect, quizRoutes);
app.use('/api/chat', protect, chatRoutes);
app.use('/api/theory', theoryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/direct-chat', protect, directChatRoutes);
app.use('/api/users', protect, userRoutes);
app.use('/api/complaints', protect, complaintRoutes);

// ── 404 ────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `${req.method} ${req.originalUrl} not found` });
});

// ── Error Handler ──────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('❌', err.stack);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Focus Enhancer API v4.2 on http://localhost:${PORT}`);
    startCronJobs();
});

export default app;
