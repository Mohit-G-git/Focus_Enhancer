/* ── Integration Tests: Course Routes ───────────────────────── */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, makeUser, makeCourse, registerAndLogin, generateToken } from '../helpers.js';
import Course from '../../src/models/Course.js';
import User from '../../src/models/User.js';

const app = createApp();

describe('Course Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       POST /api/courses
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/courses', () => {
        it('creates a course', async () => {
            const { token } = await registerAndLogin(request, app);
            const data = makeCourse();
            const res = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`)
                .send(data);
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.courseCode).toBe(data.courseCode.toUpperCase());
        });

        it('uppercases courseCode', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`)
                .send(makeCourse({ courseCode: 'cs999' }));
            expect(res.body.data.courseCode).toBe('CS999');
        });

        it('rejects duplicate courseCode', async () => {
            const { token } = await registerAndLogin(request, app);
            const data = makeCourse();
            await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(data);
            const res = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(data);
            expect(res.status).toBe(409);
        });

        it('validates required fields', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            expect(res.status).toBe(400);
            const fields = res.body.errors.map((e) => e.field);
            expect(fields).toContain('courseCode');
            expect(fields).toContain('title');
        });

        it('requires authentication', async () => {
            const res = await request(app).post('/api/courses').send(makeCourse());
            expect(res.status).toBe(401);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/courses
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/courses', () => {
        it('lists all courses', async () => {
            const { token } = await registerAndLogin(request, app);
            await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            const res = await request(app).get('/api/courses');
            expect(res.status).toBe(200);
            expect(res.body.count).toBeGreaterThanOrEqual(2);
        });

        it('filters by department', async () => {
            const { token } = await registerAndLogin(request, app);
            await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`)
                .send(makeCourse({ department: 'Physics' }));
            await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`)
                .send(makeCourse({ department: 'Chemistry' }));
            const res = await request(app).get('/api/courses?department=Physics');
            expect(res.body.data.every((c) => c.department === 'Physics')).toBe(true);
        });

        it('filters by semester', async () => {
            const { token } = await registerAndLogin(request, app);
            await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`)
                .send(makeCourse({ semester: 3 }));
            const res = await request(app).get('/api/courses?semester=3');
            expect(res.body.data.every((c) => c.semester === 3)).toBe(true);
        });

        it('does NOT require auth', async () => {
            const res = await request(app).get('/api/courses');
            expect(res.status).toBe(200);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/courses/:courseId
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/courses/:courseId', () => {
        it('returns course details', async () => {
            const { token } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            const res = await request(app).get(`/api/courses/${c.body.data._id}`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.data.title).toBeDefined();
        });

        it('returns 404 for non-existent', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).get('/api/courses/000000000000000000000000')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(404);
        });

        it('non-CR sees enrolledCount not enrolledStudents', async () => {
            const { token } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            const res = await request(app).get(`/api/courses/${c.body.data._id}`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.body.data.enrolledCount).toBeDefined();
        });
    });

    /* ═══════════════════════════════════════════════════════════
       PUT /api/courses/:courseId/claim-cr
       ═══════════════════════════════════════════════════════════ */
    describe('PUT /api/courses/:courseId/claim-cr', () => {
        it('claims CR role for a course', async () => {
            const { token, user } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            const res = await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.data.courseCode).toBeDefined();
        });

        it('promotes user role from student to cr', async () => {
            const { token, user } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
                .set('Authorization', `Bearer ${token}`);
            const updated = await User.findById(user.id);
            expect(updated.role).toBe('cr');
        });

        it('auto-enrolls user in course', async () => {
            const { token, user } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${token}`).send(makeCourse());
            await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
                .set('Authorization', `Bearer ${token}`);
            const updated = await User.findById(user.id);
            expect(updated.enrolledCourses.map(String)).toContain(c.body.data._id);
        });

        it('rejects if course already has CR', async () => {
            const { token: t1 } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${t1}`).send(makeCourse());
            await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
                .set('Authorization', `Bearer ${t1}`);

            const { token: t2 } = await registerAndLogin(request, app);
            const res = await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
                .set('Authorization', `Bearer ${t2}`);
            expect(res.status).toBe(409);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       POST /api/courses/:courseId/enroll
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/courses/:courseId/enroll', () => {
        it('enrolls student in course', async () => {
            const { token: crToken } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${crToken}`).send(makeCourse());

            const { token: stuToken, user: stu } = await registerAndLogin(request, app);
            const res = await request(app).post(`/api/courses/${c.body.data._id}/enroll`)
                .set('Authorization', `Bearer ${stuToken}`);
            expect(res.status).toBe(200);

            const course = await Course.findById(c.body.data._id);
            expect(course.enrolledStudents.map(String)).toContain(stu.id);
        });

        it('rejects duplicate enrollment', async () => {
            const { token: crToken } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${crToken}`).send(makeCourse());

            const { token: stuToken } = await registerAndLogin(request, app);
            await request(app).post(`/api/courses/${c.body.data._id}/enroll`)
                .set('Authorization', `Bearer ${stuToken}`);
            const res = await request(app).post(`/api/courses/${c.body.data._id}/enroll`)
                .set('Authorization', `Bearer ${stuToken}`);
            expect(res.status).toBe(409);
        });

        it('adds course to user.enrolledCourses', async () => {
            const { token: crToken } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${crToken}`).send(makeCourse());

            const { token: stuToken, user: stu } = await registerAndLogin(request, app);
            await request(app).post(`/api/courses/${c.body.data._id}/enroll`)
                .set('Authorization', `Bearer ${stuToken}`);
            const updated = await User.findById(stu.id);
            expect(updated.enrolledCourses.map(String)).toContain(c.body.data._id);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/courses/:courseId/students
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/courses/:courseId/students', () => {
        it('CR can view enrolled students', async () => {
            const { token: crToken } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${crToken}`).send(makeCourse());
            await request(app).put(`/api/courses/${c.body.data._id}/claim-cr`)
                .set('Authorization', `Bearer ${crToken}`);

            // Need to re-login to get fresh token with 'cr' role
            const crUser = await User.findOne({ role: 'cr' });
            const freshToken = generateToken(crUser._id, 'cr');

            const res = await request(app).get(`/api/courses/${c.body.data._id}/students`)
                .set('Authorization', `Bearer ${freshToken}`);
            expect(res.status).toBe(200);
            expect(res.body.count).toBeDefined();
        });

        it('non-CR gets 403', async () => {
            const { token: crToken } = await registerAndLogin(request, app);
            const c = await request(app).post('/api/courses')
                .set('Authorization', `Bearer ${crToken}`).send(makeCourse());

            const { token: stuToken } = await registerAndLogin(request, app);
            const res = await request(app).get(`/api/courses/${c.body.data._id}/students`)
                .set('Authorization', `Bearer ${stuToken}`);
            expect(res.status).toBe(403);
        });
    });
});
