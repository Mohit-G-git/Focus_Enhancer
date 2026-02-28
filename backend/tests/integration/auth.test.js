/* ── Integration Tests: Auth Routes ─────────────────────────── */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, makeUser, generateToken, registerAndLogin } from '../helpers.js';
import User from '../../src/models/User.js';
import TokenLedger from '../../src/models/TokenLedger.js';

const app = createApp();

describe('Auth Routes', () => {
    /* ═══════════════════════════════════════════════════════════
       POST /api/auth/register
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/auth/register', () => {
        it('registers a new user successfully', async () => {
            const data = makeUser();
            const res = await request(app).post('/api/auth/register').send(data);
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.token).toBeDefined();
            expect(res.body.data.user.email).toBe(data.email);
            expect(res.body.data.user.role).toBe('student');
            expect(res.body.data.user.tokenBalance).toBe(100);
        });

        it('creates initial TokenLedger entry', async () => {
            const data = makeUser();
            const res = await request(app).post('/api/auth/register').send(data);
            const ledger = await TokenLedger.findOne({ userId: res.body.data.user.id });
            expect(ledger).not.toBeNull();
            expect(ledger.type).toBe('initial');
            expect(ledger.amount).toBe(100);
        });

        it('accepts optional metadata fields', async () => {
            const data = makeUser({
                studentId: 'STU001', department: 'CS', semester: 4,
                year: 2026, university: 'MIT',
            });
            const res = await request(app).post('/api/auth/register').send(data);
            expect(res.status).toBe(201);
            expect(res.body.data.user.studentId).toBe('STU001');
            expect(res.body.data.user.department).toBe('CS');
        });

        it('rejects duplicate email', async () => {
            const data = makeUser();
            await request(app).post('/api/auth/register').send(data);
            const res = await request(app).post('/api/auth/register').send({ ...makeUser(), email: data.email });
            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/already registered/i);
        });

        it('rejects duplicate studentId', async () => {
            await request(app).post('/api/auth/register').send(makeUser({ studentId: 'DUP001' }));
            const res = await request(app).post('/api/auth/register').send(makeUser({ studentId: 'DUP001' }));
            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/Student ID/i);
        });

        it('validates required fields', async () => {
            const res = await request(app).post('/api/auth/register').send({});
            expect(res.status).toBe(400);
            expect(res.body.errors).toBeDefined();
            const fields = res.body.errors.map((e) => e.field);
            expect(fields).toContain('name');
            expect(fields).toContain('email');
            expect(fields).toContain('password');
        });

        it('validates email format', async () => {
            const res = await request(app).post('/api/auth/register').send(makeUser({ email: 'not-email' }));
            expect(res.status).toBe(400);
            expect(res.body.errors.some((e) => e.field === 'email')).toBe(true);
        });

        it('validates password min length', async () => {
            const res = await request(app).post('/api/auth/register').send(makeUser({ password: 'abc' }));
            expect(res.status).toBe(400);
            expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
        });

        it('validates semester range', async () => {
            const res = await request(app).post('/api/auth/register').send(makeUser({ semester: 10 }));
            expect(res.status).toBe(400);
        });

        it('does NOT return passwordHash', async () => {
            const res = await request(app).post('/api/auth/register').send(makeUser());
            expect(res.body.data.user.passwordHash).toBeUndefined();
        });
    });

    /* ═══════════════════════════════════════════════════════════
       POST /api/auth/login
       ═══════════════════════════════════════════════════════════ */
    describe('POST /api/auth/login', () => {
        it('logs in with correct credentials', async () => {
            const data = makeUser();
            await request(app).post('/api/auth/register').send(data);
            const res = await request(app).post('/api/auth/login')
                .send({ email: data.email, password: data.password });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.token).toBeDefined();
        });

        it('returns user data with streak and stats', async () => {
            const data = makeUser();
            await request(app).post('/api/auth/register').send(data);
            const res = await request(app).post('/api/auth/login')
                .send({ email: data.email, password: data.password });
            expect(res.body.data.user.streak).toBeDefined();
            expect(res.body.data.user.stats).toBeDefined();
            expect(res.body.data.user.tokenBalance).toBe(100);
        });

        it('updates streak on login', async () => {
            const data = makeUser();
            await request(app).post('/api/auth/register').send(data);
            const res = await request(app).post('/api/auth/login')
                .send({ email: data.email, password: data.password });
            expect(res.body.data.user.streak.currentDays).toBe(1);
        });

        it('rejects wrong password', async () => {
            const data = makeUser();
            await request(app).post('/api/auth/register').send(data);
            const res = await request(app).post('/api/auth/login')
                .send({ email: data.email, password: 'wrongpass' });
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/Invalid credentials/i);
        });

        it('rejects non-existent email', async () => {
            const res = await request(app).post('/api/auth/login')
                .send({ email: 'ghost@test.edu', password: 'anything' });
            expect(res.status).toBe(401);
        });

        it('validates required fields', async () => {
            const res = await request(app).post('/api/auth/login').send({});
            expect(res.status).toBe(400);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       GET /api/auth/me
       ═══════════════════════════════════════════════════════════ */
    describe('GET /api/auth/me', () => {
        it('returns user profile', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.data.name).toBeDefined();
            expect(res.body.data.email).toBeDefined();
        });

        it('rejects no token', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(401);
        });

        it('rejects invalid token', async () => {
            const res = await request(app).get('/api/auth/me')
                .set('Authorization', 'Bearer invalid');
            expect(res.status).toBe(401);
        });
    });

    /* ═══════════════════════════════════════════════════════════
       PUT /api/auth/profile
       ═══════════════════════════════════════════════════════════ */
    describe('PUT /api/auth/profile', () => {
        it('updates allowed fields', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).put('/api/auth/profile')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Updated Name', department: 'EE', semester: 5 });
            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe('Updated Name');
            expect(res.body.data.department).toBe('EE');
            expect(res.body.data.semester).toBe(5);
        });

        it('rejects empty update', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).put('/api/auth/profile')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            expect(res.status).toBe(400);
        });

        it('rejects duplicate studentId', async () => {
            await request(app).post('/api/auth/register')
                .send(makeUser({ studentId: 'TAKEN001' }));
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).put('/api/auth/profile')
                .set('Authorization', `Bearer ${token}`)
                .send({ studentId: 'TAKEN001' });
            expect(res.status).toBe(409);
        });

        it('requires authentication', async () => {
            const res = await request(app).put('/api/auth/profile')
                .send({ name: 'X' });
            expect(res.status).toBe(401);
        });

        it('ignores disallowed fields (role, tokenBalance)', async () => {
            const { token } = await registerAndLogin(request, app);
            const res = await request(app).put('/api/auth/profile')
                .set('Authorization', `Bearer ${token}`)
                .send({ role: 'admin', tokenBalance: 999, name: 'Safe' });
            expect(res.body.data.role).not.toBe('admin');
            expect(res.body.data.tokenBalance).not.toBe(999);
        });
    });
});
