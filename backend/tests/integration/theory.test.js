/* ── Integration Tests: Theory Submission Routes ───────────── */
import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

/* ── Mock the AI question generator (same as quiz) ──────────── */
vi.mock('../../src/services/questionGenerator.js', () => ({
    generateMCQs: vi.fn().mockResolvedValue([
        { question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { question: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
        { question: 'Q3', options: ['A', 'B', 'C', 'D'], correctAnswer: 2 },
        { question: 'Q4', options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
        { question: 'Q5', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { question: 'Q6', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
    ]),
    generateTheoryQuestions: vi.fn().mockResolvedValue([
        'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7',
    ]),
}));

import { createApp, generateToken, createFakePdfBuffer } from '../helpers.js';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';
import QuizAttempt from '../../src/models/QuizAttempt.js';
import TheorySubmission from '../../src/models/TheorySubmission.js';

const app = createApp();
const oid = () => new mongoose.Types.ObjectId();

/* ── Seed: user + course + task + passed quiz attempt ───────── */
async function seedTheory() {
    const user = await User.create({
        name: 'Theory Student', email: `theory${Date.now()}@iitj.ac.in`,
        passwordHash: 'password123', tokenBalance: 100,
    });
    const course = await Course.create({
        courseCode: `TH${Date.now() % 10000}`, title: 'Theory Course', durationType: 'full',
    });
    const ann = await Announcement.create({
        course: course._id, eventType: 'midterm', title: 'Mid',
        topics: ['Trees'], eventDate: new Date(Date.now() + 15 * 864e5),
        createdBy: oid(),
    });
    const task = await Task.create({
        title: 'Theory Task', description: 'D', topic: 'Trees', type: 'reading',
        difficulty: 'medium', tokenStake: 10, reward: 10, durationHours: 2,
        deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
        passNumber: 1, isRevision: false, source: 'announcement',
        course: course._id, announcement: ann._id,
    });

    const token = generateToken(user._id, 'student');

    // Run through quiz flow: start → answer all correctly → get result
    await request(app).post(`/api/quiz/${task._id}/start`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: user._id.toString() });
    const answers = [0, 1, 2, 3, 0, 1];
    for (let i = 0; i < 6; i++) {
        await request(app).post(`/api/quiz/${task._id}/answer`)
            .set('Authorization', `Bearer ${token}`)
            .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: answers[i] });
    }
    await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`)
        .set('Authorization', `Bearer ${token}`);
    // Get theory questions (creates them on the attempt)
    await request(app).get(`/api/quiz/${task._id}/theory?userId=${user._id}`)
        .set('Authorization', `Bearer ${token}`);

    const attempt = await QuizAttempt.findOne({ user: user._id, task: task._id });

    return { user, course, task, attempt, token };
}

describe('Theory Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       POST /api/theory/:taskId/submit
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/theory/:taskId/submit', () => {
        it('creates a TheorySubmission document', async () => {
            const { task, user, token } = await seedTheory();

            const res = await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('submissionId');
            expect(res.body.data.gradingStatus).toBe('pending');

            // Check the submission in DB
            const sub = await TheorySubmission.findById(res.body.data.submissionId);
            expect(sub).not.toBeNull();
            expect(sub.student.toString()).toBe(user._id.toString());
        });

        it('updates QuizAttempt status to submitted', async () => {
            const { task, user, token } = await seedTheory();

            await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            const attempt = await QuizAttempt.findOne({ user: user._id, task: task._id });
            expect(attempt.status).toBe('submitted');
            expect(attempt.theorySubmittedAt).toBeTruthy();
        });

        it('rejects if MCQ not passed', async () => {
            const user = await User.create({
                name: 'Fail Student', email: `fail${Date.now()}@iitj.ac.in`,
                passwordHash: 'password123', tokenBalance: 100,
            });
            const course = await Course.create({
                courseCode: `FL${Date.now() % 10000}`, title: 'Fail Course', durationType: 'full',
            });
            const ann = await Announcement.create({
                course: course._id, eventType: 'quiz', title: 'Q',
                topics: ['X'], eventDate: new Date(Date.now() + 15 * 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'Fail Task', description: 'D', topic: 'X', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 1,
                deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
                passNumber: 1, isRevision: false, source: 'announcement',
                course: course._id, announcement: ann._id,
            });
            const token = generateToken(user._id, 'student');

            // Start quiz but answer all wrong → get result → mcqPassed=false
            await request(app).post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });
            for (let i = 0; i < 6; i++) {
                await request(app).post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: 99 });
            }
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            expect(res.status).toBe(403);
        });

        it('rejects duplicate submission', async () => {
            const { task, token } = await seedTheory();

            await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            const res = await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/already submitted/i);
        });

        it('rejects if no file', async () => {
            const { task, token } = await seedTheory();

            const res = await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/PDF required/i);
        });

        it('requires authentication', async () => {
            const { task } = await seedTheory();
            const res = await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');
            expect(res.status).toBe(401);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/theory/:taskId/submission
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/theory/:taskId/submission', () => {
        it('returns the submission', async () => {
            const { task, user, token } = await seedTheory();
            await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            const res = await request(app)
                .get(`/api/theory/${task._id}/submission`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.student.toString()).toBe(user._id.toString());
        });

        it('returns 404 if no submission', async () => {
            const { task, token } = await seedTheory();
            const res = await request(app)
                .get(`/api/theory/${task._id}/submission`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(404);
        });

        it('requires auth', async () => {
            const { task } = await seedTheory();
            const res = await request(app).get(`/api/theory/${task._id}/submission`);
            expect(res.status).toBe(401);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/theory/my-submissions
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/theory/my-submissions', () => {
        it('lists all submissions for the user', async () => {
            const { task, token } = await seedTheory();
            await request(app)
                .post(`/api/theory/${task._id}/submit`)
                .set('Authorization', `Bearer ${token}`)
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            const res = await request(app)
                .get('/api/theory/my-submissions')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.total).toBe(1);
            expect(res.body.page).toBe(1);
        });

        it('paginates results', async () => {
            const { token } = await seedTheory();
            const res = await request(app)
                .get('/api/theory/my-submissions?page=2&limit=5')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.page).toBe(2);
        });

        it('requires auth', async () => {
            const res = await request(app).get('/api/theory/my-submissions');
            expect(res.status).toBe(401);
        });
    });
});
