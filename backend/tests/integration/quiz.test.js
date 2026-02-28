/* ── Integration Tests: Quiz Routes ─────────────────────────── */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import { MOCK_MCQS, MOCK_THEORY } from '../helpers.js';

/* ── Mock the AI question generator BEFORE importing app ────── */
vi.mock('../../src/services/questionGenerator.js', () => ({
    generateMCQs: vi.fn().mockResolvedValue([
        { question: 'What is a binary tree?', options: ['A tree with 2 children max', 'A tree with 2 roots', 'A linked list', 'An array'], correctAnswer: 0 },
        { question: 'What is O(log n)?', options: ['Linear', 'Logarithmic', 'Quadratic', 'Constant'], correctAnswer: 1 },
        { question: 'What is a stack?', options: ['FIFO', 'Random', 'LIFO', 'Priority'], correctAnswer: 2 },
        { question: 'What is recursion?', options: ['Looping', 'Iteration', 'Branching', 'Self-referencing'], correctAnswer: 3 },
        { question: 'What is BFS?', options: ['Breadth-first search', 'Best-first search', 'Binary search', 'Backward search'], correctAnswer: 0 },
        { question: 'What is a hash table?', options: ['Array', 'Key-value store', 'Linked list', 'Queue'], correctAnswer: 1 },
    ]),
    generateTheoryQuestions: vi.fn().mockResolvedValue([
        'Derive the time complexity of merge sort.',
        'Prove that a complete binary tree has ⌈n/2⌉ leaves.',
        'Calculate the hash values for the following keys using chaining.',
        'Explain the difference between BFS and DFS with examples.',
        'Compare the performance of quicksort vs heapsort.',
        'Analyze the amortized cost of dynamic array resizing.',
        'Design an algorithm to detect a cycle in a directed graph.',
    ]),
}));

import { createApp, generateToken, createFakePdfBuffer } from '../helpers.js';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';
import QuizAttempt from '../../src/models/QuizAttempt.js';
import TokenLedger from '../../src/models/TokenLedger.js';

const app = createApp();
const oid = () => new mongoose.Types.ObjectId();

/* ── Seed helper: user + course + task ready for quiz ───────── */
async function seedQuiz(tokenBalance = 100, tokenStake = 10) {
    const user = await User.create({
        name: 'Quiz Student', email: `quiz${Date.now()}@test.edu`,
        passwordHash: 'password123', tokenBalance,
    });
    const course = await Course.create({
        courseCode: `QZ${Date.now() % 10000}`, title: 'Quiz Course', durationType: 'full',
    });
    const ann = await Announcement.create({
        course: course._id, eventType: 'midterm', title: 'Mid',
        topics: ['Trees'], eventDate: new Date(Date.now() + 15 * 864e5),
        createdBy: oid(),
    });
    const task = await Task.create({
        title: 'Quiz Task', description: 'D', topic: 'Trees', type: 'reading',
        difficulty: 'medium', tokenStake, reward: tokenStake, durationHours: 2,
        deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
        passNumber: 1, isRevision: false, source: 'announcement',
        course: course._id, announcement: ann._id,
    });

    const token = generateToken(user._id, 'student');
    return { user, course, task, token };
}

