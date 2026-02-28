/* ── E2E Workflow Tests ─────────────────────────────────────── */
import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

/* ── Mock all AI services ──────────────────────────────────── */
vi.mock('../../src/services/aiTaskGenerator.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        generateTasks: vi.fn().mockImplementation(async ({ courseId, announcementId, eventType, topics }) => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            return topics.flatMap((topic, i) => [{
                title: `E2E Task: ${topic}`,
                description: `Auto-generated for ${topic}`,
                topic,
                type: 'reading',
                difficulty: i % 2 === 0 ? 'easy' : 'medium',
                tokenStake: i % 2 === 0 ? 5 : 10,
                reward: i % 2 === 0 ? 5 : 10,
                urgencyMultiplier: 1.0,
                durationHours: 2,
                deadline: new Date(Date.now() + 15 * 864e5),
                scheduledDate: new Date(today.getTime() + i * 864e5),
                passNumber: 1,
                isRevision: false,
                dayIndex: i,
                source: 'announcement',
                course: courseId,
                announcement: announcementId,
                aiGenerated: true,
                generationContext: { eventType, urgency: 'normal' },
            }]);
        }),
    };
});

vi.mock('../../src/services/questionGenerator.js', () => ({
    generateMCQs: vi.fn().mockResolvedValue([
        { question: 'E2E Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { question: 'E2E Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
        { question: 'E2E Q3', options: ['A', 'B', 'C', 'D'], correctAnswer: 2 },
        { question: 'E2E Q4', options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
        { question: 'E2E Q5', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { question: 'E2E Q6', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
    ]),
    generateTheoryQuestions: vi.fn().mockResolvedValue([
        'E2E T1', 'E2E T2', 'E2E T3', 'E2E T4', 'E2E T5', 'E2E T6', 'E2E T7',
    ]),
}));

vi.mock('../../src/services/geminiClient.js', () => ({
    generateContent: vi.fn().mockResolvedValue('mock content'),
    chatCompletion: vi.fn().mockResolvedValue('E2E mock bot response'),
    parseJSON: vi.fn((raw) => JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim())),
    _resetThrottle: vi.fn(),
}));

import { createApp, createFakePdfBuffer } from '../helpers.js';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';
import TokenLedger from '../../src/models/TokenLedger.js';
import QuizAttempt from '../../src/models/QuizAttempt.js';
import TheorySubmission from '../../src/models/TheorySubmission.js';

const app = createApp();

describe('E2E Workflows', () => {
    /* ═══════════════════════════════════════════════════════════
       WORKFLOW 1: Full CR → Student Journey
       Register CR → Create Course → Claim CR → Create Announcement
       → Verify Tasks → Register Student → Enroll → View Tasks
       → Take Quiz → Submit Theory
       ═══════════════════════════════════════════════════════════ */
    it('CR creates course + announcement → student takes quiz + submits theory', async () => {
        // ── Step 1: CR registers ────────────────────────────
        const crReg = await request(app).post('/api/auth/register').send({
            name: 'CR User', email: 'cr_e2e@test.edu', password: 'password123',
        });
        expect(crReg.status).toBe(201);
        const crToken = crReg.body.data.token;

        // ── Step 2: Create course ───────────────────────────
        const courseRes = await request(app).post('/api/courses')
            .set('Authorization', `Bearer ${crToken}`)
            .send({ courseCode: 'E2E101', title: 'E2E Course', durationType: 'full' });
        expect(courseRes.status).toBe(201);
        const courseId = courseRes.body.data._id;

        // ── Step 3: Claim CR ────────────────────────────────
        const claimRes = await request(app).put(`/api/courses/${courseId}/claim-cr`)
            .set('Authorization', `Bearer ${crToken}`);
        expect(claimRes.status).toBe(200);
        // Claim response returns courseId, not role; verify role via DB
        const crUser = await User.findOne({ email: 'cr_e2e@test.edu' });
        expect(crUser.role).toBe('cr');

        // ── Step 4: Create announcement (generates tasks) ───
        const annRes = await request(app).post('/api/announcements')
            .set('Authorization', `Bearer ${crToken}`)
            .send({
                courseId,
                eventType: 'midterm',
                title: 'E2E Midterm',
                topics: ['Algorithms', 'Data Structures', 'Graphs'],
                eventDate: new Date(Date.now() + 20 * 864e5).toISOString(),
            });
        expect(annRes.status).toBe(201);
        expect(annRes.body.data.announcement.tasksGenerated).toBe(true);
        expect(annRes.body.data.tasks.length).toBeGreaterThanOrEqual(3);

        // ── Step 5: Verify tasks in DB ──────────────────────
        const tasksRes = await request(app).get(`/api/tasks/course/${courseId}`);
        expect(tasksRes.status).toBe(200);
        expect(tasksRes.body.count).toBeGreaterThanOrEqual(3);

        // ── Step 6: Student registers ───────────────────────
        const studentReg = await request(app).post('/api/auth/register').send({
            name: 'Student E2E', email: 'student_e2e@test.edu', password: 'password123',
        });
        expect(studentReg.status).toBe(201);
        const studentToken = studentReg.body.data.token;

        // ── Step 7: Student enrolls ─────────────────────────
        const enrollRes = await request(app).post(`/api/courses/${courseId}/enroll`)
            .set('Authorization', `Bearer ${studentToken}`);
        expect(enrollRes.status).toBe(200);

        // ── Step 8: Student views today's tasks ─────────────
        const todayRes = await request(app).get(`/api/tasks/today/${courseId}`);
        expect(todayRes.status).toBe(200);

        // ── Step 9: Student starts quiz on first task ───────
        const taskId = tasksRes.body.data[0]._id;
        const student = await User.findOne({ email: 'student_e2e@test.edu' });

        const quizStart = await request(app).post(`/api/quiz/${taskId}/start`)
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ userId: student._id.toString() });
        expect(quizStart.status).toBe(201);
        expect(quizStart.body.data.mcqs).toHaveLength(6);

        // ── Step 10: Answer all correctly ───────────────────
        const answers = [0, 1, 2, 3, 0, 1];
        for (let i = 0; i < 6; i++) {
            const ans = await request(app).post(`/api/quiz/${taskId}/answer`)
                .set('Authorization', `Bearer ${studentToken}`)
                .send({ userId: student._id.toString(), questionIndex: i, selectedAnswer: answers[i] });
            expect(ans.status).toBe(200);
        }

        // ── Step 11: Get MCQ result ─────────────────────────
        const result = await request(app)
            .get(`/api/quiz/${taskId}/mcq-result?userId=${student._id}`)
            .set('Authorization', `Bearer ${studentToken}`);
        expect(result.body.data.passed).toBe(true);
        expect(result.body.data.score).toBe(12);

        // ── Step 12: Get theory questions ────────────────────
        const theory = await request(app)
            .get(`/api/quiz/${taskId}/theory?userId=${student._id}`)
            .set('Authorization', `Bearer ${studentToken}`);
        expect(theory.status).toBe(200);
        expect(theory.body.data.questions).toHaveLength(7);

        // ── Step 13: Submit theory via /theory route ────────
        const theorySubmit = await request(app)
            .post(`/api/theory/${taskId}/submit`)
            .set('Authorization', `Bearer ${studentToken}`)
            .attach('solutions', createFakePdfBuffer(), 'e2e_solutions.pdf');
        expect(theorySubmit.status).toBe(201);

        // ── Step 14: Verify final state ─────────────────────
        const finalAttempt = await QuizAttempt.findOne({ user: student._id, task: taskId });
        expect(finalAttempt.status).toBe('submitted');

        const submission = await TheorySubmission.findOne({ student: student._id, task: taskId });
        expect(submission).not.toBeNull();
    }, 60_000);

    /* ═══════════════════════════════════════════════════════════
       WORKFLOW 2: Token Economy — Pass vs Fail
       ═══════════════════════════════════════════════════════════ */
    it('token economy: pass awards tokens, fail forfeits stake', async () => {
        // ── Register with 100 tokens ────────────────────────
        const reg = await request(app).post('/api/auth/register').send({
            name: 'Token Tester', email: 'tokens_e2e@test.edu', password: 'password123',
        });
        const token = reg.body.data.token;
        const userId = reg.body.data.user.id;

        let user = await User.findById(userId);
        expect(user.tokenBalance).toBe(100);

        // ── Create course + 2 tasks with different stakes ───
        const course = await Course.create({
            courseCode: 'TOK101', title: 'Token Course', durationType: 'full',
        });
        const ann = await Announcement.create({
            course: course._id, eventType: 'quiz', title: 'TQ',
            topics: ['X', 'Y'], eventDate: new Date(Date.now() + 15 * 864e5),
            createdBy: new mongoose.Types.ObjectId(),
        });
        const task1 = await Task.create({
            title: 'Win Task', description: 'D', topic: 'X', type: 'reading',
            difficulty: 'easy', tokenStake: 10, reward: 10, durationHours: 1,
            deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
            passNumber: 1, isRevision: false, source: 'announcement', course: course._id, announcement: ann._id,
        });
        const task2 = await Task.create({
            title: 'Lose Task', description: 'D', topic: 'Y', type: 'reading',
            difficulty: 'hard', tokenStake: 20, reward: 20, durationHours: 1,
            deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
            passNumber: 1, isRevision: false, source: 'announcement', course: course._id, announcement: ann._id,
        });

        // ── Quiz 1: PASS (all correct) ─────────────────────
        await request(app).post(`/api/quiz/${task1._id}/start`)
            .set('Authorization', `Bearer ${token}`)
            .send({ userId });
        for (let i = 0; i < 6; i++) {
            await request(app).post(`/api/quiz/${task1._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId, questionIndex: i, selectedAnswer: [0, 1, 2, 3, 0, 1][i] });
        }
        const r1 = await request(app).get(`/api/quiz/${task1._id}/mcq-result?userId=${userId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(r1.body.data.passed).toBe(true);

        user = await User.findById(userId);
        // 100 - 10 (stake) + 10 (return) + 10 (reward) = 110
        expect(user.tokenBalance).toBe(110);

        // ── Quiz 2: FAIL (all wrong) ────────────────────────
        await request(app).post(`/api/quiz/${task2._id}/start`)
            .set('Authorization', `Bearer ${token}`)
            .send({ userId });
        for (let i = 0; i < 6; i++) {
            await request(app).post(`/api/quiz/${task2._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId, questionIndex: i, selectedAnswer: 99 }); // all wrong
        }
        const r2 = await request(app).get(`/api/quiz/${task2._id}/mcq-result?userId=${userId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(r2.body.data.passed).toBe(false);

        user = await User.findById(userId);
        // 110 - 20 (stake forfeited) = 90
        expect(user.tokenBalance).toBe(90);

        // ── Verify ledger has all entries ────────────────────
        const ledger = await TokenLedger.find({ userId }).sort({ createdAt: 1 });
        expect(ledger.length).toBeGreaterThanOrEqual(4); // initial + stake1 + reward + stake2 + penalty
        const types = ledger.map((l) => l.type);
        expect(types).toContain('initial');
        expect(types).toContain('stake');
        expect(types).toContain('reward');
        expect(types).toContain('penalty');
    }, 60_000);

    /* ═══════════════════════════════════════════════════════════
       WORKFLOW 3: Chatbot with Student Context
       ═══════════════════════════════════════════════════════════ */
    it('chatbot uses student context and maintains conversation', async () => {
        const reg = await request(app).post('/api/auth/register').send({
            name: 'Chat E2E', email: 'chat_e2e@test.edu', password: 'password123',
        });
        const token = reg.body.data.token;
        const user = await User.findOne({ email: 'chat_e2e@test.edu' });

        // ── First message → new conversation ────────────────
        const msg1 = await request(app).post('/api/chat/message')
            .send({ userId: user._id.toString(), message: 'I feel stressed about my exams' });
        expect(msg1.status).toBe(200);
        expect(msg1.body.data.conversationId).toBeTruthy();
        expect(msg1.body.data.mood).toBe('stressed');

        const convId = msg1.body.data.conversationId;

        // ── Second message → continue conversation ──────────
        const msg2 = await request(app).post('/api/chat/message')
            .send({ userId: user._id.toString(), message: 'Can you explain binary trees?', conversationId: convId });
        expect(msg2.status).toBe(200);
        expect(msg2.body.data.conversationId).toBe(convId);

        // ── Verify conversation has 4 messages (2 user + 2 bot)
        const conv = await request(app)
            .get(`/api/chat/conversations/${convId}?userId=${user._id}`);
        expect(conv.body.data.messages.length).toBe(4);

        // ── List conversations ──────────────────────────────
        const list = await request(app)
            .get(`/api/chat/conversations?userId=${user._id}`);
        expect(list.body.count).toBe(1);

        // ── Delete conversation ─────────────────────────────
        await request(app)
            .delete(`/api/chat/conversations/${convId}`)
            .send({ userId: user._id.toString() });

        const listAfter = await request(app)
            .get(`/api/chat/conversations?userId=${user._id}`);
        expect(listAfter.body.count).toBe(0);
    }, 30_000);

    /* ═══════════════════════════════════════════════════════════
       WORKFLOW 4: Multi-Student Course Enrollment
       ═══════════════════════════════════════════════════════════ */
    it('multiple students enroll and see the same tasks', async () => {
        // Create CR + course + announcement
        const cr = await request(app).post('/api/auth/register').send({
            name: 'Multi CR', email: 'multi_cr@test.edu', password: 'password123',
        });
        const crToken = cr.body.data.token;

        const course = await request(app).post('/api/courses')
            .set('Authorization', `Bearer ${crToken}`)
            .send({ courseCode: 'MULTI101', title: 'Multi Course', durationType: 'full' });
        const courseId = course.body.data._id;

        await request(app).put(`/api/courses/${courseId}/claim-cr`)
            .set('Authorization', `Bearer ${crToken}`);

        await request(app).post('/api/announcements')
            .set('Authorization', `Bearer ${crToken}`)
            .send({
                courseId, eventType: 'quiz', title: 'Quiz 1',
                topics: ['Arrays'], eventDate: new Date(Date.now() + 10 * 864e5).toISOString(),
            });

        // Register 3 students
        const students = [];
        for (let i = 0; i < 3; i++) {
            const s = await request(app).post('/api/auth/register').send({
                name: `Student ${i}`, email: `multi_s${i}@test.edu`, password: 'password123',
            });
            const sToken = s.body.data.token;
            await request(app).post(`/api/courses/${courseId}/enroll`)
                .set('Authorization', `Bearer ${sToken}`);
            students.push(sToken);
        }

        // All students see the same tasks
        const tasks1 = await request(app).get(`/api/tasks/course/${courseId}`);
        expect(tasks1.body.count).toBeGreaterThanOrEqual(1);

        // Verify enrollment count via DB
        const courseDoc = await Course.findById(courseId);
        expect(courseDoc.enrolledStudents.length).toBe(4); // 3 students + CR (auto-enrolled on claim)
    });
});
