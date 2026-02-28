/* ── Integration Tests: Task Routes ─────────────────────────── */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp, generateToken } from '../helpers.js';
import Task from '../../src/models/Task.js';
import Course from '../../src/models/Course.js';
import Announcement from '../../src/models/Announcement.js';
import User from '../../src/models/User.js';

const app = createApp();
const oid = () => new mongoose.Types.ObjectId();

/* ── Generate a valid auth token for task route access ──────── */
let authToken;
async function getToken() {
    if (authToken) return authToken;
    const user = await User.create({
        name: 'Task Viewer', email: `taskviewer${Date.now()}@iitj.ac.in`,
        passwordHash: 'password123',
    });
    authToken = generateToken(user._id, 'student');
    return authToken;
}
function auth(req) { return getToken().then((t) => req.set('Authorization', `Bearer ${t}`)); }

/* ── Seed helper: create course + announcement + tasks ──────── */
async function seedTasks() {
    const course = await Course.create({
        courseCode: `CS${Date.now() % 10000}`, title: 'Test Course', durationType: 'full',
    });
    const announcement = await Announcement.create({
        course: course._id, eventType: 'midterm', title: 'Mid',
        topics: ['Trees', 'Graphs'], eventDate: new Date(Date.now() + 15 * 864e5),
        createdBy: oid(),
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

    const tasks = await Task.insertMany([
        {
            title: 'Task Today Easy', description: 'D', topic: 'Trees', type: 'reading',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: today,
            passNumber: 1, isRevision: false, source: 'announcement',
            course: course._id, announcement: announcement._id,
        },
        {
            title: 'Task Today Medium', description: 'D', topic: 'Graphs', type: 'coding',
            difficulty: 'medium', tokenStake: 10, reward: 10, durationHours: 3,
            deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: today,
            passNumber: 2, isRevision: true, source: 'announcement',
            course: course._id, announcement: announcement._id,
        },
        {
            title: 'Task Tomorrow Hard', description: 'D', topic: 'Trees', type: 'writing',
            difficulty: 'hard', tokenStake: 20, reward: 20, durationHours: 4,
            deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: tomorrow,
            passNumber: 3, isRevision: true, source: 'announcement',
            course: course._id, announcement: announcement._id,
        },
        {
            title: 'Task Yesterday', description: 'D', topic: 'Graphs', type: 'quiz',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 1,
            deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: yesterday,
            passNumber: 1, isRevision: false, source: 'fallback',
            course: course._id, announcement: announcement._id,
        },
    ]);

    return { course, announcement, tasks, today, tomorrow };
}

describe('Task Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       GET /api/tasks/course/:courseId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/tasks/course/:courseId', () => {
        it('lists all tasks for a course', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}`));
            expect(res.status).toBe(200);
            expect(res.body.count).toBe(4);
        });

        it('filters by difficulty', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}?difficulty=easy`));
            expect(res.body.data.every((t) => t.difficulty === 'easy')).toBe(true);
        });

        it('filters by type', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}?type=coding`));
            expect(res.body.data.every((t) => t.type === 'coding')).toBe(true);
        });

        it('filters by pass number', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}?pass=2`));
            expect(res.body.data.every((t) => t.passNumber === 2)).toBe(true);
        });

        it('filters by revision', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}?revision=true`));
            expect(res.body.data.every((t) => t.isRevision === true)).toBe(true);
        });

        it('filters by date', async () => {
            const { course, today } = await seedTasks();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}?date=${dateStr}`));
            expect(res.body.count).toBe(2); // 2 tasks today
        });

        it('populates course and announcement', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/course/${course._id}`));
            expect(res.body.data[0].course).toHaveProperty('title');
            expect(res.body.data[0].announcement).toHaveProperty('title');
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/tasks/today/:courseId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/tasks/today/:courseId', () => {
        it("returns today's tasks only", async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/today/${course._id}`));
            expect(res.status).toBe(200);
            expect(res.body.count).toBe(2);
            expect(res.body.date).toBeDefined();
        });

        it('returns 0 for course with no tasks today', async () => {
            const c = await Course.create({ courseCode: `EMPTY${Date.now() % 10000}`, title: 'E', durationType: 'full' });
            const res = await auth(request(app).get(`/api/tasks/today/${c._id}`));
            expect(res.body.count).toBe(0);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/tasks/schedule/:courseId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/tasks/schedule/:courseId', () => {
        it('returns grouped schedule', async () => {
            const { course } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/schedule/${course._id}`));
            expect(res.status).toBe(200);
            expect(res.body.totalDays).toBeGreaterThanOrEqual(3); // yesterday, today, tomorrow
            expect(res.body.totalTasks).toBe(4);
            expect(res.body.data[0]).toHaveProperty('date');
            expect(res.body.data[0]).toHaveProperty('dayOfWeek');
            expect(res.body.data[0]).toHaveProperty('tasks');
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/tasks/:taskId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/tasks/:taskId', () => {
        it('returns single task detail', async () => {
            const { tasks } = await seedTasks();
            const res = await auth(request(app).get(`/api/tasks/${tasks[0]._id}`));
            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe('Task Today Easy');
        });

        it('returns 404 for non-existent', async () => {
            const res = await auth(request(app).get('/api/tasks/000000000000000000000000'));
            expect(res.status).toBe(404);
        });
    });
});
