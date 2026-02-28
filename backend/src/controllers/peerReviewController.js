import PeerReview from '../models/PeerReview.js';
import QuizAttempt from '../models/QuizAttempt.js';
import TheorySubmission from '../models/TheorySubmission.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import TokenLedger from '../models/TokenLedger.js';
import CourseProficiency from '../models/CourseProficiency.js';
import { arbitrateDispute } from '../services/arbitrationService.js';

/* ================================================================
   PEER REVIEW CONTROLLER
   ================================================================
   Endpoints:
     GET    /api/reviews/accomplished/:userId        → getAccomplishedTasks
     GET    /api/reviews/solution/:taskId/:userId     → viewSolution
     POST   /api/reviews/upvote                       → upvote
     POST   /api/reviews/downvote                     → downvote
     POST   /api/reviews/:reviewId/respond            → respondToDownvote
     GET    /api/reviews/my-reviews                   → getMyReviews
     GET    /api/reviews/received                     → getReceivedReviews
   ================================================================ */

/**
 * Helper: ensure a CourseProficiency doc exists for a user+course.
 */
async function getOrCreateProficiency(userId, courseId) {
    let prof = await CourseProficiency.findOne({ user: userId, course: courseId });
    if (!prof) {
        prof = await CourseProficiency.create({ user: userId, course: courseId });
    }
    return prof;
}

/**
 * GET /api/reviews/accomplished/:userId
 * List recently accomplished tasks (submitted theory) for a user's profile.
 * Anyone can view these — they're the public "showcase".
 */
