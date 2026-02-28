/* ================================================================
   PEER REVIEW — Integration Tests
   ================================================================
   Tests the full peer review lifecycle:
   - View accomplished tasks / solutions
   - Upvote (deducts wager, updates reputation/proficiency)
   - Downvote (deducts wager, pending response)
   - Dispute: agree (reviewee loses, downvoter rewarded)
   - Dispute: disagree → AI arbitration (both outcomes)
   ================================================================ */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock the AI arbitration service ────────────────────────────
vi.mock('../../src/services/arbitrationService.js', () => ({
    arbitrateDispute: vi.fn(),
}));

// ── Mock questionGenerator (needed for quiz flow in seed) ──────
vi.mock('../../src/services/questionGenerator.js', () => ({
    generateMCQs: vi.fn(),
    generateTheoryQuestions: vi.fn(),
}));

import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createApp, generateToken, MOCK_MCQS, MOCK_THEORY, createFakePdfBuffer } from '../helpers.js';
import User from '../../src/models/User.js';
import Course from '../../src/models/Course.js';
import Task from '../../src/models/Task.js';
import Announcement from '../../src/models/Announcement.js';
import QuizAttempt from '../../src/models/QuizAttempt.js';
import TheorySubmission from '../../src/models/TheorySubmission.js';
import PeerReview from '../../src/models/PeerReview.js';
import CourseProficiency from '../../src/models/CourseProficiency.js';
import TokenLedger from '../../src/models/TokenLedger.js';
import { generateMCQs, generateTheoryQuestions } from '../../src/services/questionGenerator.js';
import { arbitrateDispute } from '../../src/services/arbitrationService.js';

const app = createApp();

/**
 * Seed a full scenario: two users with a completed quiz + theory submission.
 * Returns { reviewer, reviewee, reviewerToken, revieweeToken, task, course, attempt, submission }
 */
async function seedPeerReviewScenario(reviewerBalance = 100, revieweeBalance = 200) {
    const hash = await bcrypt.hash('password123', 1);

    const reviewee = await User.create({
        name: 'Reviewee Student',
        email: `reviewee_${Date.now()}@iitj.ac.in`,
        passwordHash: hash,
        tokenBalance: revieweeBalance,
    });
    const reviewer = await User.create({
        name: 'Reviewer Student',
        email: `reviewer_${Date.now()}@iitj.ac.in`,
        passwordHash: hash,
        tokenBalance: reviewerBalance,
    });
    const course = await Course.create({
        courseCode: `PR${Date.now().toString().slice(-4)}`,
        title: 'Peer Review Course',
        durationType: 'full',
    });
    const ann = await Announcement.create({
        course: course._id,
        eventType: 'quiz',
        title: 'PR Quiz',
        topics: ['Topic A'],
        eventDate: new Date(Date.now() + 15 * 864e5),
        createdBy: reviewer._id,
    });
    const task = await Task.create({
        title: 'PR Task',
        description: 'Peer review test task',
        topic: 'Topic A',
        type: 'reading',
        difficulty: 'medium',
        tokenStake: 10,
        reward: 10,
        durationHours: 2,
        deadline: new Date(Date.now() + 15 * 864e5),
        scheduledDate: new Date(),
        passNumber: 1,
        isRevision: false,
        source: 'announcement',
        course: course._id,
        announcement: ann._id,
    });

    // Create a passed quiz attempt for the reviewee
    const attempt = await QuizAttempt.create({
        user: reviewee._id,
        task: task._id,
        course: course._id,
        mcqs: MOCK_MCQS,
        mcqStartedAt: new Date(Date.now() - 60000),
        mcqScore: 10,
        mcqPassed: true,
        mcqResponses: MOCK_MCQS.map((_, i) => ({
            questionIndex: i,
            selectedAnswer: MOCK_MCQS[i].correctAnswer,
            isCorrect: true,
            points: 2,
        })),
        theoryQuestions: MOCK_THEORY,
        theorySubmissionPath: '/uploads/theory_test.pdf',
        theorySubmittedAt: new Date(),
        status: 'submitted',
        tokenSettled: true,
        tokensAwarded: 10,
    });

    // Create the theory submission
    const submission = await TheorySubmission.create({
        student: reviewee._id,
        task: task._id,
        quizAttempt: attempt._id,
        course: course._id,
        pdf: {
            originalName: 'solutions.pdf',
            storedPath: '/uploads/theory_test.pdf',
            sizeBytes: 1024,
            uploadedAt: new Date(),
        },
    });

    // Link submission to attempt
    attempt.theorySubmission = submission._id;
    await attempt.save();

    const reviewerToken = generateToken(reviewer._id, 'student');
    const revieweeToken = generateToken(reviewee._id, 'student');

    return {
        reviewer, reviewee, reviewerToken, revieweeToken,
        task, course, ann, attempt, submission,
    };
}

