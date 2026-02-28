/* ── Integration Tests: Tolerance System ─────────────────────── */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import { createApp, generateToken, registerAndLogin } from '../helpers.js';
import User from '../../src/models/User.js';
import TokenLedger from '../../src/models/TokenLedger.js';
import {
    computeToleranceCap,
    computeBleed,
    computeToleranceStatus,
    applyTolerancePenalty,
    runToleranceDecay,
} from '../../src/services/toleranceService.js';

const app = createApp();

/* ═══════════════════════════════════════════════════════════════
   PURE FUNCTION TESTS
   ═══════════════════════════════════════════════════════════════ */
describe('computeToleranceCap()', () => {
    it('returns base 2 for streak 0', () => {
        expect(computeToleranceCap(0)).toBe(2);
    });

    it('returns 2 for null/undefined', () => {
        expect(computeToleranceCap(null)).toBe(2);
        expect(computeToleranceCap(undefined)).toBe(2);
    });

    it('returns higher cap for longer streaks (monotonically increasing)', () => {
        let prev = computeToleranceCap(0);
        for (const s of [1, 3, 7, 14, 30, 60, 100]) {
            const cap = computeToleranceCap(s);
            expect(cap).toBeGreaterThanOrEqual(prev);
            prev = cap;
        }
    });

    it('matches expected values for key streak milestones', () => {
        // T(s) = floor(2 + ln(1+s) * 3)
        expect(computeToleranceCap(0)).toBe(2);    // 2 + 0
        expect(computeToleranceCap(3)).toBe(6);    // 2 + ln(4)*3 = 2 + 4.16 = 6
        expect(computeToleranceCap(7)).toBe(8);    // 2 + ln(8)*3 = 2 + 6.24 = 8
        expect(computeToleranceCap(14)).toBe(10);  // 2 + ln(15)*3 = 2 + 8.12 = 10
        expect(computeToleranceCap(30)).toBe(12);  // 2 + ln(31)*3 = 2 + 10.30 = 12
    });

    it('ignores negative streaks', () => {
        expect(computeToleranceCap(-5)).toBe(2);
    });
});

describe('computeBleed()', () => {
    it('returns 0 for daysOver <= 0', () => {
        expect(computeBleed(0)).toBe(0);
        expect(computeBleed(-3)).toBe(0);
    });

    it('returns ceil(2 * d^1.5) for positive days', () => {
        expect(computeBleed(1)).toBe(2);       // ceil(2 * 1)      = 2
        expect(computeBleed(2)).toBe(6);       // ceil(2 * 2.828)  = 6
        expect(computeBleed(3)).toBe(11);      // ceil(2 * 5.196)  = 11
        expect(computeBleed(4)).toBe(16);      // ceil(2 * 8)      = 16
        expect(computeBleed(5)).toBe(23);      // ceil(2 * 11.18)  = 23
    });

    it('accelerates super-linearly', () => {
        const b1 = computeBleed(1);
        const b2 = computeBleed(2);
        const b5 = computeBleed(5);
        // Rate should increase: b5/5 > b2/2 > b1/1
        expect(b5 / 5).toBeGreaterThan(b2 / 2);
        expect(b2 / 2).toBeGreaterThan(b1 / 1);
    });
});

describe('computeToleranceStatus()', () => {
    it('returns full tolerance for user with no lastActiveDate', () => {
        const user = { streak: {}, tolerance: {} };
        const status = computeToleranceStatus(user);
        expect(status.toleranceCap).toBe(2);
        expect(status.toleranceRemaining).toBe(2);
        expect(status.daysAbsent).toBe(0);
        expect(status.currentBleedRate).toBe(0);
    });

    it('returns correct remaining tolerance for recent login', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const user = {
            streak: { lastActiveDate: yesterday, longestStreak: 7 },
            tolerance: { tokensLostToDecay: 0 },
        };
        const status = computeToleranceStatus(user);
        expect(status.toleranceCap).toBe(8);
        expect(status.daysAbsent).toBe(1);
        expect(status.toleranceRemaining).toBe(7);
        expect(status.currentBleedRate).toBe(0);
    });

    it('returns bleed rate when past tolerance', () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        const user = {
            streak: { lastActiveDate: tenDaysAgo, longestStreak: 0 },
            tolerance: { tokensLostToDecay: 0 },
        };
        const status = computeToleranceStatus(user);
        // cap=2, absent=10, daysOver=8
        expect(status.toleranceCap).toBe(2);
        expect(status.daysAbsent).toBe(10);
        expect(status.toleranceRemaining).toBe(0);
        expect(status.currentBleedRate).toBe(computeBleed(8));
        expect(status.currentBleedRate).toBeGreaterThan(0);
    });

    it('includes streakBonus in status', () => {
        const user = {
            streak: { lastActiveDate: new Date(), longestStreak: 14 },
            tolerance: { tokensLostToDecay: 5 },
        };
        const status = computeToleranceStatus(user);
        expect(status.streakBonus).toBe(status.toleranceCap - 2);
        expect(status.totalBled).toBe(5);
    });
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS — applyTolerancePenalty (mutates document)
   ═══════════════════════════════════════════════════════════════ */