export const getAccomplishedTasks = async (req, res) => {
    try {
        const { userId } = req.params;

        const submissions = await TheorySubmission.find({ student: userId })
            .populate({
                path: 'task',
                select: 'title topic type difficulty course',
                populate: { path: 'course', select: 'title courseCode' },
            })
            .populate('quizAttempt', 'mcqScore mcqPassed theoryQuestions status')
            .sort({ createdAt: -1 })
            .limit(20);

        // Attach review summary for each
        const result = await Promise.all(
            submissions.map(async (sub) => {
                const upvotes = await PeerReview.countDocuments({
                    task: sub.task._id, reviewee: userId, type: 'upvote',
                });
                const downvotes = await PeerReview.countDocuments({
                    task: sub.task._id, reviewee: userId, type: 'downvote',
                });
                return {
                    submissionId: sub._id,
                    task: sub.task,
                    quizAttempt: {
                        mcqScore: sub.quizAttempt.mcqScore,
                        mcqPassed: sub.quizAttempt.mcqPassed,
                        theoryQuestionCount: sub.quizAttempt.theoryQuestions?.length || 0,
                        status: sub.quizAttempt.status,
                    },
                    pdf: {
                        originalName: sub.pdf.originalName,
                        uploadedAt: sub.pdf.uploadedAt,
                    },
                    peerReview: { upvotes, downvotes },
                    createdAt: sub.createdAt,
                };
            }),
        );

        return res.status(200).json({ success: true, count: result.length, data: result });
    } catch (err) {
        console.error('❌ getAccomplishedTasks:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/reviews/solution/:taskId/:userId
 * View the theory questions + PDF solution for a specific task by a user.
 * This is what a reviewer sees before deciding to upvote/downvote.
 */
export const viewSolution = async (req, res) => {
    try {
        const { taskId, userId } = req.params;

        const attempt = await QuizAttempt.findOne({ user: userId, task: taskId });
        if (!attempt || attempt.status !== 'submitted') {
            return res.status(404).json({ success: false, message: 'No submitted solution found' });
        }

        const submission = await TheorySubmission.findOne({ student: userId, task: taskId });
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Theory submission not found' });
        }

        const task = await Task.findById(taskId)
            .populate('course', 'title courseCode');

        // Check if current viewer already reviewed
        const viewerId = req.user?.id;
        let existingReview = null;
        if (viewerId) {
            existingReview = await PeerReview.findOne({ reviewer: viewerId, task: taskId });
        }

        return res.status(200).json({
            success: true,
            data: {
                task: {
                    _id: task._id,
                    title: task.title,
                    topic: task.topic,
                    type: task.type,
                    difficulty: task.difficulty,
                    course: task.course,
                },
                theoryQuestions: attempt.theoryQuestions.map((q, i) => ({
                    number: i + 1,
                    question: q,
                })),
                pdf: {
                    originalName: submission.pdf.originalName,
                    storedPath: submission.pdf.storedPath,
                    uploadedAt: submission.pdf.uploadedAt,
                },
                mcqScore: attempt.mcqScore,
                existingReview: existingReview
                    ? { type: existingReview.type, disputeStatus: existingReview.disputeStatus }
                    : null,
            },
        });
    } catch (err) {
        console.error('❌ viewSolution:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/reviews/upvote
 * Body: { taskId, revieweeId, wager }
 * Costs the reviewer `wager` tokens. No score changes.
 */
export const upvote = async (req, res) => {
    try {
        const reviewerId = req.user.id;
        const { taskId, revieweeId, wager } = req.body;

        // ── Validations ──────────────────────────────────────
        if (reviewerId === revieweeId) {
            return res.status(400).json({ success: false, message: 'Cannot review your own submission' });
        }
        if (!wager || wager < 1) {
            return res.status(400).json({ success: false, message: 'Wager must be at least 1 token' });
        }

        // Verify submitted solution exists
        const attempt = await QuizAttempt.findOne({ user: revieweeId, task: taskId });
        if (!attempt || attempt.status !== 'submitted') {
            return res.status(404).json({ success: false, message: 'No submitted solution for this task' });
        }
        const submission = await TheorySubmission.findOne({ student: revieweeId, task: taskId });
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Theory submission not found' });
        }

        // Check for existing review
        const existing = await PeerReview.findOne({ reviewer: reviewerId, task: taskId });
        if (existing) {
            return res.status(409).json({ success: false, message: 'You have already reviewed this task' });
        }

        // Check reviewer has enough tokens
        const reviewer = await User.findById(reviewerId);
        if (reviewer.tokenBalance < wager) {
            return res.status(400).json({
                success: false,
                message: `Insufficient tokens. Need ${wager}, have ${reviewer.tokenBalance}`,
            });
        }

        // Deduct wager
        reviewer.tokenBalance -= wager;
        reviewer.stats.reviewsGiven += 1;
        await TokenLedger.create({
            userId: reviewer._id,
            taskId,
            type: 'peer_wager',
            amount: -wager,
            balanceAfter: reviewer.tokenBalance,
            note: `Upvote wager: ${wager} tokens on task review`,
        });
        await reviewer.save();

        const task = await Task.findById(taskId);

        // Create review
        const review = await PeerReview.create({
            reviewer: reviewerId,
            reviewee: revieweeId,
            task: taskId,
            quizAttempt: attempt._id,
            theorySubmission: submission._id,
            course: task.course,
            type: 'upvote',
            wager,
            disputeStatus: 'none',
            settled: true,
            tokensTransferred: 0,
        });

        // Update reviewee's stats and proficiency
        const reviewee = await User.findById(revieweeId);
        reviewee.stats.upvotesReceived += 1;
        reviewee.recalculateReputation();
        await reviewee.save();

        const prof = await getOrCreateProficiency(revieweeId, task.course);
        prof.upvotesReceived += 1;
        prof.recalculate();
        await prof.save();

        return res.status(201).json({
            success: true,
            message: 'Upvote recorded. Thank you for reviewing!',
            data: {
                reviewId: review._id,
                type: 'upvote',
                wager,
                revieweeReputation: reviewee.reputation,
            },
        });
    } catch (err) {
        console.error('❌ upvote:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/reviews/downvote
 * Body: { taskId, revieweeId, wager, reason }
 * Costs the reviewer `wager` tokens. Reason is compulsory.
 * Reviewee will be notified and can agree or dispute.
 */
export const downvote = async (req, res) => {
    try {
        const reviewerId = req.user.id;
        const { taskId, revieweeId, wager, reason } = req.body;

        // ── Validations ──────────────────────────────────────
        if (reviewerId === revieweeId) {
            return res.status(400).json({ success: false, message: 'Cannot review your own submission' });
        }
        if (!wager || wager < 1) {
            return res.status(400).json({ success: false, message: 'Wager must be at least 1 token' });
        }
        if (!reason || reason.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'Downvote reason must be at least 10 characters' });
        }

        // Verify submitted solution exists
        const attempt = await QuizAttempt.findOne({ user: revieweeId, task: taskId });
        if (!attempt || attempt.status !== 'submitted') {
            return res.status(404).json({ success: false, message: 'No submitted solution for this task' });
        }
        const submission = await TheorySubmission.findOne({ student: revieweeId, task: taskId });
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Theory submission not found' });
        }

        // Check for existing review
        const existing = await PeerReview.findOne({ reviewer: reviewerId, task: taskId });
        if (existing) {
            return res.status(409).json({ success: false, message: 'You have already reviewed this task' });
        }

        // Check reviewer has enough tokens
        const reviewer = await User.findById(reviewerId);
        if (reviewer.tokenBalance < wager) {
            return res.status(400).json({
                success: false,
                message: `Insufficient tokens. Need ${wager}, have ${reviewer.tokenBalance}`,
            });
        }

        // Deduct wager
        reviewer.tokenBalance -= wager;
        reviewer.stats.reviewsGiven += 1;
        await TokenLedger.create({
            userId: reviewer._id,
            taskId,
            type: 'peer_wager',
            amount: -wager,
            balanceAfter: reviewer.tokenBalance,
            note: `Downvote wager: ${wager} tokens on task review`,
        });
        await reviewer.save();

        const task = await Task.findById(taskId);

        // Create review — pending response from reviewee
        const review = await PeerReview.create({
            reviewer: reviewerId,
            reviewee: revieweeId,
            task: taskId,
            quizAttempt: attempt._id,
            theorySubmission: submission._id,
            course: task.course,
            type: 'downvote',
            wager,
            reason: reason.trim(),
            disputeStatus: 'pending_response',
            settled: false,
        });

        // Update reviewee stats (downvote received, but not yet "lost")
        const reviewee = await User.findById(revieweeId);
        reviewee.stats.downvotesReceived += 1;
        reviewee.recalculateReputation();
        await reviewee.save();

        const prof = await getOrCreateProficiency(revieweeId, task.course);
        prof.downvotesReceived += 1;
        prof.recalculate();
        await prof.save();

        return res.status(201).json({
            success: true,
            message: 'Downvote recorded. The student will be notified to respond.',
            data: {
                reviewId: review._id,
                type: 'downvote',
                wager,
                reason: review.reason,
                disputeStatus: review.disputeStatus,
            },
        });
    } catch (err) {
        console.error('❌ downvote:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/reviews/:reviewId/respond
 * Body: { action: 'agree' | 'disagree' }
 * Only the reviewee can respond.
 *
 * AGREE  → reviewee loses task tokens, downvoter gets wager back + reward
 * DISAGREE → AI arbitration triggered
 */
export const respondToDownvote = async (req, res) => {
    try {
        const userId = req.user.id;
        const { reviewId } = req.params;
        const { action } = req.body;

        if (!['agree', 'disagree'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be "agree" or "disagree"' });
        }

        const review = await PeerReview.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }
        if (review.reviewee.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Only the reviewee can respond' });
        }
        if (review.disputeStatus !== 'pending_response') {
            return res.status(400).json({ success: false, message: `Cannot respond. Status: ${review.disputeStatus}` });
        }

        const task = await Task.findById(review.task).populate('course', 'title');
        const reviewer = await User.findById(review.reviewer);
        const reviewee = await User.findById(review.reviewee);

        if (action === 'agree') {
            // ── AGREE: reviewee accepts fault ──────────────────
            review.disputeStatus = 'agreed';
            review.settled = true;

            // Reviewee loses task token stake
            const taskLoss = task.tokenStake;
            reviewee.tokenBalance = Math.max(0, reviewee.tokenBalance - taskLoss);
            reviewee.stats.tokensLost += taskLoss;
            reviewee.stats.downvotesLost += 1;
            reviewee.recalculateReputation();
            await TokenLedger.create({
                userId: reviewee._id, taskId: task._id, type: 'peer_penalty',
                amount: -taskLoss, balanceAfter: reviewee.tokenBalance,
                note: `Agreed to downvote: lost ${taskLoss} tokens for task "${task.title}"`,
            });
            await reviewee.save();

            // Downvoter gets wager back + reward (wager amount as bonus)
            const reward = review.wager;
            reviewer.tokenBalance += review.wager + reward;
            reviewer.stats.tokensEarned += reward;
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_reward',
                amount: review.wager + reward, balanceAfter: reviewer.tokenBalance,
                note: `Downvote upheld (agreed): wager ${review.wager} returned + ${reward} reward`,
            });
            await reviewer.save();

            review.tokensTransferred = taskLoss;
            await review.save();

            // Update course proficiency
            const prof = await getOrCreateProficiency(reviewee._id, task.course);
            prof.downvotesLost += 1;
            prof.recalculate();
            await prof.save();

            return res.status(200).json({
                success: true,
                message: 'You agreed to the downvote. Tokens settled.',
                data: {
                    reviewId: review._id,
                    disputeStatus: 'agreed',
                    tokensLost: taskLoss,
                },
            });
        }

        // ── DISAGREE: trigger AI arbitration ──────────────────
        review.disputeStatus = 'ai_reviewing';
        await review.save();

        // Get theory questions from the quiz attempt
        const attempt = await QuizAttempt.findOne({ _id: review.quizAttempt });
        const submission = await TheorySubmission.findOne({ _id: review.theorySubmission });

        let verdict;
        try {
            verdict = await arbitrateDispute({
                theoryQuestions: attempt.theoryQuestions,
                pdfPath: submission.pdf.storedPath,
                downvoteReason: review.reason,
                taskTitle: task.title,
                taskTopic: task.topic,
                courseName: task.course.title,
            });
        } catch (aiErr) {
            console.error('❌ AI arbitration failed:', aiErr.message);
            // On AI failure, default to reviewee wins (benefit of doubt)
            verdict = {
                decision: 'reviewee_correct',
                reasoning: 'AI arbitration failed. Benefit of the doubt goes to the student.',
                confidence: 0,
            };
        }

        review.aiVerdict = {
            decision: verdict.decision,
            reasoning: verdict.reasoning,
            confidence: verdict.confidence,
            reviewedAt: new Date(),
        };

        if (verdict.decision === 'downvoter_correct') {
            // ── AI sided with downvoter ──────────────────────
            review.disputeStatus = 'resolved_downvoter_wins';
            review.settled = true;

            // Reviewee loses task tokens
            const taskLoss = task.tokenStake;
            reviewee.tokenBalance = Math.max(0, reviewee.tokenBalance - taskLoss);
            reviewee.stats.tokensLost += taskLoss;
            reviewee.stats.downvotesLost += 1;
            reviewee.recalculateReputation();
            await TokenLedger.create({
                userId: reviewee._id, taskId: task._id, type: 'peer_penalty',
                amount: -taskLoss, balanceAfter: reviewee.tokenBalance,
                note: `AI ruled downvoter correct: lost ${taskLoss} tokens for "${task.title}"`,
            });
            await reviewee.save();

            // Downvoter gets wager back + reward
            const reward = review.wager;
            reviewer.tokenBalance += review.wager + reward;
            reviewer.stats.tokensEarned += reward;
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_reward',
                amount: review.wager + reward, balanceAfter: reviewer.tokenBalance,
                note: `AI upheld downvote: wager ${review.wager} returned + ${reward} reward`,
            });
            await reviewer.save();

            review.tokensTransferred = taskLoss;

            // Update proficiency
            const prof = await getOrCreateProficiency(reviewee._id, task.course);
            prof.downvotesLost += 1;
            prof.recalculate();
            await prof.save();
        } else {
            // ── AI sided with reviewee ──────────────────────
            review.disputeStatus = 'resolved_reviewee_wins';
            review.settled = true;

            // Downvoter loses their wager permanently
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_penalty',
                amount: 0, balanceAfter: reviewer.tokenBalance,
                note: `AI ruled reviewee correct: wager of ${review.wager} forfeited`,
            });

            // Reviewee defended successfully
            reviewee.stats.downvotesDefended += 1;
            reviewee.recalculateReputation();
            await reviewee.save();

            review.tokensTransferred = 0;

            // Update proficiency
            const prof = await getOrCreateProficiency(reviewee._id, task.course);
            prof.downvotesDefended += 1;
            prof.recalculate();
            await prof.save();
        }

        await review.save();

        return res.status(200).json({
            success: true,
            message: `AI arbitration complete. Decision: ${verdict.decision === 'downvoter_correct' ? 'Downvoter was correct' : 'Your solution was valid'}`,
            data: {
                reviewId: review._id,
                disputeStatus: review.disputeStatus,
                aiVerdict: review.aiVerdict,
                tokensTransferred: review.tokensTransferred,
            },
        });
    } catch (err) {
        console.error('❌ respondToDownvote:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/reviews/my-reviews
 * List reviews the current user has given.
 */
export const getMyReviews = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

        const reviews = await PeerReview.find({ reviewer: userId })
            .populate('reviewee', 'name email')
            .populate('task', 'title topic difficulty')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await PeerReview.countDocuments({ reviewer: userId });

        return res.status(200).json({
            success: true,
            count: reviews.length,
            total,
            page,
            data: reviews,
        });
    } catch (err) {
        console.error('❌ getMyReviews:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/reviews/received
 * List reviews the current user has received (on their submissions).
 */
export const getReceivedReviews = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

        const reviews = await PeerReview.find({ reviewee: userId })
            .populate('reviewer', 'name email')
            .populate('task', 'title topic difficulty')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await PeerReview.countDocuments({ reviewee: userId });

        // Count pending disputes
        const pendingDisputes = await PeerReview.countDocuments({
            reviewee: userId,
            disputeStatus: 'pending_response',
        });

        return res.status(200).json({
            success: true,
            count: reviews.length,
            total,
            pendingDisputes,
            page,
            data: reviews,
        });
    } catch (err) {
        console.error('❌ getReceivedReviews:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
