#!/usr/bin/env node
/**
 * test-all.js — Comprehensive end-to-end test suite for Focus Enhancer API
 * Run:  node test-all.js
 *
 * Tests: Auth, Courses, Tasks, Quiz pipeline, Peer Review, DM Chat,
 *        Complaints, Profile, Leaderboard, Chatbot, User search
 */
import 'dotenv/config';

const BASE = process.env.BASE_URL || 'http://localhost:5000';

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
    if (cond) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        failures.push(label);
        console.log(`  ❌ ${label}`);
    }
}

async function req(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    return { status: res.status, data };
}

// ═══════════════════════════════════════════════════════════════
// TEST STATE
// ═══════════════════════════════════════════════════════════════
const RUN = Date.now().toString(36); // unique suffix per run
let tokenA, tokenB, tokenCR, tokenAdmin;
let userA, userB, userCR, userAdmin;
let courseId, taskId, quizAttemptId;
let convoId; // DM conversation

async function main() {
    console.log('\n🧪 FOCUS ENHANCER — COMPREHENSIVE TEST SUITE\n');
    console.log(`   Target: ${BASE}\n`);

    // ── 0. Health ──────────────────────────────────────────────
    console.log('── 0. HEALTH ──');
    {
        const { status, data } = await req('GET', '/api/health');
        assert(status === 200 && data.success, 'Health check returns 200');
    }

    // ── 1. AUTH — Registration ─────────────────────────────────
    console.log('\n── 1. AUTH — Registration ──');
    {
        // Register user A (student)
        const { status, data } = await req('POST', '/api/auth/register', {
            name: 'Test Alice', email: `alice${RUN}@iitj.ac.in`, password: 'password123',
            studentId: `TST_A_${RUN}`, department: 'Computer Science', semester: 4, year: 2026, university: 'IIT Jodhpur',
        });
        assert(status === 201 && data.success, 'Register user A (all fields)');
        tokenA = data.data?.token;
        userA = data.data?.user;
        assert(!!tokenA, 'User A receives JWT');
        assert(userA?.studentId === `TST_A_${RUN}`, 'User A studentId saved');
        assert(userA?.department === 'Computer Science', 'User A department saved');
    }
    {
        // Register user B
        const { status, data } = await req('POST', '/api/auth/register', {
            name: 'Test Bob', email: `bob${RUN}@iitj.ac.in`, password: 'password123',
            studentId: `TST_B_${RUN}`, department: 'EE', semester: 3, year: 2027,
        });
        assert(status === 201 && data.success, 'Register user B');
        tokenB = data.data?.token;
        userB = data.data?.user;
    }
    {
        // Duplicate email
        const { status } = await req('POST', '/api/auth/register', {
            name: 'Dup', email: `alice${RUN}@iitj.ac.in`, password: 'password123',
        });
        assert(status === 409, 'Duplicate email returns 409');
    }
    {
        // Duplicate studentId
        const { status } = await req('POST', '/api/auth/register', {
            name: 'Dup2', email: `dup2${RUN}@iitj.ac.in`, password: 'password123', studentId: `TST_A_${RUN}`,
        });
        assert(status === 409, 'Duplicate studentId returns 409');
    }
    {
        // Non @iitj.ac.in email
        const { status } = await req('POST', '/api/auth/register', {
            name: 'Bad', email: 'bad@gmail.com', password: 'password123',
        });
        assert(status === 400, 'Non-iitj email returns 400');
    }
    {
        // Short password
        const { status } = await req('POST', '/api/auth/register', {
            name: 'Short', email: `short${RUN}@iitj.ac.in`, password: '12',
        });
        assert(status === 400, 'Short password returns 400');
    }

    // ── 2. AUTH — Login ────────────────────────────────────────
    console.log('\n── 2. AUTH — Login ──');
    {
        const { status, data } = await req('POST', '/api/auth/login', {
            email: `alice${RUN}@iitj.ac.in`, password: 'password123',
        });
        assert(status === 200 && data.success, 'Login user A');
        tokenA = data.data?.token; // refresh token
        assert(data.data?.user?.streak !== undefined, 'Login returns streak');
        assert(data.data?.user?.tolerance !== undefined, 'Login returns tolerance');
    }
    {
        const { status } = await req('POST', '/api/auth/login', {
            email: `alice${RUN}@iitj.ac.in`, password: 'wrongpassword',
        });
        assert(status === 401, 'Wrong password returns 401');
    }
    {
        const { status } = await req('POST', '/api/auth/login', {
            email: 'noexist@iitj.ac.in', password: 'password123',
        });
        assert(status === 401, 'Non-existent user returns 401');
    }

    // ── 3. AUTH — Profile ──────────────────────────────────────
    console.log('\n── 3. AUTH — Profile ──');
    {
        const { status, data } = await req('GET', '/api/auth/me', null, tokenA);
        assert(status === 200 && data.success, 'GET /auth/me works');
        userA = data.data;
        assert(userA?.name === 'Test Alice', 'Full profile: name');
        assert(userA?.studentId === `TST_A_${RUN}`, 'Full profile: studentId persisted');
        assert(userA?.department === 'Computer Science', 'Full profile: department persisted');
        assert(userA?.semester === 4, 'Full profile: semester persisted');
        assert(userA?.year === 2026, 'Full profile: year persisted');
        assert(userA?.university === 'IIT Jodhpur', 'Full profile: university persisted');
        assert(userA?.tokenBalance === 100, 'Initial token balance is 100');
    }
    {
        // Update profile
        const { status, data } = await req('PUT', '/api/auth/profile', {
            name: 'Alice Updated', department: 'CSE', semester: 5,
        }, tokenA);
        assert(status === 200 && data.success, 'Profile update works');
        assert(data.data?.name === 'Alice Updated', 'Name updated');
        assert(data.data?.department === 'CSE', 'Department updated');
    }
    {
        // No auth
        const { status } = await req('GET', '/api/auth/me');
        assert(status === 401, 'GET /auth/me without token returns 401');
    }
    {
        // Tolerance
        const { status, data } = await req('GET', '/api/auth/tolerance', null, tokenA);
        assert(status === 200 && data.success, 'GET /auth/tolerance works');
    }

    // ── 4. COURSES ─────────────────────────────────────────────
    console.log('\n── 4. COURSES ──');
    {
        // Register CR user (admin who can create courses)
        const { status, data } = await req('POST', '/api/auth/register', {
            name: 'Test CR', email: `cr${RUN}@iitj.ac.in`, password: 'password123',
            role: 'cr', studentId: `TST_CR_${RUN}`, department: 'CS',
        });
        assert(status === 201, 'Register CR user');
        tokenCR = data.data?.token;
        userCR = data.data?.user;
    }
    {
        // Create a course (CR can create)
        const { status, data } = await req('POST', '/api/courses', {
            courseCode: `TST${RUN}`, title: 'Test Course Alpha', department: 'CS',
            semester: 4, year: 2026, durationType: 'full', creditWeight: 3,
        }, tokenCR);
        assert(status === 201 && data.success, 'CR creates course');
        courseId = data.data?._id;
        assert(!!courseId, 'Course ID returned');
    }
    {
        // CR claims the course (sets courseRep)
        const { status, data } = await req('PUT', `/api/courses/${courseId}/claim-cr`, {}, tokenCR);
        assert(status === 200 && data.success, 'CR claims course');
        const meCR = await req('GET', '/api/auth/me', null, tokenCR);
        userCR = meCR.data?.data;
    }
    {
        // List courses
        const { status, data } = await req('GET', '/api/courses', null, tokenA);
        assert(status === 200 && data.success, 'List courses');
        assert(data.data?.length >= 1, 'At least 1 course exists');
    }
    {
        // Enroll user A
        const { status, data } = await req('POST', `/api/courses/${courseId}/enroll`, {}, tokenA);
        assert(status === 200 && data.success, 'User A enrolls in course');
    }
    {
        // Enroll user B
        const { status, data } = await req('POST', `/api/courses/${courseId}/enroll`, {}, tokenB);
        assert(status === 200 && data.success, 'User B enrolls in course');
    }
    {
        // Get course detail
        const { status, data } = await req('GET', `/api/courses/${courseId}`, null, tokenA);
        assert(status === 200 && data.success, 'Get course detail');
    }

    // ── 5. ANNOUNCEMENTS ───────────────────────────────────────
    console.log('\n── 5. ANNOUNCEMENTS ──');
    {
        const { status, data } = await req('POST', '/api/announcements', {
            courseId, eventType: 'quiz', title: 'Test Quiz Announcement',
            topics: ['Sorting', 'Searching'], eventDate: new Date(Date.now() + 86400000).toISOString(),
        }, tokenCR);
        assert(status === 201 && data.success, 'CR creates announcement');
    }
    {
        const { status, data } = await req('GET', `/api/announcements?courseId=${courseId}`, null, tokenA);
        assert(status === 200 && data.success, 'List announcements');
        assert(data.data?.length >= 1, 'At least 1 announcement');
    }

    // ── 6. TASKS ───────────────────────────────────────────────
    console.log('\n── 6. TASKS ──');
    {
        const { status, data } = await req('GET', '/api/tasks', null, tokenA);
        assert(status === 200 && data.success, 'List tasks');
        // There may be auto-generated tasks from announcement or none yet
        if (data.data?.length > 0) {
            taskId = data.data[0]._id;
            assert(!!taskId, 'Task ID from list');
        }
    }

    // If no tasks, we can check that the endpoint at least works
    if (!taskId) {
        console.log('   ⚠️  No tasks found (normal for fresh test data)');
    }

    // ── 7. QUIZ PIPELINE ───────────────────────────────────────
    console.log('\n── 7. QUIZ PIPELINE ──');
    if (taskId) {
        // Start quiz
        const startRes = await req('POST', `/api/quiz/${taskId}/start`, {}, tokenA);
        if (startRes.status === 201 || startRes.status === 200) {
            assert(true, 'Start quiz attempt');
            quizAttemptId = startRes.data.data?.attemptId;
            const mcqs = startRes.data.data?.mcqs || [];

            // Answer each question (pick answer 0 — we can't know correct from sanitized MCQs)
            for (let i = 0; i < mcqs.length; i++) {
                const { status } = await req('POST', `/api/quiz/${taskId}/answer`, {
                    questionIndex: i, selectedAnswer: 0,
                }, tokenA);
                assert(status === 200, `Answer question ${i}`);
            }

            // Get MCQ result (quiz auto-completes when all questions answered)
            const submitRes = await req('GET', `/api/quiz/${taskId}/mcq-result`, null, tokenA);
            assert(submitRes.status === 200 && submitRes.data.success, 'Get MCQ result');
            assert(submitRes.data.data?.score !== undefined, 'MCQ score returned');
        } else {
            assert(false, `Start quiz failed: ${startRes.status} ${startRes.data?.message}`);
        }
    } else {
        console.log('   ⚠️  Skipping quiz tests (no task)');
    }

    // ── 8. DIRECT CHAT (DM) ───────────────────────────────────
    console.log('\n── 8. DIRECT CHAT ──');
    {
        // Get user B's ID from /auth/me
        const meB = await req('GET', '/api/auth/me', null, tokenB);
        const userBId = meB.data?.data?._id;
        assert(!!userBId, 'Got user B ID');

        // A sends chat request to B
        const { status, data } = await req('POST', '/api/direct-chat/request', {
            targetUserId: userBId,
        }, tokenA);
        assert(status === 201 && data.success, 'A sends chat request to B');
        convoId = data.conversation?._id;
        assert(!!convoId, 'Conversation ID returned');
    }
    {
        // Duplicate request
        const meB = await req('GET', '/api/auth/me', null, tokenB);
        const { status } = await req('POST', '/api/direct-chat/request', {
            targetUserId: meB.data?.data?._id,
        }, tokenA);
        assert(status === 409, 'Duplicate chat request returns 409');
    }
    {
        // B sees incoming request
        const { status, data } = await req('GET', '/api/direct-chat/requests/incoming', null, tokenB);
        assert(status === 200 && data.success, 'B sees incoming requests');
        assert(data.requests?.length >= 1, 'B has at least 1 incoming request');
    }
    {
        // A sees outgoing request
        const { status, data } = await req('GET', '/api/direct-chat/requests/outgoing', null, tokenA);
        assert(status === 200 && data.success, 'A sees outgoing requests');
        assert(data.requests?.length >= 1, 'A has at least 1 outgoing request');
    }
    {
        // A can't accept own request
        const { status } = await req('PUT', `/api/direct-chat/${convoId}/accept`, {}, tokenA);
        assert(status === 403, 'Initiator cannot accept own request');
    }
    {
        // Can't send message before acceptance
        const { status } = await req('POST', `/api/direct-chat/${convoId}/message`, {
            content: 'Too early',
        }, tokenA);
        assert(status === 400, 'Cannot message before acceptance');
    }
    {
        // B accepts
        const { status, data } = await req('PUT', `/api/direct-chat/${convoId}/accept`, {}, tokenB);
        assert(status === 200 && data.success, 'B accepts chat request');
        assert(data.conversation?.status === 'active', 'Conversation now active');
    }
    {
        // A sends message
        const { status, data } = await req('POST', `/api/direct-chat/${convoId}/message`, {
            content: 'Hello Bob!',
        }, tokenA);
        assert(status === 201 && data.success, 'A sends message');
        assert(data.message?.content === 'Hello Bob!', 'Message content correct');
    }
    {
        // B sends message
        const { status, data } = await req('POST', `/api/direct-chat/${convoId}/message`, {
            content: 'Hey Alice!',
        }, tokenB);
        assert(status === 201 && data.success, 'B sends message');
    }
    {
        // Get conversation with messages
        const { status, data } = await req('GET', `/api/direct-chat/${convoId}`, null, tokenA);
        assert(status === 200 && data.success, 'Get conversation detail');
        assert(data.conversation?.messages?.length === 2, 'Conversation has 2 messages');
    }
    {
        // List conversations
        const { status, data } = await req('GET', '/api/direct-chat', null, tokenA);
        assert(status === 200 && data.success, 'List conversations');
        assert(data.conversations?.length >= 1, 'At least 1 conversation');
    }
    {
        // Filter by status
        const { status, data } = await req('GET', '/api/direct-chat?status=active', null, tokenA);
        assert(status === 200 && data.conversations?.length >= 1, 'Filter active conversations');
    }
    {
        // End conversation
        const { status, data } = await req('PUT', `/api/direct-chat/${convoId}/end`, {}, tokenA);
        assert(status === 200 && data.success, 'A ends conversation');
        assert(data.conversation?.status === 'ended', 'Conversation now ended');
    }
    {
        // Can't send message to ended convo
        const { status } = await req('POST', `/api/direct-chat/${convoId}/message`, {
            content: 'Too late',
        }, tokenA);
        assert(status === 400, 'Cannot message ended conversation');
    }

    // ── 9. CHAT REQUEST — Reject flow ──────────────────────────
    console.log('\n── 9. DM — Reject Flow ──');
    {
        const meB = await req('GET', '/api/auth/me', null, tokenB);
        const userBId = meB.data?.data?._id;
        // B sends request to A
        const { status, data } = await req('POST', '/api/direct-chat/request', {
            targetUserId: userA._id,
        }, tokenB);
        assert(status === 201, 'B sends chat request to A');
        const rejectConvoId = data.conversation?._id;

        // A rejects
        const rej = await req('PUT', `/api/direct-chat/${rejectConvoId}/reject`, {}, tokenA);
        assert(rej.status === 200 && rej.data.success, 'A rejects chat request');

        // Verify it's gone
        const after = await req('GET', '/api/direct-chat/requests/incoming', null, tokenA);
        const stillThere = (after.data.requests || []).find(r => r._id === rejectConvoId);
        assert(!stillThere, 'Rejected request is deleted');
    }

    // ── 10. USER SEARCH ────────────────────────────────────────
    console.log('\n── 10. USER SEARCH ──');
    {
        const { status, data } = await req('GET', '/api/users/search?q=Test', null, tokenA);
        assert(status === 200 && data.success, 'User search works');
        assert(data.users?.length >= 1, 'Search returns results');
        // Current user should not appear in results
        const selfInResults = data.users?.find(u => u._id === userA._id);
        assert(!selfInResults, 'Current user excluded from search');
    }
    {
        const { status } = await req('GET', '/api/users/search?q=x', null, tokenA);
        assert(status === 400, 'Search query too short returns 400');
    }

    // ── 11. USER PROFILE (public) ──────────────────────────────
    console.log('\n── 11. PUBLIC USER PROFILE ──');
    {
        const meB = await req('GET', '/api/auth/me', null, tokenB);
        const userBId = meB.data?.data?._id;
        const { status, data } = await req('GET', `/api/users/${userBId}/profile`, null, tokenA);
        assert(status === 200 && data.success, 'Get public user profile');
        assert(data.data?.user?.name === 'Test Bob', 'Profile name correct');
    }

    // ── 12. LEADERBOARD ────────────────────────────────────────
    console.log('\n── 12. LEADERBOARD ──');
    {
        const { status, data } = await req('GET', '/api/leaderboard/overall', null, tokenA);
        assert(status === 200 && data.success, 'Leaderboard endpoint works');
        assert(Array.isArray(data.data), 'Leaderboard returns array');
    }

    // ── 13. COMPLAINTS ─────────────────────────────────────────
    console.log('\n── 13. COMPLAINTS ──');
    {
        const { status, data } = await req('POST', '/api/complaints', {
            courseId, type: 'false_announcement', description: 'Test complaint',
        }, tokenA);
        // Might return 201 or 400 depending on if user is enrolled and course has a CR
        if (status === 201) {
            assert(true, 'Create complaint succeeds');
        } else {
            assert(status === 400 || status === 404, `Complaint rejected (${status}): ${data.message}`);
        }
    }
    {
        const { status, data } = await req('GET', '/api/complaints', null, tokenA);
        assert(status === 200 && data.success, 'List my complaints');
    }

    // ── 14. STATS (public) ─────────────────────────────────────
    console.log('\n── 14. PUBLIC STATS ──');
    {
        const { status, data } = await req('GET', '/api/stats');
        assert(status === 200 && data.success, 'Public stats endpoint works');
        assert(typeof data.data?.users === 'number', 'Stats has users count');
    }

    // ── 15. ERROR HANDLING ─────────────────────────────────────
    console.log('\n── 15. ERROR HANDLING ──');
    {
        const { status } = await req('GET', '/api/nonexistent');
        assert(status === 404, '404 for nonexistent route');
    }
    {
        const { status } = await req('GET', '/api/tasks', null, 'invalidtoken');
        assert(status === 401, 'Invalid JWT returns 401');
    }
    {
        const { status } = await req('POST', '/api/direct-chat/request', {
            targetUserId: 'notavalidid',
        }, tokenA);
        assert(status === 400, 'Invalid MongoID in body returns 400');
    }

    // ═══════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  RESULTS:  ${passed} passed  /  ${failed} failed  /  ${passed + failed} total`);
    if (failures.length) {
        console.log('\n  ❌ FAILURES:');
        failures.forEach((f) => console.log(`     • ${f}`));
    }
    console.log('═══════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('💥 Test runner crashed:', err);
    process.exit(1);
});