describe('Quiz Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       POST /api/quiz/:taskId/start
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/quiz/:taskId/start', () => {
        it('starts quiz, deducts tokens, returns 6 sanitized MCQs', async () => {
            const { task, user, token } = await seedQuiz(100, 10);
            const res = await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(201);
            expect(res.body.data.mcqs).toHaveLength(6);
            // Sanitized: no correctAnswer leaking
            res.body.data.mcqs.forEach((mcq) => {
                expect(mcq).toHaveProperty('question');
                expect(mcq).toHaveProperty('options');
                expect(mcq).not.toHaveProperty('correctAnswer');
                expect(mcq).toHaveProperty('timeLimit', 15);
            });
            expect(res.body.data.tokenStake).toBe(10);
            expect(res.body.data.passThreshold).toBe(8);

            // Verify token deduction
            const updated = await User.findById(user._id);
            expect(updated.tokenBalance).toBe(90);

            // Verify ledger entry
            const ledger = await TokenLedger.findOne({ userId: user._id, type: 'stake' });
            expect(ledger.amount).toBe(-10);
            expect(ledger.balanceAfter).toBe(90);
        });

        it('creates a QuizAttempt document', async () => {
            const { task, user, token } = await seedQuiz();
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            const attempt = await QuizAttempt.findOne({ user: user._id, task: task._id });
            expect(attempt).not.toBeNull();
            expect(attempt.mcqs).toHaveLength(6);
            expect(attempt.status).toBe('mcq_in_progress');
        });

        it('rejects duplicate attempt', async () => {
            const { task, user, token } = await seedQuiz();
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });
            const res = await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/already/i);
        });

        it('rejects insufficient tokens', async () => {
            const { task, user, token } = await seedQuiz(5, 10);
            const res = await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/insufficient/i);
        });

        it('returns 404 for non-existent task', async () => {
            const { user, token } = await seedQuiz();
            const res = await request(app)
                .post('/api/quiz/000000000000000000000000/start')
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(404);
        });

        it('requires userId', async () => {
            const { task } = await seedQuiz();
            const res = await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/userId required/i);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       POST /api/quiz/:taskId/answer
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/quiz/:taskId/answer', () => {
        it('records correct answer (+2 pts)', async () => {
            const { task, user, token } = await seedQuiz();
            // Start quiz
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            // Answer Q0 correctly (correctAnswer is 0)
            const res = await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: 0 });

            expect(res.status).toBe(200);
            expect(res.body.data.points).toBe(2);
            expect(res.body.data.isCorrect).toBe(true);
            expect(res.body.data.remaining).toBe(5);
        });

        it('records wrong answer (-2 pts)', async () => {
            const { task, user, token } = await seedQuiz();
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            // Answer Q0 wrong (correctAnswer is 0, we pick 3)
            const res = await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: 3 });

            expect(res.status).toBe(200);
            expect(res.body.data.points).toBe(-2);
            expect(res.body.data.isCorrect).toBe(false);
        });

        it('records skip/null as unattempted (-1 pt)', async () => {
            const { task, user, token } = await seedQuiz();
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            const res = await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: null });

            expect(res.status).toBe(200);
            expect(res.body.data.points).toBe(-1);
            expect(res.body.data.isCorrect).toBeNull();
        });

        it('rejects duplicate answer for same question', async () => {
            const { task, user, token } = await seedQuiz();
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: 0 });

            const res = await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: 1 });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/already answered/i);
        });

        it('returns 404 for no attempt', async () => {
            const { task, user, token } = await seedQuiz();
            const res = await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: 0 });

            expect(res.status).toBe(404);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/quiz/:taskId/mcq-result
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/quiz/:taskId/mcq-result', () => {
        /** Helper: start quiz + answer all 6 correctly → guaranteed pass (12/12) */
        async function answerAllCorrectly(task, user, token) {
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            // correctAnswers are 0,1,2,3,0,1 matching MOCK_MCQS
            const answers = [0, 1, 2, 3, 0, 1];
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: answers[i] });
            }
        }

        /** Helper: start quiz + answer all 6 wrongly → guaranteed fail */
        async function answerAllWrong(task, user, token) {
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            // All wrong answers (offset by 1 from correct)
            const wrongAnswers = [1, 0, 0, 0, 1, 0];
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: wrongAnswers[i] });
            }
        }

        it('calculates perfect score (12/12) and passes', async () => {
            const { task, user, token } = await seedQuiz(100, 10);
            await answerAllCorrectly(task, user, token);

            const res = await request(app)
                .get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.score).toBe(12);
            expect(res.body.data.maxScore).toBe(12);
            expect(res.body.data.passed).toBe(true);
            expect(res.body.data.threshold).toBe(8);
        });

        it('awards tokens on pass (stake returned + reward)', async () => {
            const { task, user, token } = await seedQuiz(100, 10);
            await answerAllCorrectly(task, user, token);

            await request(app)
                .get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            const updated = await User.findById(user._id);
            // Started with 100, staked 10 (→90), then +10 stake +10 reward = 110
            expect(updated.tokenBalance).toBe(110);
            expect(updated.stats.quizzesPassed).toBe(1);
            expect(updated.stats.tokensEarned).toBe(10);

            const reward = await TokenLedger.findOne({ userId: user._id, type: 'reward' });
            expect(reward).not.toBeNull();
            expect(reward.amount).toBe(20); // stake return + reward
        });

        it('forfeits tokens on fail (all wrong = -12)', async () => {
            const { task, user, token } = await seedQuiz(100, 10);
            await answerAllWrong(task, user, token);

            const res = await request(app)
                .get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.body.data.passed).toBe(false);
            expect(res.body.data.score).toBe(-12);

            const updated = await User.findById(user._id);
            // Started 100, staked 10 → 90, failed → stays 90 (no reward)
            expect(updated.tokenBalance).toBe(90);
            expect(updated.stats.tokensLost).toBe(10);

            const penalty = await TokenLedger.findOne({ userId: user._id, type: 'penalty' });
            expect(penalty).not.toBeNull();
        });

        it('returns breakdown with all 6 questions', async () => {
            const { task, user, token } = await seedQuiz();
            await answerAllCorrectly(task, user, token);

            const res = await request(app)
                .get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.body.data.breakdown).toHaveLength(6);
            res.body.data.breakdown.forEach((b) => {
                expect(b).toHaveProperty('question');
                expect(b).toHaveProperty('yourAnswer');
                expect(b).toHaveProperty('correctAnswer');
                expect(b).toHaveProperty('points');
            });
        });

        it('auto-fills unanswered questions as unattempted', async () => {
            const { task, user, token } = await seedQuiz();
            // Start quiz but only answer 2 questions
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 0, selectedAnswer: 0 });
            await request(app)
                .post(`/api/quiz/${task._id}/answer`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString(), questionIndex: 1, selectedAnswer: 1 });

            const res = await request(app)
                .get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            // 2 correct (+4) + 4 unattempted (-4) = 0
            expect(res.body.data.score).toBe(0);
            expect(res.body.data.passed).toBe(false);
        });

        it('does not double-settle tokens', async () => {
            const { task, user, token } = await seedQuiz(100, 10);
            await answerAllCorrectly(task, user, token);

            // Get result twice
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);

            const updated = await User.findById(user._id);
            expect(updated.tokenBalance).toBe(110); // still 110, not 130
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/quiz/:taskId/theory
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/quiz/:taskId/theory', () => {
        it('returns theory questions after MCQ pass', async () => {
            const { task, user, token } = await seedQuiz();
            // Start + answer all correctly + get result (sets mcqPassed)
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });
            const answers = [0, 1, 2, 3, 0, 1];
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: answers[i] });
            }
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .get(`/api/quiz/${task._id}/theory?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.questions).toHaveLength(7);
            expect(res.body.data.questions[0]).toHaveProperty('number', 1);
            expect(res.body.data.questions[0]).toHaveProperty('question');
        });

        it('rejects if MCQ not passed', async () => {
            const { task, user, token } = await seedQuiz();
            // Start + answer all wrong + get result
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: (MOCK_MCQS[i].correctAnswer + 1) % 4 });
            }
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .get(`/api/quiz/${task._id}/theory?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/MCQ not passed/i);
        });

        it('returns 404 if no attempt', async () => {
            const { task, user, token } = await seedQuiz();
            const res = await request(app)
                .get(`/api/quiz/${task._id}/theory?userId=${user._id}`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(404);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       POST /api/quiz/:taskId/submit-theory  (via quiz routes)
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/quiz/:taskId/submit-theory', () => {
        it('submits theory PDF', async () => {
            const { task, user, token } = await seedQuiz();
            // Full flow: start → answer all → result → get theory → submit
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });
            const answers = [0, 1, 2, 3, 0, 1];
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: answers[i] });
            }
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);
            await request(app).get(`/api/quiz/${task._id}/theory?userId=${user._id}`).set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .post(`/api/quiz/${task._id}/submit-theory`)
                .field('userId', user._id.toString())
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/submitted/i);

            // Quiz attempt updated
            const attempt = await QuizAttempt.findOne({ user: user._id, task: task._id });
            expect(attempt.status).toBe('submitted');
        });

        it('rejects if not in theory_pending state', async () => {
            const { task, user, token } = await seedQuiz();
            // Start quiz but don't pass MCQs
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            const res = await request(app)
                .post(`/api/quiz/${task._id}/submit-theory`)
                .field('userId', user._id.toString())
                .attach('solutions', createFakePdfBuffer(), 'solutions.pdf');

            expect(res.status).toBe(400);
        });

        it('rejects if no PDF attached', async () => {
            const { task, user, token } = await seedQuiz();
            await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });
            const answers = [0, 1, 2, 3, 0, 1];
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post(`/api/quiz/${task._id}/answer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ userId: user._id.toString(), questionIndex: i, selectedAnswer: answers[i] });
            }
            await request(app).get(`/api/quiz/${task._id}/mcq-result?userId=${user._id}`).set('Authorization', `Bearer ${token}`);
            await request(app).get(`/api/quiz/${task._id}/theory?userId=${user._id}`).set('Authorization', `Bearer ${token}`);

            const res = await request(app)
                .post(`/api/quiz/${task._id}/submit-theory`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/PDF required/i);
        });
    });
});