describe('applyTolerancePenalty()', () => {
    it('returns 0 if user never logged in', () => {
        const user = {
            streak: { longestStreak: 0 },
            tokenBalance: 100,
            stats: { tokensLost: 0 },
            tolerance: {},
            recalculateReputation: () => {},
        };
        expect(applyTolerancePenalty(user)).toBe(0);
    });

    it('returns 0 if within tolerance cap', () => {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
        const user = {
            streak: { lastActiveDate: twoDaysAgo, longestStreak: 7 },
            tokenBalance: 100,
            stats: { tokensLost: 0 },
            tolerance: {},
            recalculateReputation: () => {},
        };
        expect(applyTolerancePenalty(user)).toBe(0);
        expect(user.tokenBalance).toBe(100);
    });

    it('deducts tokens when past tolerance', () => {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const now = new Date();
        const user = {
            streak: { lastActiveDate: fifteenDaysAgo, longestStreak: 0 },
            tokenBalance: 100,
            stats: { tokensLost: 0 },
            tolerance: {},
            recalculateReputation: () => {},
        };
        // cap=2, absent=15, daysOver=13, bleed=ceil(2*13^1.5)=ceil(93.72)=94
        const bled = applyTolerancePenalty(user, now);
        expect(bled).toBe(computeBleed(13));
        expect(user.tokenBalance).toBe(100 - bled);
        expect(user.stats.tokensLost).toBe(bled);
        expect(user.tolerance.tokensLostToDecay).toBe(bled);
    });

    it('caps bleed at token balance', () => {
        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
        const user = {
            streak: { lastActiveDate: twentyDaysAgo, longestStreak: 0 },
            tokenBalance: 3,
            stats: { tokensLost: 0 },
            tolerance: {},
            recalculateReputation: () => {},
        };
        const bled = applyTolerancePenalty(user);
        expect(bled).toBe(3);  // capped at balance
        expect(user.tokenBalance).toBe(0);
    });

    it('does not double-penalise on the same day', () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const user = {
            streak: { lastActiveDate: tenDaysAgo, longestStreak: 0 },
            tokenBalance: 100,
            stats: { tokensLost: 0 },
            tolerance: { lastPenaltyDate: today },
            recalculateReputation: () => {},
        };
        expect(applyTolerancePenalty(user)).toBe(0);
        expect(user.tokenBalance).toBe(100);
    });

    it('calls recalculateReputation on penalty', () => {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        let repCalled = false;
        const user = {
            streak: { lastActiveDate: fifteenDaysAgo, longestStreak: 0 },
            tokenBalance: 100,
            stats: { tokensLost: 0 },
            tolerance: {},
            recalculateReputation: () => { repCalled = true; },
        };
        applyTolerancePenalty(user);
        expect(repCalled).toBe(true);
    });
});

/* ═══════════════════════════════════════════════════════════════
   INTEGRATION TESTS — DB operations
   ═══════════════════════════════════════════════════════════════ */
