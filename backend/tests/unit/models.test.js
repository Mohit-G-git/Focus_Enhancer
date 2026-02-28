/* ── Unit Tests: Model Validations, Methods & Hooks ────────── */
import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';
import QuizAttempt from '../../src/models/QuizAttempt.js';
import TheorySubmission from '../../src/models/TheorySubmission.js';
import TokenLedger from '../../src/models/TokenLedger.js';
import Conversation from '../../src/models/Conversation.js';

const oid = () => new mongoose.Types.ObjectId();

/* ═══════════════════════════════════════════════════════════════
   USER MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('User Model', () => {
    it('creates a valid user with defaults', async () => {
        const user = await User.create({
            name: 'Alice', email: 'alice@test.edu', passwordHash: 'pass123',
        });
        expect(user.name).toBe('Alice');
        expect(user.email).toBe('alice@test.edu');
        expect(user.tokenBalance).toBe(100);
        expect(user.role).toBe('student');
        expect(user.reputation).toBe(0);
        expect(user.streak.currentDays).toBe(0);
        expect(user.streak.longestStreak).toBe(0);
        expect(user.stats.tasksCompleted).toBe(0);
        expect(user.stats.quizzesTaken).toBe(0);
        expect(user.stats.avgMcqScore).toBe(0);
        expect(user.wellbeing.moodHistory).toHaveLength(0);
    });

    it('requires name', async () => {
        await expect(User.create({ email: 'a@b.com', passwordHash: 'x' }))
            .rejects.toThrow(/Name is required/);
    });

    it('requires email', async () => {
        await expect(User.create({ name: 'A', passwordHash: 'x' }))
            .rejects.toThrow(/Email is required/);
    });

    it('rejects invalid email format', async () => {
        await expect(User.create({ name: 'A', email: 'not-an-email', passwordHash: 'x' }))
            .rejects.toThrow(/valid email/);
    });

    it('lowercases email', async () => {
        const u = await User.create({ name: 'B', email: 'BOB@Test.EDU', passwordHash: 'x' });
        expect(u.email).toBe('bob@test.edu');
    });

    it('enforces unique email', async () => {
        await User.create({ name: 'A', email: 'dup@test.edu', passwordHash: 'x' });
        await expect(User.create({ name: 'B', email: 'dup@test.edu', passwordHash: 'y' }))
            .rejects.toThrow();
    });

    it('validates role enum', async () => {
        await expect(User.create({ name: 'A', email: 'r@t.edu', passwordHash: 'x', role: 'superadmin' }))
            .rejects.toThrow();
    });

    it('validates semester range 1-8', async () => {
        await expect(User.create({ name: 'A', email: 's@t.edu', passwordHash: 'x', semester: 0 }))
            .rejects.toThrow();
        await expect(User.create({ name: 'A', email: 's2@t.edu', passwordHash: 'x', semester: 9 }))
            .rejects.toThrow();
    });

    it('hashes password on create', async () => {
        const user = await User.create({ name: 'H', email: 'hash@t.edu', passwordHash: 'plain123' });
        const full = await User.findById(user._id).select('+passwordHash');
        expect(full.passwordHash).not.toBe('plain123');
        expect(full.passwordHash.startsWith('$2')).toBe(true);
    });

    it('does NOT re-hash password on unrelated save', async () => {
        const user = await User.create({ name: 'H2', email: 'h2@t.edu', passwordHash: 'plain' });
        const full = await User.findById(user._id).select('+passwordHash');
        const hash1 = full.passwordHash;
        full.name = 'Updated';
        await full.save();
        const full2 = await User.findById(user._id).select('+passwordHash');
        expect(full2.passwordHash).toBe(hash1);
    });

    it('comparePassword returns true for correct password', async () => {
        await User.create({ name: 'C', email: 'cmp@t.edu', passwordHash: 'secret99' });
        const user = await User.findOne({ email: 'cmp@t.edu' }).select('+passwordHash');
        expect(await user.comparePassword('secret99')).toBe(true);
    });

    it('comparePassword returns false for wrong password', async () => {
        await User.create({ name: 'C2', email: 'cmp2@t.edu', passwordHash: 'secret99' });
        const user = await User.findOne({ email: 'cmp2@t.edu' }).select('+passwordHash');
        expect(await user.comparePassword('wrong')).toBe(false);
    });

    it('passwordHash is excluded by default', async () => {
        await User.create({ name: 'S', email: 'sel@t.edu', passwordHash: 'x' });
        const user = await User.findOne({ email: 'sel@t.edu' });
        expect(user.passwordHash).toBeUndefined();
    });

    describe('addMoodEntry()', () => {
        it('appends mood to history', async () => {
            const user = await User.create({ name: 'M', email: 'm@t.edu', passwordHash: 'x' });
            user.addMoodEntry('happy');
            user.addMoodEntry('stressed');
            await user.save();
            expect(user.wellbeing.moodHistory).toHaveLength(2);
            expect(user.wellbeing.moodHistory[0].mood).toBe('happy');
            expect(user.wellbeing.moodHistory[1].mood).toBe('stressed');
        });

        it('caps at 30 entries (FIFO)', async () => {
            const user = await User.create({ name: 'M2', email: 'm2@t.edu', passwordHash: 'x' });
            for (let i = 0; i < 35; i++) user.addMoodEntry('neutral');
            await user.save();
            expect(user.wellbeing.moodHistory).toHaveLength(30);
        });
    });

    describe('recordMcqScore()', () => {
        it('calculates running average', async () => {
            const user = await User.create({ name: 'R', email: 'r@t.edu', passwordHash: 'x' });
            user.recordMcqScore(10);
            expect(user.stats.quizzesTaken).toBe(1);
            expect(user.stats.avgMcqScore).toBe(10);
            user.recordMcqScore(6);
            expect(user.stats.quizzesTaken).toBe(2);
            expect(user.stats.avgMcqScore).toBe(8);
        });
    });

    describe('updateStreak()', () => {
        it('starts streak at 1 on first call', async () => {
            const user = await User.create({ name: 'S1', email: 's1@t.edu', passwordHash: 'x' });
            user.updateStreak();
            expect(user.streak.currentDays).toBe(1);
            expect(user.streak.longestStreak).toBe(1);
        });

        it('increments on consecutive days', async () => {
            const user = await User.create({ name: 'S2', email: 's2@t.edu', passwordHash: 'x' });
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            user.streak.currentDays = 3;
            user.streak.lastActiveDate = yesterday;
            user.updateStreak();
            expect(user.streak.currentDays).toBe(4);
        });

        it('resets after a gap of >1 day', async () => {
            const user = await User.create({ name: 'S3', email: 's3@t.edu', passwordHash: 'x' });
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            user.streak.currentDays = 10;
            user.streak.longestStreak = 10;
            user.streak.lastActiveDate = threeDaysAgo;
            user.updateStreak();
            expect(user.streak.currentDays).toBe(1);
            expect(user.streak.longestStreak).toBe(10); // preserved
        });

        it('does NOT double-count same day', async () => {
            const user = await User.create({ name: 'S4', email: 's4@t.edu', passwordHash: 'x' });
            user.updateStreak();
            expect(user.streak.currentDays).toBe(1);
            user.updateStreak(); // same day again
            expect(user.streak.currentDays).toBe(1);
        });

        it('updates longestStreak when current exceeds it', async () => {
            const user = await User.create({ name: 'S5', email: 's5@t.edu', passwordHash: 'x' });
            user.streak.currentDays = 5;
            user.streak.longestStreak = 5;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            user.streak.lastActiveDate = yesterday;
            user.updateStreak();
            expect(user.streak.currentDays).toBe(6);
            expect(user.streak.longestStreak).toBe(6);
        });
    });
});

/* ═══════════════════════════════════════════════════════════════
   COURSE MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('Course Model', () => {
    it('creates a valid course with defaults', async () => {
        const c = await Course.create({
            courseCode: 'CS101', title: 'Intro CS', durationType: 'full',
        });
        expect(c.courseCode).toBe('CS101');
        expect(c.creditWeight).toBe(3);
        expect(c.totalWeeks).toBe(16);
        expect(c.enrolledStudents).toHaveLength(0);
        expect(c.chapters).toHaveLength(0);
        expect(c.currentChapterIndex).toBe(0);
    });

    it('uppercases courseCode', async () => {
        const c = await Course.create({ courseCode: 'cs102', title: 'X', durationType: 'full' });
        expect(c.courseCode).toBe('CS102');
    });

    it('requires courseCode and title', async () => {
        await expect(Course.create({ durationType: 'full' })).rejects.toThrow();
        await expect(Course.create({ courseCode: 'X', durationType: 'full' })).rejects.toThrow();
    });

    it('enforces unique courseCode', async () => {
        await Course.create({ courseCode: 'CS200', title: 'A', durationType: 'full' });
        await expect(Course.create({ courseCode: 'CS200', title: 'B', durationType: 'full' })).rejects.toThrow();
    });

    it('sets totalWeeks to 8 for fractal', async () => {
        const c = await Course.create({ courseCode: 'CS300', title: 'F', durationType: 'fractal' });
        expect(c.totalWeeks).toBe(8);
    });

    it('validates creditWeight 1-6', async () => {
        await expect(Course.create({ courseCode: 'CX1', title: 'X', durationType: 'full', creditWeight: 0 })).rejects.toThrow();
        await expect(Course.create({ courseCode: 'CX2', title: 'X', durationType: 'full', creditWeight: 7 })).rejects.toThrow();
    });

    it('chapterCount virtual returns chapters.length', async () => {
        const c = await Course.create({
            courseCode: 'CS400', title: 'V', durationType: 'full',
            chapters: [{ number: 1, title: 'Ch1' }, { number: 2, title: 'Ch2' }],
        });
        expect(c.chapterCount).toBe(2);
    });

    it('toJSON includes virtuals', async () => {
        const c = await Course.create({ courseCode: 'CS500', title: 'J', durationType: 'full' });
        const json = c.toJSON();
        expect(json).toHaveProperty('chapterCount');
    });
});

/* ═══════════════════════════════════════════════════════════════
   TASK MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('Task Model', () => {
    it('creates a valid task', async () => {
        const cid = oid(), aid = oid();
        const t = await Task.create({
            title: 'T', description: 'D', topic: 'TP', type: 'reading',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(Date.now() + 864e5), scheduledDate: new Date(),
            course: cid, announcement: aid,
        });
        expect(t.source).toBe('announcement');
        expect(t.status).toBe('pending');
        expect(t.passNumber).toBe(1);
        expect(t.isRevision).toBe(false);
    });

    it('validates type enum', async () => {
        await expect(Task.create({
            title: 'T', description: 'D', topic: 'TP', type: 'invalid',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(), scheduledDate: new Date(),
            course: oid(), announcement: oid(),
        })).rejects.toThrow();
    });

    it('validates difficulty enum', async () => {
        await expect(Task.create({
            title: 'T', description: 'D', topic: 'TP', type: 'reading',
            difficulty: 'extreme', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(), scheduledDate: new Date(),
            course: oid(), announcement: oid(),
        })).rejects.toThrow();
    });

    it('validates source enum', async () => {
        await expect(Task.create({
            title: 'T', description: 'D', topic: 'TP', type: 'reading',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(), scheduledDate: new Date(),
            course: oid(), announcement: oid(), source: 'invalid',
        })).rejects.toThrow();
    });

    it('validates status enum', async () => {
        await expect(Task.create({
            title: 'T', description: 'D', topic: 'TP', type: 'reading',
            difficulty: 'easy', tokenStake: 5, reward: 5, durationHours: 2,
            deadline: new Date(), scheduledDate: new Date(),
            course: oid(), announcement: oid(), status: 'done',
        })).rejects.toThrow();
    });

    it('tokenStake minimum is 1', async () => {
        await expect(Task.create({
            title: 'T', description: 'D', topic: 'TP', type: 'reading',
            difficulty: 'easy', tokenStake: 0, reward: 0, durationHours: 2,
            deadline: new Date(), scheduledDate: new Date(),
            course: oid(), announcement: oid(),
        })).rejects.toThrow();
    });
});

/* ═══════════════════════════════════════════════════════════════
   ANNOUNCEMENT MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('Announcement Model', () => {
    it('creates a valid announcement', async () => {
        const a = await Announcement.create({
            course: oid(), eventType: 'midterm', title: 'Mid',
            topics: ['Trees'], eventDate: new Date(), createdBy: oid(),
        });
        expect(a.isActive).toBe(true);
        expect(a.tasksGenerated).toBe(false);
        expect(a.anonymous).toBe(true);
    });

    it('validates eventType enum', async () => {
        await expect(Announcement.create({
            course: oid(), eventType: 'party', title: 'X',
            topics: ['A'], eventDate: new Date(), createdBy: oid(),
        })).rejects.toThrow();
    });

    it('requires at least one topic', async () => {
        await expect(Announcement.create({
            course: oid(), eventType: 'quiz', title: 'X',
            topics: [], eventDate: new Date(), createdBy: oid(),
        })).rejects.toThrow(/At least one topic/);
    });

    it('requires title', async () => {
        await expect(Announcement.create({
            course: oid(), eventType: 'quiz',
            topics: ['A'], eventDate: new Date(), createdBy: oid(),
        })).rejects.toThrow();
    });
});

/* ═══════════════════════════════════════════════════════════════
   QUIZ ATTEMPT MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('QuizAttempt Model', () => {
    const sixMcqs = Array.from({ length: 6 }, (_, i) => ({
        question: `Q${i}?`, options: ['A', 'B', 'C', 'D'], correctAnswer: i % 4,
    }));

    it('creates a valid quiz attempt', async () => {
        const qa = await QuizAttempt.create({
            user: oid(), task: oid(), mcqs: sixMcqs, mcqStartedAt: new Date(),
        });
        expect(qa.status).toBe('mcq_in_progress');
        expect(qa.mcqScore).toBe(0);
        expect(qa.tokenSettled).toBe(false);
    });

    it('requires exactly 6 MCQs', async () => {
        await expect(QuizAttempt.create({
            user: oid(), task: oid(), mcqs: sixMcqs.slice(0, 3), mcqStartedAt: new Date(),
        })).rejects.toThrow(/6 MCQs required/);
    });

    it('requires 4 options per MCQ', async () => {
        const bad = [...sixMcqs];
        bad[0] = { question: 'Q?', options: ['A', 'B'], correctAnswer: 0 };
        await expect(QuizAttempt.create({
            user: oid(), task: oid(), mcqs: bad, mcqStartedAt: new Date(),
        })).rejects.toThrow(/4 options required/);
    });

    it('enforces unique user+task', async () => {
        const uid = oid(), tid = oid();
        await QuizAttempt.create({ user: uid, task: tid, mcqs: sixMcqs, mcqStartedAt: new Date() });
        await expect(QuizAttempt.create({ user: uid, task: tid, mcqs: sixMcqs, mcqStartedAt: new Date() }))
            .rejects.toThrow();
    });
});

/* ═══════════════════════════════════════════════════════════════
   THEORY SUBMISSION MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('TheorySubmission Model', () => {
    it('creates with correct defaults', async () => {
        const ts = await TheorySubmission.create({
            student: oid(), task: oid(), quizAttempt: oid(), course: oid(),
            pdf: { originalName: 'sol.pdf', storedPath: '/uploads/sol.pdf' },
        });
        expect(ts.aiGrading.status).toBe('pending');
        expect(ts.aiGrading.maxScore).toBe(70);
        expect(ts.tokensAwarded).toBe(0);
    });

    it('enforces unique student+task', async () => {
        const sid = oid(), tid = oid();
        const base = { student: sid, task: tid, quizAttempt: oid(), course: oid(), pdf: { originalName: 'a.pdf', storedPath: '/x' } };
        await TheorySubmission.create(base);
        await expect(TheorySubmission.create({ ...base, quizAttempt: oid() })).rejects.toThrow();
    });
});

/* ═══════════════════════════════════════════════════════════════
   TOKEN LEDGER MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('TokenLedger Model', () => {
    it('creates a valid entry', async () => {
        const tl = await TokenLedger.create({
            userId: oid(), type: 'initial', amount: 100, balanceAfter: 100,
        });
        expect(tl.note).toBe('');
    });

    it('validates type enum', async () => {
        await expect(TokenLedger.create({
            userId: oid(), type: 'unknown', amount: 10, balanceAfter: 10,
        })).rejects.toThrow();
    });
});

/* ═══════════════════════════════════════════════════════════════
   CONVERSATION MODEL
   ═══════════════════════════════════════════════════════════════ */
describe('Conversation Model', () => {
    it('creates with defaults', async () => {
        const c = await Conversation.create({ user: oid() });
        expect(c.title).toBe('New Conversation');
        expect(c.category).toBe('general');
        expect(c.mood).toBe(null);
        expect(c.isActive).toBe(true);
        expect(c.messages).toHaveLength(0);
    });

    it('validates category enum', async () => {
        await expect(Conversation.create({ user: oid(), category: 'invalid' })).rejects.toThrow();
    });

    it('validates mood enum', async () => {
        await expect(Conversation.create({ user: oid(), mood: 'ecstatic' })).rejects.toThrow();
    });

    it('accepts null mood', async () => {
        const c = await Conversation.create({ user: oid(), mood: null });
        expect(c.mood).toBe(null);
    });
});
