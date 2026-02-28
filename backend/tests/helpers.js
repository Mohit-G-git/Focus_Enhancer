/* ── Test helpers — factories, app builder, auth token gen ──── */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from '../src/routes/auth.js';
import courseRoutes from '../src/routes/courses.js';
import taskRoutes from '../src/routes/tasks.js';
import announcementRoutes from '../src/routes/announcements.js';
import quizRoutes from '../src/routes/quiz.js';
import chatRoutes from '../src/routes/chat.js';
import theoryRoutes from '../src/routes/theory.js';
import reviewRoutes from '../src/routes/reviews.js';
import leaderboardRoutes from '../src/routes/leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── Express App Factory ───────────────────────────────────── */
export function createApp() {
    const app = express();

    // Ensure uploads dir exists for multer
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use('/uploads', express.static(uploadsDir));

    app.get('/api/health', (_, res) => {
        res.json({ success: true, message: 'Focus Enhancer API v4.0', timestamp: new Date().toISOString() });
    });

    app.use('/api/auth', authRoutes);
    app.use('/api/courses', courseRoutes);
    app.use('/api/tasks', taskRoutes);
    app.use('/api/announcements', announcementRoutes);
    app.use('/api/quiz', quizRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/theory', theoryRoutes);
    app.use('/api/reviews', reviewRoutes);
    app.use('/api/leaderboard', leaderboardRoutes);

    app.use((req, res) => {
        res.status(404).json({ success: false, message: `${req.method} ${req.originalUrl} not found` });
    });

    app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
    });

    return app;
}

/* ── JWT Token Generation ──────────────────────────────────── */
export function generateToken(userId, role = 'student') {
    return jwt.sign(
        { id: userId.toString(), role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' },
    );
}

/* ── Data Factories ────────────────────────────────────────── */
let counter = 0;
function uid() { return ++counter; }

export function makeUser(overrides = {}) {
    const n = uid();
    return {
        name: `Test User ${n}`,
        email: `user${n}@test.edu`,
        password: 'password123',
        role: 'student',
        ...overrides,
    };
}

export function makeCourse(overrides = {}) {
    const n = uid();
    return {
        courseCode: `CS${String(n).padStart(3, '0')}`,
        title: `Test Course ${n}`,
        department: 'Computer Science',
        semester: 4,
        year: 2026,
        durationType: 'full',
        creditWeight: 3,
        ...overrides,
    };
}

export function makeAnnouncement(courseId, overrides = {}) {
    return {
        courseId: courseId.toString(),
        eventType: 'midterm',
        title: 'Test Midterm Exam',
        topics: ['Topic A', 'Topic B', 'Topic C'],
        eventDate: new Date(Date.now() + 15 * 864e5).toISOString(),
        description: 'Test announcement',
        ...overrides,
    };
}

/* ── Mock MCQ Data (6 questions) ───────────────────────────── */
export const MOCK_MCQS = [
    { question: 'What is a binary tree?', options: ['A tree with 2 children max', 'A tree with 2 roots', 'A linked list', 'An array'], correctAnswer: 0 },
    { question: 'What is O(log n)?', options: ['Linear', 'Logarithmic', 'Quadratic', 'Constant'], correctAnswer: 1 },
    { question: 'What is a stack?', options: ['FIFO', 'Random', 'LIFO', 'Priority'], correctAnswer: 2 },
    { question: 'What is recursion?', options: ['Looping', 'Iteration', 'Branching', 'Self-referencing'], correctAnswer: 3 },
    { question: 'What is BFS?', options: ['Breadth-first search', 'Best-first search', 'Binary search', 'Backward search'], correctAnswer: 0 },
    { question: 'What is a hash table?', options: ['Array', 'Key-value store', 'Linked list', 'Queue'], correctAnswer: 1 },
];

/* ── Mock Theory Questions (7 questions) ───────────────────── */
export const MOCK_THEORY = [
    'Derive the time complexity of merge sort.',
    'Prove that a complete binary tree has ⌈n/2⌉ leaves.',
    'Calculate the hash values for the following keys using chaining.',
    'Explain the difference between BFS and DFS with examples.',
    'Compare the performance of quicksort vs heapsort.',
    'Analyze the amortized cost of dynamic array resizing.',
    'Design an algorithm to detect a cycle in a directed graph.',
];

/* ── Mock Task Data (for announcements) ────────────────────── */
export function makeMockTasks(courseId, announcementId, count = 3) {
    const tasks = [];
    const difficulties = ['easy', 'medium', 'hard'];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < count; i++) {
        const diff = difficulties[i % 3];
        const scheduled = new Date(baseDate);
        scheduled.setDate(scheduled.getDate() + i);

        tasks.push({
            title: `Mock Task ${i + 1}`,
            description: `Description for mock task ${i + 1}`,
            topic: `Topic ${String.fromCharCode(65 + (i % 3))}`,
            type: 'reading',
            difficulty: diff,
            tokenStake: diff === 'easy' ? 5 : diff === 'medium' ? 10 : 20,
            reward: diff === 'easy' ? 5 : diff === 'medium' ? 10 : 20,
            urgencyMultiplier: 1.0,
            durationHours: 2,
            deadline: new Date(Date.now() + 15 * 864e5),
            scheduledDate: scheduled,
            passNumber: 1,
            isRevision: false,
            dayIndex: i,
            source: 'announcement',
            course: courseId,
            announcement: announcementId,
            aiGenerated: true,
            generationContext: { courseName: 'Test', creditWeight: 3, eventType: 'midterm', urgency: 'normal' },
        });
    }
    return tasks;
}

/* ── Helpers ───────────────────────────────────────────────── */
export async function registerUser(request, app, userData) {
    const data = makeUser(userData);
    const res = await request(app)
        .post('/api/auth/register')
        .send(data);
    return { res, data };
}

export async function registerAndLogin(request, app, userData) {
    const data = makeUser(userData);
    await request(app).post('/api/auth/register').send(data);
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email: data.email, password: data.password });
    return {
        token: res.body.data?.token,
        user: res.body.data?.user,
        loginData: data,
    };
}

/* ── Create a small fake PDF buffer ────────────────────────── */
export function createFakePdfBuffer() {
    // Minimal PDF structure
    return Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n' +
        'xref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF',
    );
}
