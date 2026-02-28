/* ================================================================
   LEADERBOARD — Integration Tests
   ================================================================
   Tests:
   - Overall leaderboard sorted by tokens + reputation
   - Course proficiency leaderboard
   - Pagination
   - 404 for non-existent course
   ================================================================ */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createApp, generateToken } from '../helpers.js';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import CourseProficiency from '../../src/models/CourseProficiency.js';

const app = createApp();

async function createUsers(count) {
    const hash = await bcrypt.hash('password123', 1);
    const users = [];
    for (let i = 0; i < count; i++) {
        users.push(
            await User.create({
                name: `Leader ${i + 1}`,
                email: `leader${i}_${Date.now()}@test.edu`,
                passwordHash: hash,
                tokenBalance: (count - i) * 50, // descending balance
                reputation: (count - i) * 10,
                stats: {
                    tasksCompleted: count - i,
                    quizzesPassed: Math.floor((count - i) / 2),
                    upvotesReceived: i,
                    downvotesLost: i % 2,
                },
            }),
        );
    }
    return users;
}

describe('Leaderboard Routes', () => {
    // ── GET /api/leaderboard/overall ───────────────────────────
    describe('GET /api/leaderboard/overall', () => {
        it('returns users sorted by tokenBalance DESC', async () => {
            const users = await createUsers(5);
            const res = await request(app).get('/api/leaderboard/overall');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(5);
            expect(res.body.total).toBe(5);

            // First place should have the highest balance
            expect(res.body.data[0].rank).toBe(1);
            expect(res.body.data[0].tokenBalance).toBe(250); // 5*50
            expect(res.body.data[0].reputation).toBe(50);    // 5*10
            expect(res.body.data[0].name).toBe('Leader 1');
        });

        it('supports pagination', async () => {
            await createUsers(5);
            const res = await request(app).get('/api/leaderboard/overall?page=2&limit=2');

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(2);
            expect(res.body.page).toBe(2);
            expect(res.body.data[0].rank).toBe(3); // 3rd overall
        });

        it('includes stats in response', async () => {
            await createUsers(1);
            const res = await request(app).get('/api/leaderboard/overall');

            expect(res.body.data[0].stats).toBeDefined();
            expect(res.body.data[0].stats.tasksCompleted).toBeDefined();
            expect(res.body.data[0].stats.upvotesReceived).toBeDefined();
        });
    });

    // ── GET /api/leaderboard/course/:courseId ──────────────────
    describe('GET /api/leaderboard/course/:courseId', () => {
        it('returns students sorted by proficiency within a course', async () => {
            const hash = await bcrypt.hash('pass', 1);
            const u1 = await User.create({
                name: 'Top Student', email: `t1_${Date.now()}@t.edu`, passwordHash: hash,
                tokenBalance: 100, reputation: 50,
            });
            const u2 = await User.create({
                name: 'Mid Student', email: `t2_${Date.now()}@t.edu`, passwordHash: hash,
                tokenBalance: 80, reputation: 30,
            });
            const u3 = await User.create({
                name: 'Low Student', email: `t3_${Date.now()}@t.edu`, passwordHash: hash,
                tokenBalance: 60, reputation: 10,
            });
            const course = await Course.create({
                courseCode: `LB${Date.now().toString().slice(-4)}`,
                title: 'Leaderboard Course',
                durationType: 'full',
            });

            await CourseProficiency.create({
                user: u1._id, course: course._id,
                upvotesReceived: 10, downvotesLost: 0, downvotesDefended: 2,
                tasksCompleted: 5, quizzesPassed: 4, quizzesFailed: 1,
                proficiencyScore: 135, // 10*10 + 2*5 + 5*3 - 1*2 + 4*5
            });
            await CourseProficiency.create({
                user: u2._id, course: course._id,
                upvotesReceived: 3, downvotesLost: 1, downvotesDefended: 0,
                tasksCompleted: 3, quizzesPassed: 2, quizzesFailed: 1,
                proficiencyScore: 32, // 3*10 - 1*15 + 3*3 - 1*2 + 2*5
            });
            await CourseProficiency.create({
                user: u3._id, course: course._id,
                upvotesReceived: 0, downvotesLost: 2, downvotesDefended: 0,
                tasksCompleted: 1, quizzesPassed: 0, quizzesFailed: 2,
                proficiencyScore: 0, // would be negative, clamped to 0
            });

            const res = await request(app).get(`/api/leaderboard/course/${course._id}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.course.title).toBe('Leaderboard Course');
            expect(res.body.count).toBe(3);

            // Sorted by proficiencyScore DESC
            expect(res.body.data[0].rank).toBe(1);
            expect(res.body.data[0].name).toBe('Top Student');
            expect(res.body.data[0].proficiencyScore).toBe(135);
            expect(res.body.data[0].reputation).toBe(50);

            expect(res.body.data[1].name).toBe('Mid Student');
            expect(res.body.data[2].name).toBe('Low Student');

            // Check metrics included
            expect(res.body.data[0].metrics.upvotesReceived).toBe(10);
            expect(res.body.data[0].metrics.downvotesDefended).toBe(2);
        });

        it('returns 404 for non-existent course', async () => {
            const res = await request(app)
                .get(`/api/leaderboard/course/${new mongoose.Types.ObjectId()}`);

            expect(res.status).toBe(404);
        });

        it('supports pagination', async () => {
            const hash = await bcrypt.hash('pass', 1);
            const course = await Course.create({
                courseCode: `LP${Date.now().toString().slice(-4)}`,
                title: 'Paginated Course',
                durationType: 'full',
            });

            for (let i = 0; i < 5; i++) {
                const u = await User.create({
                    name: `P${i}`, email: `p${i}_${Date.now()}@t.edu`, passwordHash: hash,
                });
                await CourseProficiency.create({
                    user: u._id, course: course._id,
                    proficiencyScore: (5 - i) * 10,
                });
            }

            const res = await request(app)
                .get(`/api/leaderboard/course/${course._id}?page=2&limit=2`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(2);
            expect(res.body.page).toBe(2);
            expect(res.body.data[0].rank).toBe(3);
        });

        it('returns empty leaderboard for course with no proficiencies', async () => {
            const course = await Course.create({
                courseCode: `LE${Date.now().toString().slice(-4)}`,
                title: 'Empty Course',
                durationType: 'full',
            });

            const res = await request(app)
                .get(`/api/leaderboard/course/${course._id}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(0);
            expect(res.body.data).toEqual([]);
        });
    });
});
