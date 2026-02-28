/* ── Integration Tests: Announcement Routes ────────────────── */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, makeUser, makeCourse, makeAnnouncement, registerAndLogin, generateToken, makeMockTasks } from '../helpers.js';
import Course from '../../src/models/Course.js';
import User from '../../src/models/User.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';

/* ── Mock the AI task generator so we don't call Gemini ────── */
vi.mock('../../src/services/aiTaskGenerator.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        generateTasks: vi.fn().mockImplementation(async (input) => {
            const { courseId, announcementId } = input;
            return [
                {
                    title: 'AI Generated Task 1', description: 'Study trees', topic: 'Topic A',
                    type: 'reading', difficulty: 'easy', tokenStake: 5, reward: 5,
                    urgencyMultiplier: 1.0, durationHours: 2,
                    deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(),
                    passNumber: 1, isRevision: false, dayIndex: 0, source: 'announcement',
                    course: courseId, announcement: announcementId, aiGenerated: true,
                    generationContext: { courseName: 'Test', creditWeight: 3, eventType: 'midterm', urgency: 'normal' },
                },
                {
                    title: 'AI Generated Task 2', description: 'Practice graphs', topic: 'Topic B',
                    type: 'coding', difficulty: 'medium', tokenStake: 10, reward: 10,
                    urgencyMultiplier: 1.0, durationHours: 3,
                    deadline: new Date(Date.now() + 15 * 864e5), scheduledDate: new Date(Date.now() + 864e5),
                    passNumber: 1, isRevision: false, dayIndex: 1, source: 'announcement',
                    course: courseId, announcement: announcementId, aiGenerated: true,
                    generationContext: { courseName: 'Test', creditWeight: 3, eventType: 'midterm', urgency: 'normal' },
                },
            ];
        }),
    };
});

const app = createApp();

/* ── Helper: create a course + claim CR → return token + course ── */
async function setupCR() {
    const { token, user } = await registerAndLogin(request, app);
    const courseData = makeCourse();
    const c = await request(app).post('/api/courses')
        .set('Authorization', `Bearer ${token}`).send(courseData);

    await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
        .set('Authorization', `Bearer ${token}`);

    // Re-generate token with cr role
    const crUser = await User.findById(user.id);
    const crToken = generateToken(crUser._id, 'cr');
    return { crToken, courseId: c.body.data._id, crUser };
}

describe('Announcement Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       POST /api/announcements
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/announcements', () => {
        it('CR creates announcement and generates tasks', async () => {
            const { crToken, courseId } = await setupCR();
            const data = makeAnnouncement(courseId);
            const res = await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`).send(data);
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.announcement).toBeDefined();
            expect(res.body.data.tasks.length).toBeGreaterThan(0);
        });

        it('updates course.lastAnnouncementDate', async () => {
            const { crToken, courseId } = await setupCR();
            const before = await Course.findById(courseId);
            expect(before.lastAnnouncementDate).toBeNull();

            await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(courseId));

            const after = await Course.findById(courseId);
            expect(after.lastAnnouncementDate).not.toBeNull();
        });

        it('persists tasks in DB', async () => {
            const { crToken, courseId } = await setupCR();
            await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(courseId));
            const tasks = await Task.find({ course: courseId });
            expect(tasks.length).toBeGreaterThan(0);
        });

        it('rejects non-CR user', async () => {
            const { token: stuToken } = await registerAndLogin(request, app);
            const { courseId } = await setupCR();
            const res = await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${stuToken}`)
                .send(makeAnnouncement(courseId));
            expect(res.status).toBe(403);
        });

        it('rejects CR of a different course', async () => {
            const { crToken } = await setupCR();
            // Create another course (no CR claimed)
            const { token: other } = await registerAndLogin(request, app);
            const c2 = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${other}`).send(makeCourse());

            const res = await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(c2.body.data._id));
            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/not the CR/i);
        });

        it('rejects past eventDate', async () => {
            const { crToken, courseId } = await setupCR();
            const res = await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(courseId, { eventDate: '2020-01-01' }));
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/future/i);
        });

        it('validates required fields', async () => {
            const { crToken } = await setupCR();
            const res = await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`).send({});
            expect(res.status).toBe(400);
        });

        it('requires authentication', async () => {
            const res = await request(app).post('/api/announcements')
                .send(makeAnnouncement('000000000000000000000000'));
            expect(res.status).toBe(401);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/announcements/course/:courseId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/announcements/course/:courseId', () => {
        it('lists active announcements', async () => {
            const { crToken, courseId } = await setupCR();
            await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(courseId));
            const res = await request(app).get(`/api/announcements/course/${courseId}`);
            expect(res.status).toBe(200);
            expect(res.body.count).toBeGreaterThanOrEqual(1);
        });

        it('hides createdBy field', async () => {
            const { crToken, courseId } = await setupCR();
            await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(courseId));
            const res = await request(app).get(`/api/announcements/course/${courseId}`);
            for (const a of res.body.data) {
                expect(a.createdBy).toBeUndefined();
            }
        });

        it('filters out inactive announcements', async () => {
            const { crToken, courseId } = await setupCR();
            await request(app).post('/api/announcements')
                .set('Authorization', `Bearer ${crToken}`)
                .send(makeAnnouncement(courseId));
            // Manually deactivate
            await Announcement.updateMany({ course: courseId }, { isActive: false });
            const res = await request(app).get(`/api/announcements/course/${courseId}`);
            expect(res.body.count).toBe(0);
        });

        it('does NOT require auth', async () => {
            const res = await request(app).get('/api/announcements/course/000000000000000000000000');
            expect(res.status).toBe(200);
        });
    });
});