describe('Tolerance System — Integration', () => {
    beforeEach(async () => {
        const collections = mongoose.connection.collections;
        for (const key of Object.keys(collections)) {
            await collections[key].deleteMany({});
        }
    });

    describe('runToleranceDecay()', () => {
        it('penalises users who are past tolerance', async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const user = await User.create({
                name: 'Absent Alice', email: 'alice@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 100,
                streak: { currentDays: 0, longestStreak: 3, lastActiveDate: thirtyDaysAgo },
                tolerance: {},
            });

            // cap = floor(2 + ln(4)*3) = 6, absent = 30, daysOver = 24
            const result = await runToleranceDecay();
            expect(result.penalised).toBe(1);
            expect(result.totalBled).toBeGreaterThan(0);

            const updated = await User.findById(user._id);
            expect(updated.tokenBalance).toBeLessThan(100);
            expect(updated.tolerance.tokensLostToDecay).toBeGreaterThan(0);

            // Check ledger entry
            const ledger = await TokenLedger.findOne({ userId: user._id, type: 'tolerance_bleed' });
            expect(ledger).toBeTruthy();
            expect(ledger.amount).toBeLessThan(0);
        });

        it('skips users within tolerance', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            await User.create({
                name: 'Active Bob', email: 'bob@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 100,
                streak: { currentDays: 5, longestStreak: 10, lastActiveDate: yesterday },
            });

            const result = await runToleranceDecay();
            expect(result.penalised).toBe(0);
        });

        it('skips users with zero balance', async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            await User.create({
                name: 'Broke Charlie', email: 'charlie@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 0,
                streak: { currentDays: 0, longestStreak: 0, lastActiveDate: thirtyDaysAgo },
            });

            const result = await runToleranceDecay();
            // User filtered out by tokenBalance > 0 query
            expect(result.penalised).toBe(0);
        });

        it('skips users with no login history', async () => {
            await User.create({
                name: 'Never Logged In', email: 'never@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 100,
            });

            const result = await runToleranceDecay();
            expect(result.penalised).toBe(0);
        });

        it('does not double-penalise on same day', async () => {
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

            const user = await User.create({
                name: 'Double Dana', email: 'dana@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 100,
                streak: { currentDays: 0, longestStreak: 0, lastActiveDate: tenDaysAgo },
            });

            // First run
            const r1 = await runToleranceDecay();
            expect(r1.penalised).toBe(1);
            const balanceAfterFirst = (await User.findById(user._id)).tokenBalance;

            // Second run same day
            const r2 = await runToleranceDecay();
            expect(r2.penalised).toBe(0);
            const balanceAfterSecond = (await User.findById(user._id)).tokenBalance;
            expect(balanceAfterSecond).toBe(balanceAfterFirst);
        });

        it('higher streak gives more tolerance (no penalty)', async () => {
            const eightDaysAgo = new Date();
            eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

            // User A: streak 0, cap 2 → 8 days absent → 6 days over → penalised
            const userA = await User.create({
                name: 'Low Streak', email: 'low@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 100,
                streak: { currentDays: 0, longestStreak: 0, lastActiveDate: eightDaysAgo },
            });

            // User B: streak 14, cap 10 → 8 days absent → within tolerance
            const userB = await User.create({
                name: 'High Streak', email: 'high@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 100,
                streak: { currentDays: 0, longestStreak: 14, lastActiveDate: eightDaysAgo },
            });

            await runToleranceDecay();

            const updA = await User.findById(userA._id);
            const updB = await User.findById(userB._id);
            expect(updA.tokenBalance).toBeLessThan(100);  // penalised
            expect(updB.tokenBalance).toBe(100);           // safe
        });
    });

    describe('GET /api/auth/tolerance', () => {
        it('returns tolerance status for authenticated user', async () => {
            const { token } = await registerAndLogin(request, app);

            const res = await request(app)
                .get('/api/auth/tolerance')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('toleranceCap');
            expect(res.body.data).toHaveProperty('toleranceRemaining');
            expect(res.body.data).toHaveProperty('daysAbsent');
            expect(res.body.data).toHaveProperty('daysUntilBleed');
            expect(res.body.data).toHaveProperty('currentBleedRate');
            expect(res.body.data).toHaveProperty('nextBleedRate');
            expect(res.body.data).toHaveProperty('totalBled');
            expect(res.body.data).toHaveProperty('streakBonus');
        });

        it('returns 401 without auth', async () => {
            const res = await request(app)
                .get('/api/auth/tolerance');

            expect(res.status).toBe(401);
        });
    });

    describe('Login response includes tolerance', () => {
        it('includes tolerance object in login response', async () => {
            const { loginData } = await registerAndLogin(request, app);

            // Login again to check response structure
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: loginData.email, password: loginData.password });

            expect(res.status).toBe(200);
            expect(res.body.data.user.tolerance).toBeTruthy();
            expect(res.body.data.user.tolerance).toHaveProperty('toleranceCap');
            expect(res.body.data.user.tolerance).toHaveProperty('toleranceRemaining');
        });
    });

    describe('Bleed acceleration over consecutive days', () => {
        it('bleeds increasingly more each day', async () => {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 5); // 5 days ago

            const user = await User.create({
                name: 'Bleed Test', email: 'bleed@iitj.ac.in',
                passwordHash: 'password123',
                tokenBalance: 500,
                streak: { currentDays: 0, longestStreak: 0, lastActiveDate: startDate },
            });

            // cap = 2, day 5 → 3 days over → bleed = ceil(2*3^1.5) = 11
            const day5 = new Date();
            const r1 = await runToleranceDecay(day5);
            const b1 = (await User.findById(user._id)).tolerance.tokensLostToDecay;

            // Simulate next day: 6 days absent → 4 days over
            const day6 = new Date(day5);
            day6.setDate(day6.getDate() + 1);
            // Reset lastPenaltyDate to allow penalty
            await User.findByIdAndUpdate(user._id, { 'tolerance.lastPenaltyDate': null });
            const r2 = await runToleranceDecay(day6);
            const b2 = (await User.findById(user._id)).tolerance.tokensLostToDecay;

            expect(b2 - b1).toBeGreaterThan(b1); // second bleed > first
        });
    });
});
