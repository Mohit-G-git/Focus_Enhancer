/* ── Integration Tests: Task Supersession & Per-Student Binding ── */
import { vi, describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

/* ── Mock AI generators BEFORE any app import ───────────────── */
vi.mock('../../src/services/aiTaskGenerator.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        generateTasks: vi.fn().mockImplementation(({ courseId, announcementId }) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            return [
                {
                    title: 'New AI Task Today', description: 'D', topic: 'NewTopic',
                    type: 'reading', difficulty: 'medium', tokenStake: 10, reward: 10,
                    urgencyMultiplier: 1.0, durationHours: 2,
                    deadline: new Date(Date.now() + 15 * 864e5),
                    scheduledDate: today, passNumber: 1, isRevision: false, dayIndex: 0,
                    source: 'announcement', course: courseId, announcement: announcementId,
                    aiGenerated: true,
                    generationContext: { courseName: 'Test', creditWeight: 3, eventType: 'midterm', urgency: 'normal' },
                },
                {
                    title: 'New AI Task Tomorrow', description: 'D', topic: 'NewTopic',
                    type: 'coding', difficulty: 'hard', tokenStake: 20, reward: 20,
                    urgencyMultiplier: 1.0, durationHours: 3,
                    deadline: new Date(Date.now() + 15 * 864e5),
                    scheduledDate: tomorrow, passNumber: 1, isRevision: false, dayIndex: 1,
                    source: 'announcement', course: courseId, announcement: announcementId,
                    aiGenerated: true,
                    generationContext: { courseName: 'Test', creditWeight: 3, eventType: 'midterm', urgency: 'normal' },
                },
            ];
        }),
    };
});