describe('Peer Review Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        generateMCQs.mockResolvedValue(MOCK_MCQS);
        generateTheoryQuestions.mockResolvedValue(MOCK_THEORY);
    });

    // ── GET /api/reviews/accomplished/:userId ──────────────────
    describe('GET /api/reviews/accomplished/:userId', () => {
        it('lists accomplished tasks for a user', async () => {
            const { reviewee, task } = await seedPeerReviewScenario();
            const res = await request(app).get(`/api/reviews/accomplished/${reviewee._id}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(1);
            expect(res.body.data[0].task._id).toBe(task._id.toString());
            expect(res.body.data[0].pdf.originalName).toBe('solutions.pdf');
            expect(res.body.data[0].peerReview.upvotes).toBe(0);
        });

        it('returns empty for user with no submissions', async () => {
            const { reviewer } = await seedPeerReviewScenario();
            const res = await request(app).get(`/api/reviews/accomplished/${reviewer._id}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(0);
        });
    });

    // ── GET /api/reviews/solution/:taskId/:userId ──────────────
    describe('GET /api/reviews/solution/:taskId/:userId', () => {
        it('returns theory questions + PDF info for a submitted task', async () => {
            const { reviewerToken, reviewee, task } = await seedPeerReviewScenario();
            const res = await request(app)
                .get(`/api/reviews/solution/${task._id}/${reviewee._id}`)
                .set('Authorization', `Bearer ${reviewerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.theoryQuestions).toHaveLength(7);
            expect(res.body.data.pdf.originalName).toBe('solutions.pdf');
            expect(res.body.data.mcqScore).toBe(10);
            expect(res.body.data.existingReview).toBeNull();
        });

        it('returns 404 for non-submitted task', async () => {
            const hash = await bcrypt.hash('pass', 1);
            const u = await User.create({ name: 'X', email: `x${Date.now()}@iitj.ac.in`, passwordHash: hash });
            const tok = generateToken(u._id);
            const res = await request(app)
                .get(`/api/reviews/solution/${new mongoose.Types.ObjectId()}/${u._id}`)
                .set('Authorization', `Bearer ${tok}`);

            expect(res.status).toBe(404);
        });
    });

    // ── POST /api/reviews/upvote ───────────────────────────────
    describe('POST /api/reviews/upvote', () => {
        it('creates an upvote, deducts wager, updates reputation', async () => {
            const { reviewer, reviewerToken, reviewee, task } = await seedPeerReviewScenario();
            const wager = 5;
            const res = await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${reviewerToken}`)
                .send({ taskId: task._id.toString(), revieweeId: reviewee._id.toString(), wager });

            expect(res.status).toBe(201);
            expect(res.body.data.type).toBe('upvote');
            expect(res.body.data.wager).toBe(5);

            // Check reviewer balance deducted
            const updatedReviewer = await User.findById(reviewer._id);
            expect(updatedReviewer.tokenBalance).toBe(100 - wager);
            expect(updatedReviewer.stats.reviewsGiven).toBe(1);

            // Check reviewee reputation updated
            const updatedReviewee = await User.findById(reviewee._id);
            expect(updatedReviewee.stats.upvotesReceived).toBe(1);
            expect(updatedReviewee.reputation).toBeGreaterThanOrEqual(0);

            // Check CourseProficiency updated
            const prof = await CourseProficiency.findOne({ user: reviewee._id });
            expect(prof.upvotesReceived).toBe(1);
            expect(prof.proficiencyScore).toBeGreaterThan(0);

            // Check ledger entry
            const ledger = await TokenLedger.findOne({ userId: reviewer._id, type: 'peer_wager' });
            expect(ledger.amount).toBe(-wager);
        });

        it('rejects self-review', async () => {
            const { reviewee, revieweeToken, task } = await seedPeerReviewScenario();
            const res = await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${revieweeToken}`)
                .send({ taskId: task._id.toString(), revieweeId: reviewee._id.toString(), wager: 5 });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/own submission/i);
        });

        it('rejects duplicate review', async () => {
            const { reviewerToken, reviewee, task } = await seedPeerReviewScenario();
            await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${reviewerToken}`)
                .send({ taskId: task._id.toString(), revieweeId: reviewee._id.toString(), wager: 5 });

            const res = await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${reviewerToken}`)
                .send({ taskId: task._id.toString(), revieweeId: reviewee._id.toString(), wager: 5 });

            expect(res.status).toBe(409);
        });

        it('rejects insufficient tokens', async () => {
            const { reviewerToken, reviewee, task } = await seedPeerReviewScenario(2); // only 2 tokens
            const res = await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${reviewerToken}`)
                .send({ taskId: task._id.toString(), revieweeId: reviewee._id.toString(), wager: 10 });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/insufficient/i);
        });
    });

    // ── POST /api/reviews/downvote ─────────────────────────────
    describe('POST /api/reviews/downvote', () => {
        it('creates a downvote with reason, sets pending_response', async () => {
            const { reviewer, reviewerToken, reviewee, task } = await seedPeerReviewScenario();
            const res = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${reviewerToken}`)
                .send({
                    taskId: task._id.toString(),
                    revieweeId: reviewee._id.toString(),
                    wager: 8,
                    reason: 'The derivation in Q3 is completely wrong, used the wrong formula for merge sort.',
                });

            expect(res.status).toBe(201);
            expect(res.body.data.type).toBe('downvote');
            expect(res.body.data.disputeStatus).toBe('pending_response');

            // Reviewer balance deducted
            const updatedReviewer = await User.findById(reviewer._id);
            expect(updatedReviewer.tokenBalance).toBe(100 - 8);

            // Reviewee got a downvote
            const updatedReviewee = await User.findById(reviewee._id);
            expect(updatedReviewee.stats.downvotesReceived).toBe(1);
        });

        it('rejects downvote without reason', async () => {
            const { reviewerToken, reviewee, task } = await seedPeerReviewScenario();
            const res = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${reviewerToken}`)
                .send({
                    taskId: task._id.toString(),
                    revieweeId: reviewee._id.toString(),
                    wager: 5,
                    reason: 'bad', // too short
                });

            expect(res.status).toBe(400);
        });
    });

    // ── POST /api/reviews/:reviewId/respond ────────────────────
    describe('POST /api/reviews/:reviewId/respond', () => {
        it('agree: reviewee loses task tokens, downvoter rewarded', async () => {
            const s = await seedPeerReviewScenario(100, 200);
            // Create downvote
            const dvRes = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 10,
                    reason: 'The answer to Q5 about BFS vs DFS comparison is factually incorrect.',
                });
            const reviewId = dvRes.body.data.reviewId;

            // Reviewee agrees
            const res = await request(app)
                .post(`/api/reviews/${reviewId}/respond`)
                .set('Authorization', `Bearer ${s.revieweeToken}`)
                .send({ action: 'agree' });

            expect(res.status).toBe(200);
            expect(res.body.data.disputeStatus).toBe('agreed');
            expect(res.body.data.tokensLost).toBe(s.task.tokenStake);

            // Check reviewee lost tokens
            const reviewee = await User.findById(s.reviewee._id);
            expect(reviewee.tokenBalance).toBe(200 - s.task.tokenStake);
            expect(reviewee.stats.downvotesLost).toBe(1);

            // Check reviewer got wager back + reward
            const reviewer = await User.findById(s.reviewer._id);
            // Started 100, wagered 10, then got 10+10=20 back
            expect(reviewer.tokenBalance).toBe(100 - 10 + 10 + 10);

            // Check proficiency
            const prof = await CourseProficiency.findOne({ user: s.reviewee._id });
            expect(prof.downvotesLost).toBe(1);
        });

        it('disagree + AI sides with downvoter: reviewee loses, downvoter wins', async () => {
            arbitrateDispute.mockResolvedValue({
                decision: 'downvoter_correct',
                reasoning: 'The merge sort derivation uses incorrect recurrence relation.',
                confidence: 0.85,
            });

            const s = await seedPeerReviewScenario(100, 200);
            const dvRes = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 10,
                    reason: 'Merge sort derivation uses T(n) = T(n-1) + n which is selection sort, not merge sort.',
                });
            const reviewId = dvRes.body.data.reviewId;

            const res = await request(app)
                .post(`/api/reviews/${reviewId}/respond`)
                .set('Authorization', `Bearer ${s.revieweeToken}`)
                .send({ action: 'disagree' });

            expect(res.status).toBe(200);
            expect(res.body.data.disputeStatus).toBe('resolved_downvoter_wins');
            expect(res.body.data.aiVerdict.decision).toBe('downvoter_correct');
            expect(res.body.data.aiVerdict.confidence).toBe(0.85);

            // Reviewee lost task tokens
            const reviewee = await User.findById(s.reviewee._id);
            expect(reviewee.tokenBalance).toBe(200 - s.task.tokenStake);
            expect(reviewee.stats.downvotesLost).toBe(1);

            // Reviewer got wager + reward
            const reviewer = await User.findById(s.reviewer._id);
            expect(reviewer.tokenBalance).toBe(100 - 10 + 10 + 10);
        });

        it('disagree + AI sides with reviewee: downvoter loses wager, reviewee keeps tokens', async () => {
            arbitrateDispute.mockResolvedValue({
                decision: 'reviewee_correct',
                reasoning: 'The student used the correct recurrence relation for merge sort.',
                confidence: 0.9,
            });

            const s = await seedPeerReviewScenario(100, 200);
            const dvRes = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 15,
                    reason: 'I think the BFS traversal order shown is wrong for the given graph.',
                });
            const reviewId = dvRes.body.data.reviewId;

            const res = await request(app)
                .post(`/api/reviews/${reviewId}/respond`)
                .set('Authorization', `Bearer ${s.revieweeToken}`)
                .send({ action: 'disagree' });

            expect(res.status).toBe(200);
            expect(res.body.data.disputeStatus).toBe('resolved_reviewee_wins');
            expect(res.body.data.aiVerdict.decision).toBe('reviewee_correct');

            // Reviewee keeps tokens, defended count goes up
            const reviewee = await User.findById(s.reviewee._id);
            expect(reviewee.tokenBalance).toBe(200); // unchanged
            expect(reviewee.stats.downvotesDefended).toBe(1);

            // Reviewer lost wager permanently
            const reviewer = await User.findById(s.reviewer._id);
            expect(reviewer.tokenBalance).toBe(100 - 15); // wager gone

            // Proficiency
            const prof = await CourseProficiency.findOne({ user: reviewee._id });
            expect(prof.downvotesDefended).toBe(1);
        });

        it('rejects non-reviewee responding', async () => {
            const s = await seedPeerReviewScenario();
            const dvRes = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 5,
                    reason: 'This is a completely wrong derivation for Q1.',
                });

            // Reviewer (wrong person) tries to respond
            const res = await request(app)
                .post(`/api/reviews/${dvRes.body.data.reviewId}/respond`)
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({ action: 'agree' });

            expect(res.status).toBe(403);
        });

        it('rejects invalid action', async () => {
            const s = await seedPeerReviewScenario();
            const dvRes = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 5,
                    reason: 'Wrong formula used for the hash function calculation.',
                });

            const res = await request(app)
                .post(`/api/reviews/${dvRes.body.data.reviewId}/respond`)
                .set('Authorization', `Bearer ${s.revieweeToken}`)
                .send({ action: 'maybe' });

            expect(res.status).toBe(400);
        });

        it('rejects responding to already-resolved review', async () => {
            arbitrateDispute.mockResolvedValue({
                decision: 'reviewee_correct',
                reasoning: 'Valid solution.',
                confidence: 0.8,
            });

            const s = await seedPeerReviewScenario();
            const dvRes = await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 5,
                    reason: 'The algorithm trace for cycle detection is completely wrong.',
                });

            // Disagree once
            await request(app)
                .post(`/api/reviews/${dvRes.body.data.reviewId}/respond`)
                .set('Authorization', `Bearer ${s.revieweeToken}`)
                .send({ action: 'disagree' });

            // Try again
            const res = await request(app)
                .post(`/api/reviews/${dvRes.body.data.reviewId}/respond`)
                .set('Authorization', `Bearer ${s.revieweeToken}`)
                .send({ action: 'agree' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/cannot respond/i);
        });
    });

    // ── GET /api/reviews/my-reviews & /api/reviews/received ────
    describe('GET my-reviews & received', () => {
        it('lists reviews given by the current user', async () => {
            const s = await seedPeerReviewScenario();
            await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({ taskId: s.task._id.toString(), revieweeId: s.reviewee._id.toString(), wager: 3 });

            const res = await request(app)
                .get('/api/reviews/my-reviews')
                .set('Authorization', `Bearer ${s.reviewerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.data[0].type).toBe('upvote');
        });

        it('lists reviews received by the current user', async () => {
            const s = await seedPeerReviewScenario();
            await request(app)
                .post('/api/reviews/upvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({ taskId: s.task._id.toString(), revieweeId: s.reviewee._id.toString(), wager: 3 });

            const res = await request(app)
                .get('/api/reviews/received')
                .set('Authorization', `Bearer ${s.revieweeToken}`);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.pendingDisputes).toBe(0); // upvote has no dispute
        });

        it('counts pending disputes correctly', async () => {
            const s = await seedPeerReviewScenario();
            await request(app)
                .post('/api/reviews/downvote')
                .set('Authorization', `Bearer ${s.reviewerToken}`)
                .send({
                    taskId: s.task._id.toString(),
                    revieweeId: s.reviewee._id.toString(),
                    wager: 5,
                    reason: 'The proof for binary tree leaves is incomplete and missing induction step.',
                });

            const res = await request(app)
                .get('/api/reviews/received')
                .set('Authorization', `Bearer ${s.revieweeToken}`);

            expect(res.body.pendingDisputes).toBe(1);
        });
    });
});
