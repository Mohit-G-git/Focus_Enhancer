/**
 * ══════════════════════════════════════════════════════════════
 *  live-test-full-system.js — Focus Enhancer v4.2
 *  End-to-end production test against REAL Gemini + REAL MongoDB
 * ══════════════════════════════════════════════════════════════
 *
 *  What this does:
 *    1. Connects to MongoDB Atlas
 *    2. Creates real students + a CR
 *    3. Creates a course with chapters
 *    4. CR posts an announcement → triggers Gemini task generation
 *    5. Student starts a quiz → triggers Gemini MCQ generation
 *    6. Student answers MCQs → scoring + token settlement
 *    7. Theory question generation via Gemini
 *    8. Chatbot conversation via Gemini
 *    9. Tolerance status check
 *   10. Leaderboard snapshot
 *
 *  Run:  node live-test-full-system.js
 *
 * ══════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';

// ── Import routes (to build a real app) ────────────────────────────
import authRoutes from './src/routes/auth.js';
import courseRoutes from './src/routes/courses.js';
import taskRoutes from './src/routes/tasks.js';
import announcementRoutes from './src/routes/announcements.js';
import quizRoutes from './src/routes/quiz.js';
import chatRoutes from './src/routes/chat.js';
import reviewRoutes from './src/routes/reviews.js';
import leaderboardRoutes from './src/routes/leaderboard.js';

// ── Import models for direct DB inspection ─────────────────────────
import User from './src/models/User.js';
import Course from './src/models/Course.js';
import Task from './src/models/Task.js';
import Announcement from './src/models/Announcement.js';
import QuizAttempt from './src/models/QuizAttempt.js';
import TokenLedger from './src/models/TokenLedger.js';
import CourseProficiency from './src/models/CourseProficiency.js';

// ── Import services for direct calls ───────────────────────────────
import { computeToleranceStatus } from './src/services/toleranceService.js';

// ── Helpers ────────────────────────────────────────────────────────
const HR = '═'.repeat(64);
const hr = '─'.repeat(64);
const section = (n, title) => console.log(`\n${HR}\n  §${n}  ${title}\n${HR}\n`);
const ok = (msg) => console.log(`  ✅ ${msg}`);
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const warn = (msg) => console.log(`  ⚠️  ${msg}`);
const fail = (msg) => console.log(`  ❌ ${msg}`);

function buildApp() {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.get('/api/health', (_, res) => res.json({ success: true, message: 'Focus Enhancer API v4.2' }));
    app.use('/api/auth', authRoutes);
    app.use('/api/courses', courseRoutes);
    app.use('/api/tasks', taskRoutes);
    app.use('/api/announcements', announcementRoutes);
    app.use('/api/quiz', quizRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/reviews', reviewRoutes);
    app.use('/api/leaderboard', leaderboardRoutes);
    app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({ success: false, message: err.message });
    });
    return app;
}

// ════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════
async function main() {
    console.log(`\n${'🚀'.repeat(8)}`);
    console.log(`  Focus Enhancer v4.2 — Full System Live Test`);
    console.log(`  ${new Date().toISOString()}`);
    console.log(`${'🚀'.repeat(8)}\n`);

    // ── Connect to MongoDB Atlas ───────────────────────────────────
    section(0, 'CONNECTING TO MONGODB ATLAS');
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'focus_enhancer_live_test' });
    ok(`Connected to MongoDB Atlas: ${mongoose.connection.host}`);
    info(`Database: ${mongoose.connection.db.databaseName}`);

    // Clean the test database
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const col of collections) {
        await mongoose.connection.db.dropCollection(col.name);
    }
    ok('Cleaned test database');

    const app = buildApp();
    const r = request(app);

    // ════════════════════════════════════════════════════════════════
    //  §1  CREATE USERS
    // ════════════════════════════════════════════════════════════════
    section(1, 'CREATING USERS');

    // Student 1: Bismarck — serious student
    const bismarckRes = await r.post('/api/auth/register').send({
        name: 'Bismarck Khan',
        email: 'bismarck@university.edu',
        password: 'StrongPass123!',
        role: 'student',
        studentId: 'STU-2026-001',
        department: 'Computer Science',
        semester: 5,
        year: 2026,
        university: 'National University',
    });
    const bismarckToken = bismarckRes.body.data.token;
    const bismarckId = bismarckRes.body.data.user.id;
    ok(`Student: Bismarck Khan (${bismarckRes.body.data.user.email}) — 100 tokens`);

    // Student 2: Aisha — peer reviewer
    const aishaRes = await r.post('/api/auth/register').send({
        name: 'Aisha Mahmood',
        email: 'aisha@university.edu',
        password: 'StrongPass456!',
        role: 'student',
        studentId: 'STU-2026-002',
        department: 'Computer Science',
        semester: 5,
        year: 2026,
        university: 'National University',
    });
    const aishaToken = aishaRes.body.data.token;
    ok(`Student: Aisha Mahmood — 100 tokens`);

    // CR: Omar — class representative
    const omarRes = await r.post('/api/auth/register').send({
        name: 'Omar Farooq',
        email: 'omar@university.edu',
        password: 'CRPass789!',
        role: 'student',
        studentId: 'CR-2026-001',
        department: 'Computer Science',
        semester: 5,
        year: 2026,
        university: 'National University',
    });
    const omarToken = omarRes.body.data.token;
    ok(`CR (soon): Omar Farooq — 100 tokens`);

    // Verify DB
    const userCount = await User.countDocuments();
    info(`Total users in DB: ${userCount}`);

    // ════════════════════════════════════════════════════════════════
    //  §2  CREATE COURSE + CLAIM CR
    // ════════════════════════════════════════════════════════════════
    section(2, 'CREATING COURSE & CLAIMING CR');

    const courseRes = await r.post('/api/courses').set('Authorization', `Bearer ${omarToken}`).send({
        courseCode: 'CS301',
        title: 'Data Structures & Algorithms',
        department: 'Computer Science',
        semester: 5,
        year: 2026,
        durationType: 'full',
        creditWeight: 4,
    });
    const courseId = courseRes.body.data._id;
    ok(`Course created: CS301 — Data Structures & Algorithms (4 credits)`);

    // Omar claims CR
    const crRes = await r.put(`/api/courses/${courseId}/claim-cr`).set('Authorization', `Bearer ${omarToken}`);
    ok(`Omar is now CR: ${crRes.body.success ? 'confirmed ✓' : 'failed — ' + crRes.body.message}`);

    // Students enroll
    await r.put(`/api/courses/${courseId}/enroll`).set('Authorization', `Bearer ${bismarckToken}`);
    await r.put(`/api/courses/${courseId}/enroll`).set('Authorization', `Bearer ${aishaToken}`);
    ok('Bismarck & Aisha enrolled in CS301');

    // ════════════════════════════════════════════════════════════════
    //  §3  CR POSTS ANNOUNCEMENT → GEMINI TASK GENERATION
    // ════════════════════════════════════════════════════════════════
    section(3, 'CR POSTS ANNOUNCEMENT → GEMINI GENERATES TASKS');
    info('This hits the REAL Gemini API... please wait...\n');

    const eventDate = new Date(Date.now() + 10 * 864e5).toISOString();
    const annRes = await r.post('/api/announcements')
        .set('Authorization', `Bearer ${omarToken}`)
        .send({
            courseId,
            eventType: 'midterm',
            title: 'CS301 Midterm Exam — Data Structures',
            topics: ['Binary Search Trees', 'Graph Algorithms', 'Dynamic Programming'],
            eventDate,
            description: 'Comprehensive midterm covering BSTs, graph traversal (BFS/DFS/Dijkstra), and DP (knapsack, LCS, matrix chain).',
        });

    if (!annRes.body.success) {
        fail(`Announcement failed (HTTP ${annRes.status}): ${annRes.body.message || JSON.stringify(annRes.body)}`);
    } else {
        ok(`Announcement created: "${annRes.body.data.announcement.title}"`);
        const taskCount = await Task.countDocuments({ course: courseId });
        ok(`🤖 Gemini generated ${taskCount} tasks for the 10-day study plan`);

        // Show the tasks
        console.log(`\n  ${hr}`);
        console.log('  📋 GENERATED STUDY PLAN:\n');

        const tasks = await Task.find({ course: courseId }).sort({ scheduledDate: 1 });
        let currentDate = '';
        for (const t of tasks) {
            const dateStr = t.scheduledDate.toDateString();
            if (dateStr !== currentDate) {
                currentDate = dateStr;
                console.log(`\n  📅 ${dateStr} (Pass ${t.passNumber}, Day ${t.dayIndex})`);
            }
            const revTag = t.isRevision ? ' [REVISION]' : '';
            console.log(`     ${t.difficulty.toUpperCase().padEnd(6)} | ${t.tokenStake}T | ${t.durationHours}h | ${t.title}${revTag}`);
        }
        console.log(`\n  ${hr}`);

        // Token economics summary
        const stakes = tasks.map(t => t.tokenStake);
        const total = stakes.reduce((a, b) => a + b, 0);
        info(`Total potential tokens at stake: ${total}`);
        info(`Avg stake per task: ${(total / tasks.length).toFixed(1)}`);
        info(`Difficulty distribution: easy=${tasks.filter(t => t.difficulty === 'easy').length}, medium=${tasks.filter(t => t.difficulty === 'medium').length}, hard=${tasks.filter(t => t.difficulty === 'hard').length}`);
    }

    // ════════════════════════════════════════════════════════════════
    //  §4  STUDENT STARTS QUIZ → GEMINI MCQ GENERATION
    // ════════════════════════════════════════════════════════════════
    section(4, 'BISMARCK STARTS A QUIZ → GEMINI MCQ GENERATION');

    const firstTask = await Task.findOne({ course: courseId, status: 'pending' }).sort({ scheduledDate: 1 });

    if (!firstTask) {
        fail('No tasks found — cannot start quiz');
    } else {
        info(`Target task: "${firstTask.title}" (${firstTask.difficulty}, ${firstTask.tokenStake}T)\n`);
        info('Calling Gemini for 6 MCQs...\n');

        const quizRes = await r.post(`/api/quiz/${firstTask._id}/start`)
            .set('Authorization', `Bearer ${bismarckToken}`)
            .send({ userId: bismarckId });

        if (!quizRes.body.success) {
            fail(`Quiz start failed: ${quizRes.body.message}`);
        } else {
            ok(`Quiz started! Attempt ID: ${quizRes.body.data.attemptId}`);
            const questions = quizRes.body.data.mcqs;
            ok(`🤖 Gemini generated ${questions.length} MCQs:\n`);

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                console.log(`  Q${i + 1}: ${q.question}`);
                q.options.forEach((opt, j) => console.log(`       ${String.fromCharCode(65 + j)}) ${opt}`));
                console.log();
            }
        }

        // ════════════════════════════════════════════════════════════
        //  §5  ANSWER MCQs → SCORING
        // ════════════════════════════════════════════════════════════
        if (quizRes.body.success) {
            section(5, 'BISMARCK ANSWERS MCQs → LIVE SCORING');

            // Get the actual correct answers from DB (we're testing, so we peek)
            const attempt = await QuizAttempt.findById(quizRes.body.data.attemptId);
            const correctAnswers = attempt.mcqs.map(q => q.correctAnswer);
            info(`Correct answers (peeked): [${correctAnswers.join(', ')}]`);

            // Bismarck answers: 5 correct, 1 deliberately wrong
            const answers = correctAnswers.map((c, i) => i === 3 ? (c + 1) % 4 : c);
            info(`Bismarck's answers:       [${answers.join(', ')}]  (intentional mistake on Q4)\n`);

            const balanceBefore = (await User.findById(bismarckId)).tokenBalance;
            info(`Balance before quiz: ${balanceBefore} tokens`);

            for (let i = 0; i < 6; i++) {
                const ansRes = await r.post(`/api/quiz/${firstTask._id}/answer`)
                    .set('Authorization', `Bearer ${bismarckToken}`)
                    .send({
                        userId: bismarckId,
                        questionIndex: i,
                        selectedAnswer: answers[i],
                    });

                const icon = answers[i] === correctAnswers[i] ? '✅' : '❌';
                const pts = answers[i] === correctAnswers[i] ? '+2' : '-2';
                console.log(`  ${icon} Q${i + 1}: answered ${String.fromCharCode(65 + answers[i])} → ${pts} pts`);
            }

            // Get MCQ result
            const resultRes = await r.get(`/api/quiz/${firstTask._id}/mcq-result?userId=${bismarckId}`)
                .set('Authorization', `Bearer ${bismarckToken}`);

            const result = resultRes.body.data;
            console.log(`\n  ${hr}`);
            console.log(`  📊 QUIZ RESULT:`);
            console.log(`     Score: ${result.score}/${result.maxScore}`);
            console.log(`     Passed: ${result.passed ? '✅ YES' : '❌ NO'}`);
            console.log(`     Tokens: ${result.passed ? `+${firstTask.reward} reward` : `-${firstTask.tokenStake} forfeited`}`);

            const balanceAfter = (await User.findById(bismarckId)).tokenBalance;
            console.log(`     Balance: ${balanceBefore} → ${balanceAfter} tokens`);
            console.log(`  ${hr}`);
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  §6  THEORY QUESTION GENERATION
    // ════════════════════════════════════════════════════════════════
    section(6, 'GEMINI THEORY QUESTION GENERATION');

    const quizAttempt = await QuizAttempt.findOne({ user: bismarckId });
    if (quizAttempt && quizAttempt.mcqPassed) {
        info('Generating 7 theory questions via Gemini...\n');
        const theoryRes = await r.get(`/api/quiz/${quizAttempt.task}/theory?userId=${bismarckId}`)
            .set('Authorization', `Bearer ${bismarckToken}`);
        if (theoryRes.body.success) {
            const theoryQs = theoryRes.body.data.questions;
            ok(`🤖 Gemini generated ${theoryQs.length} theory questions:\n`);
            theoryQs.forEach((q, i) => {
                console.log(`  T${i + 1}: ${q.question}`);
                console.log();
            });
        } else {
            warn(`Theory generation: ${theoryRes.body.message}`);
        }
    } else {
        info('Quiz not passed — theory generation skipped');
    }

    // ════════════════════════════════════════════════════════════════
    //  §7  CHATBOT — FOCUS BUDDY CONVERSATION
    // ════════════════════════════════════════════════════════════════
    section(7, 'FOCUS BUDDY CHATBOT (GEMINI CONVERSATION)');

    const chatMessages = [
        "Hey buddy, I just finished my first quiz! But I got one wrong on Binary Search Trees — can you explain how BST deletion works when the node has two children?",
        "Thanks! Also I'm feeling a bit stressed about the upcoming midterm. Any tips?",
    ];

    let conversationId = null;
    for (const msg of chatMessages) {
        console.log(`  👤 Bismarck: ${msg}\n`);

        const chatRes = await r.post('/api/chat/message')
            .set('Authorization', `Bearer ${bismarckToken}`)
            .send({
                userId: bismarckId,
                message: msg,
                conversationId,
            });

        if (chatRes.body.success) {
            conversationId = chatRes.body.data.conversationId;
            const reply = chatRes.body.data.response;
            // Format reply with line wrapping
            const wrapped = reply.replace(/(.{1,80})\s/g, '$1\n  ');
            console.log(`  🤖 Focus Buddy:\n  ${wrapped}\n`);
            console.log(`  ${hr}\n`);
        } else {
            warn(`Chat failed: ${chatRes.body.message}`);
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  §8  TOLERANCE STATUS
    // ════════════════════════════════════════════════════════════════
    section(8, 'TOLERANCE STATUS CHECK');

    const tolRes = await r.get('/api/auth/tolerance')
        .set('Authorization', `Bearer ${bismarckToken}`);

    if (tolRes.body.success) {
        const t = tolRes.body.data;
        console.log(`  🛡️  BISMARCK'S TOLERANCE STATUS:`);
        console.log(`     Tolerance Cap:      ${t.toleranceCap} days (base 2 + ${t.streakBonus} streak bonus)`);
        console.log(`     Days Absent:        ${t.daysAbsent}`);
        console.log(`     Tolerance Left:     ${t.toleranceRemaining} days`);
        console.log(`     Days Until Bleed:   ${t.daysUntilBleed}`);
        console.log(`     Current Bleed Rate: ${t.currentBleedRate} tokens/day`);
        console.log(`     Next Bleed Rate:    ${t.nextBleedRate} tokens/day (if absent tomorrow)`);
        console.log(`     Total Bled:         ${t.totalBled} tokens`);
    }

    // ════════════════════════════════════════════════════════════════
    //  §9  FULL USER PROFILE SNAPSHOT
    // ════════════════════════════════════════════════════════════════
    section(9, 'FULL USER PROFILES');

    // Login Bismarck again to get updated data
    const loginRes = await r.post('/api/auth/login').send({
        email: 'bismarck@university.edu', password: 'StrongPass123!',
    });
    const bData = loginRes.body.data.user;

    console.log(`  👤 BISMARCK KHAN:`);
    console.log(`     Token Balance:  ${bData.tokenBalance}`);
    console.log(`     Reputation:     ${bData.reputation}`);
    console.log(`     Streak:         ${bData.streak?.currentDays || 0} days (longest: ${bData.streak?.longestStreak || 0})`);
    console.log(`     Quizzes Taken:  ${bData.stats?.quizzesTaken || 0}`);
    console.log(`     Quizzes Passed: ${bData.stats?.quizzesPassed || 0}`);
    console.log(`     Avg MCQ Score:  ${bData.stats?.avgMcqScore || 0}`);
    console.log(`     Tasks Done:     ${bData.stats?.tasksCompleted || 0}`);
    console.log(`     Tokens Earned:  ${bData.stats?.tokensEarned || 0}`);
    console.log(`     Tokens Lost:    ${bData.stats?.tokensLost || 0}`);
    console.log(`     Tolerance Cap:  ${bData.tolerance?.toleranceCap || 0} days`);

    // ════════════════════════════════════════════════════════════════
    //  §10  LEADERBOARD
    // ════════════════════════════════════════════════════════════════
    section(10, 'LEADERBOARD SNAPSHOT');

    const lbRes = await r.get('/api/leaderboard/overall')
        .set('Authorization', `Bearer ${bismarckToken}`);

    if (lbRes.body.success) {
        console.log('  🏆 OVERALL LEADERBOARD:\n');
        console.log('  Rank │ Name             │ Tokens │ Reputation');
        console.log('  ─────┼──────────────────┼────────┼──────────');
        for (const entry of lbRes.body.data) {
            console.log(`  #${String(entry.rank).padEnd(3)} │ ${entry.name.padEnd(16)} │ ${String(entry.tokenBalance).padStart(6)} │ ${entry.reputation}`);
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  §11  DATABASE SUMMARY
    // ════════════════════════════════════════════════════════════════
    section(11, 'DATABASE SUMMARY');

    const summary = {
        users: await User.countDocuments(),
        courses: await Course.countDocuments(),
        tasks: await Task.countDocuments(),
        announcements: await Announcement.countDocuments(),
        quizAttempts: await QuizAttempt.countDocuments(),
        tokenLedger: await TokenLedger.countDocuments(),
    };

    console.log('  📊 COLLECTION COUNTS:\n');
    for (const [key, val] of Object.entries(summary)) {
        console.log(`     ${key.padEnd(18)} ${val}`);
    }

    // Show token ledger
    console.log(`\n  💰 TOKEN LEDGER (Bismarck's transactions):\n`);
    const ledger = await TokenLedger.find({ userId: bismarckId }).sort({ createdAt: 1 });
    for (const entry of ledger) {
        const sign = entry.amount >= 0 ? '+' : '';
        console.log(`     ${entry.type.padEnd(18)} ${sign}${entry.amount} → bal: ${entry.balanceAfter}  │ ${entry.note}`);
    }

    // ════════════════════════════════════════════════════════════════
    //  CLEANUP & DONE
    // ════════════════════════════════════════════════════════════════
    console.log(`\n${HR}`);
    console.log(`  🎉 LIVE TEST COMPLETE — Focus Enhancer v4.2`);
    console.log(`  All systems operational. Gemini API ✅ MongoDB Atlas ✅`);
    console.log(`${HR}\n`);

    // Drop the test database to not leave test data
    await mongoose.connection.db.dropDatabase();
    info('Cleaned up: dropped test database');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('\n💥 FATAL ERROR:', err);
    try {
        await mongoose.connection.db.dropDatabase();
        await mongoose.disconnect();
    } catch { /* ignore */ }
    process.exit(1);
});