vi.mock('../../src/services/questionGenerator.js', () => ({
    generateMCQs: vi.fn().mockResolvedValue([
        { question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { question: 'Q2?', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
        { question: 'Q3?', options: ['A', 'B', 'C', 'D'], correctAnswer: 2 },
        { question: 'Q4?', options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
        { question: 'Q5?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { question: 'Q6?', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
    ]),
    generateTheoryQuestions: vi.fn().mockResolvedValue([
        'Theory Q1', 'Theory Q2', 'Theory Q3', 'Theory Q4',
        'Theory Q5', 'Theory Q6', 'Theory Q7',
    ]),
}));  

import { createApp, generateToken, registerAndLogin, makeCourse, makeAnnouncement } from '../helpers.js';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';
import QuizAttempt from '../../src/models/QuizAttempt.js';
import TokenLedger from '../../src/models/TokenLedger.js';

const app = createApp();
const oid = () => new mongoose.Types.ObjectId();

/* ── Helper: Setup CR + course + old tasks on today/tomorrow ── */
async function setupSupersessionScenario() {
    // Register user via API so passwordHash is set correctly
    const { token, user: userData } = await registerAndLogin(request, app);

    // Create course and claim CR
    const courseData = makeCourse();
    const courseRes = await request(app)
        .post('/api/courses')
        .set('Authorization', `Bearer ${token}`)
        .send(courseData);
    const courseId = courseRes.body.data._id;

    await request(app)
        .put(`/api/courses/${courseId}/claim-cr`)
        .set('Authorization', `Bearer ${token}`);

    // Re-fetch user (now CR)
    const crUser = await User.findById(userData.id);
    const crToken = generateToken(crUser._id, 'cr');

    const course = await Course.findById(courseId);

    // Create old announcement + tasks on today and tomorrow
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const oldAnn = await Announcement.create({
        course: course._id, eventType: 'quiz', title: 'Old Quiz',
        topics: ['Old Topic'], eventDate: new Date(Date.now() + 10 * 864e5),
        createdBy: crUser._id,
    });

    const oldTasks = await Task.insertMany([
        {
            title: 'Old Task Today', description: 'D', topic: 'Old', type: 'reading',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(Date.now() + 10 * 864e5), scheduledDate: today,
            passNumber: 1, isRevision: false, source: 'announcement',
            course: course._id, announcement: oldAnn._id,
        },
        {
            title: 'Old Task Tomorrow', description: 'D', topic: 'Old', type: 'reading',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(Date.now() + 10 * 864e5), scheduledDate: tomorrow,
            passNumber: 1, isRevision: false, source: 'announcement',
            course: course._id, announcement: oldAnn._id,
        },
    ]);

    return { crUser, crToken, course, oldAnn, oldTasks, today, tomorrow };
}

describe('Task Supersession', () => {
    /* ═══════════════════════════════════════════════════════════
       CORE SUPERSESSION: New announcement supersedes old tasks
       ═══════════════════════════════════════════════════════════ */
    describe('Announcement-driven supersession', () => {
        it('supersedes old pending tasks on overlapping dates', async () => {
            const { crToken, course, oldTasks } = await setupSupersessionScenario();

            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(course._id));

            expect(res.status).toBe(201);
            expect(res.body.data.tasks.length).toBeGreaterThan(0);

            // Old tasks should be superseded
            const old1 = await Task.findById(oldTasks[0]._id);
            const old2 = await Task.findById(oldTasks[1]._id);
            expect(old1.status).toBe('superseded');
            expect(old2.status).toBe('superseded');
            expect(old1.supersededBy).toBeTruthy();
            expect(old2.supersededBy).toBeTruthy();
        });

        it('preserves new tasks as pending', async () => {
            const { crToken, course } = await setupSupersessionScenario();

            const res = await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(course._id));

            const newTasks = res.body.data.tasks;
            for (const t of newTasks) {
                const fresh = await Task.findById(t._id);
                expect(fresh.status).toBe('pending');
            }
        });

        it('does NOT supersede tasks on non-overlapping dates', async () => {
            const { crUser, crToken, course, oldAnn } = await setupSupersessionScenario();

            // Create an old task on a date far in the future (not overlapping)
            const farDate = new Date();
            farDate.setDate(farDate.getDate() + 30);
            const farTask = await Task.create({
                title: 'Far Future Task', description: 'D', topic: 'Old', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                deadline: new Date(Date.now() + 40 * 864e5), scheduledDate: farDate,
                passNumber: 1, isRevision: false, source: 'announcement',
                course: course._id, announcement: oldAnn._id,
            });

            await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(course._id));

            const stillPending = await Task.findById(farTask._id);
            expect(stillPending.status).toBe('pending');
        });

        it('protects tasks with active QuizAttempts from supersession', async () => {
            const { crUser, crToken, course, oldTasks } = await setupSupersessionScenario();

            // Create a student with an active quiz on old task[0]
            const student = await User.create({
                name: 'Active Student', email: `active${Date.now()}@test.edu`,
                passwordHash: 'hash123', tokenBalance: 100,
            });

            await QuizAttempt.create({
                user: student._id, task: oldTasks[0]._id,
                course: course._id, status: 'mcq_in_progress',
                mcqs: [
                    { question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
                    { question: 'Q2?', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
                    { question: 'Q3?', options: ['A', 'B', 'C', 'D'], correctAnswer: 2 },
                    { question: 'Q4?', options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
                    { question: 'Q5?', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
                    { question: 'Q6?', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
                ],
                mcqStartedAt: new Date(),
            });

            await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(course._id));

            // old task[0] protected (active quiz), old task[1] superseded
            const protected1 = await Task.findById(oldTasks[0]._id);
            const superseded2 = await Task.findById(oldTasks[1]._id);
            expect(protected1.status).toBe('pending'); // protected!
            expect(superseded2.status).toBe('superseded');
        });

        it('does NOT supersede already completed tasks', async () => {
            const { crToken, course, oldAnn } = await setupSupersessionScenario();

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const completedTask = await Task.create({
                title: 'Completed Task', description: 'D', topic: 'Done', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                deadline: new Date(Date.now() + 10 * 864e5), scheduledDate: today,
                passNumber: 1, isRevision: false, source: 'announcement',
                course: course._id, announcement: oldAnn._id, status: 'completed',
            });

            await request(app)
                .post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(course._id));

            const still = await Task.findById(completedTask._id);
            expect(still.status).toBe('completed');
        });
    });

    /* ═══════════════════════════════════════════════════════════
       QUERY FILTERING: Superseded tasks excluded from listings
       ═══════════════════════════════════════════════════════════ */
    describe('Query-level filtering', () => {
        async function seedWithSuperseded() {
            const course = await Course.create({
                courseCode: `QF${Date.now() % 10000}`, title: 'Query Filter Course', durationType: 'full',
            });
            const ann = await Announcement.create({
                course: course._id, eventType: 'midterm', title: 'Mid',
                topics: ['Trees'], eventDate: new Date(Date.now() + 15 * 864e5),
                createdBy: oid(),
            });

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const student = await User.create({
                name: 'Filter Student', email: `filter${Date.now()}@test.edu`,
                passwordHash: 'hash', tokenBalance: 100,
            });

            await Task.insertMany([
                {
                    title: 'Active Task', description: 'D', topic: 'Trees', type: 'reading',
                    difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                    deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: today,
                    passNumber: 1, isRevision: false, source: 'announcement',
                    course: course._id, announcement: ann._id, status: 'pending',
                },
                {
                    title: 'Superseded Task', description: 'D', topic: 'Old', type: 'reading',
                    difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                    deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: today,
                    passNumber: 1, isRevision: false, source: 'announcement',
                    course: course._id, announcement: ann._id, status: 'superseded',
                    supersededBy: oid(),
                },
                {
                    title: 'Assigned To Student', description: 'D', topic: 'Personal', type: 'quiz',
                    difficulty: 'medium', tokenStake: 10, reward: 10, durationHours: 2,
                    deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: today,
                    passNumber: 2, isRevision: true, source: 'sunday_revision',
                    course: course._id, announcement: ann._id,
                    assignedTo: student._id,
                },
                {
                    title: 'Assigned To Other', description: 'D', topic: 'Personal', type: 'quiz',
                    difficulty: 'medium', tokenStake: 10, reward: 10, durationHours: 2,
                    deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: today,
                    passNumber: 2, isRevision: true, source: 'sunday_revision',
                    course: course._id, announcement: ann._id,
                    assignedTo: oid(), // different student
                },
            ]);

            return { course, student };
        }

        it('GET /api/tasks/course/:id excludes superseded by default', async () => {
            const { course } = await seedWithSuperseded();
            const res = await request(app).get(`/api/tasks/course/${course._id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.every((t) => t.status !== 'superseded')).toBe(true);
            expect(res.body.count).toBe(3); // active + 2 assigned (superseded excluded)
        });

        it('GET /api/tasks/course/:id includes superseded when requested', async () => {
            const { course } = await seedWithSuperseded();
            const res = await request(app).get(`/api/tasks/course/${course._id}?includeSuperseded=true`);
            expect(res.body.count).toBe(4); // all 4
        });

        it('GET /api/tasks/course/:id filters by userId + assignedTo', async () => {
            const { course, student } = await seedWithSuperseded();
            const res = await request(app).get(`/api/tasks/course/${course._id}?userId=${student._id}`);
            // Should see: active (null assignedTo) + assigned to student. NOT: superseded, NOT: assigned to other
            expect(res.body.count).toBe(2);
            expect(res.body.data.some((t) => t.title === 'Active Task')).toBe(true);
            expect(res.body.data.some((t) => t.title === 'Assigned To Student')).toBe(true);
        });

        it('GET /api/tasks/today/:id excludes superseded', async () => {
            const { course } = await seedWithSuperseded();
            const res = await request(app).get(`/api/tasks/today/${course._id}`);
            expect(res.body.data.every((t) => t.status !== 'superseded')).toBe(true);
        });

        it('GET /api/tasks/today/:id filters by userId + assignedTo', async () => {
            const { course, student } = await seedWithSuperseded();
            const res = await request(app).get(`/api/tasks/today/${course._id}?userId=${student._id}`);
            expect(res.body.count).toBe(2);
            const titles = res.body.data.map((t) => t.title);
            expect(titles).toContain('Active Task');
            expect(titles).toContain('Assigned To Student');
            expect(titles).not.toContain('Assigned To Other');
        });

        it('GET /api/tasks/schedule/:id excludes superseded', async () => {
            const { course } = await seedWithSuperseded();
            const res = await request(app).get(`/api/tasks/schedule/${course._id}`);
            const allTasks = res.body.data.flatMap((day) => day.tasks);
            expect(allTasks.every((t) => t.status !== 'superseded')).toBe(true);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       QUIZ PROTECTION: Can't start quiz on superseded task
       ═══════════════════════════════════════════════════════════ */
    describe('Quiz superseded guard', () => {
        it('rejects starting a quiz on a superseded task', async () => {
            const user = await User.create({
                name: 'Quiz Guard', email: `qg${Date.now()}@test.edu`,
                passwordHash: 'hash', tokenBalance: 100,
            });
            const course = await Course.create({
                courseCode: `QG${Date.now() % 10000}`, title: 'QG Course', durationType: 'full',
            });
            const ann = await Announcement.create({
                course: course._id, eventType: 'midterm', title: 'Mid',
                topics: ['T'], eventDate: new Date(Date.now() + 15 * 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'Superseded Quiz Task', description: 'D', topic: 'T', type: 'reading',
                difficulty: 'medium', tokenStake: 10, reward: 10, durationHours: 2,
                deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
                passNumber: 1, isRevision: false, source: 'announcement',
                course: course._id, announcement: ann._id, status: 'superseded',
            });

            const token = generateToken(user._id, 'student');
            const res = await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/superseded/i);
        });

        it('allows starting quiz on non-superseded task', async () => {
            const user = await User.create({
                name: 'Quiz OK', email: `qok${Date.now()}@test.edu`,
                passwordHash: 'hash', tokenBalance: 100,
            });
            const course = await Course.create({
                courseCode: `QOK${Date.now() % 10000}`, title: 'QOK Course', durationType: 'full',
            });
            const ann = await Announcement.create({
                course: course._id, eventType: 'midterm', title: 'Mid',
                topics: ['T'], eventDate: new Date(Date.now() + 15 * 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'Pending Quiz Task', description: 'D', topic: 'T', type: 'reading',
                difficulty: 'medium', tokenStake: 10, reward: 10, durationHours: 2,
                deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
                passNumber: 1, isRevision: false, source: 'announcement',
                course: course._id, announcement: ann._id, status: 'pending',
            });

            const token = generateToken(user._id, 'student');
            const res = await request(app)
                .post(`/api/quiz/${task._id}/start`)
                .set('Authorization', `Bearer ${token}`)
                .send({ userId: user._id.toString() });

            expect(res.status).toBe(201);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       TASK MODEL: New fields validation
       ═══════════════════════════════════════════════════════════ */
    describe('Task model enhancements', () => {
        it('supports superseded status', async () => {
            const ann = await Announcement.create({
                course: oid(), eventType: 'quiz', title: 'A',
                topics: ['T'], eventDate: new Date(Date.now() + 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'T', description: 'D', topic: 'T', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                deadline: new Date(Date.now() + 864e5), scheduledDate: new Date(),
                course: oid(), announcement: ann._id, status: 'superseded',
            });
            expect(task.status).toBe('superseded');
        });

        it('defaults assignedTo to null', async () => {
            const ann = await Announcement.create({
                course: oid(), eventType: 'quiz', title: 'A',
                topics: ['T'], eventDate: new Date(Date.now() + 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'T', description: 'D', topic: 'T', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                deadline: new Date(Date.now() + 864e5), scheduledDate: new Date(),
                course: oid(), announcement: ann._id,
            });
            expect(task.assignedTo).toBeNull();
        });

        it('accepts assignedTo with a valid user ID', async () => {
            const userId = oid();
            const ann = await Announcement.create({
                course: oid(), eventType: 'quiz', title: 'A',
                topics: ['T'], eventDate: new Date(Date.now() + 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'T', description: 'D', topic: 'T', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                deadline: new Date(Date.now() + 864e5), scheduledDate: new Date(),
                course: oid(), announcement: ann._id, assignedTo: userId,
            });
            expect(task.assignedTo.toString()).toBe(userId.toString());
        });

        it('stores supersededBy reference', async () => {
            const annId = oid();
            const ann = await Announcement.create({
                course: oid(), eventType: 'quiz', title: 'A',
                topics: ['T'], eventDate: new Date(Date.now() + 864e5),
                createdBy: oid(),
            });
            const task = await Task.create({
                title: 'T', description: 'D', topic: 'T', type: 'reading',
                difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
                deadline: new Date(Date.now() + 864e5), scheduledDate: new Date(),
                course: oid(), announcement: ann._id,
                status: 'superseded', supersededBy: annId,
            });
            expect(task.supersededBy.toString()).toBe(annId.toString());
        });
    });
});
