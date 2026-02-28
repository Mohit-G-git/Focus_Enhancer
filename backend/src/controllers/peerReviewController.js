import PeerReview from '../models/PeerReview.js';
import QuizAttempt from '../models/QuizAttempt.js';
import TheorySubmission from '../models/TheorySubmission.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import TokenLedger from '../models/TokenLedger.js';
import CourseProficiency from '../models/CourseProficiency.js';
import { arbitrateDispute, checkRemarkQuality } from '../services/arbitrationService.js';

/* ================================================================
   PEER REVIEW CONTROLLER — Wager-Gated Review System
   ================================================================
   POST   /api/reviews/unlock                → unlockSolution
   POST   /api/reviews/:reviewId/vote        → castVote
   POST   /api/reviews/:reviewId/respond     → respondToDownvote
   GET    /api/reviews/solution/:taskId/:uid → viewSolution
   GET    /api/reviews/accomplished/:userId  → getAccomplishedTasks
   GET    /api/reviews/my-reviews            → getMyReviews
   GET    /api/reviews/received              → getReceivedReviews
   ================================================================ */

async function getOrCreateProficiency(userId, courseId) {
    let prof = await CourseProficiency.findOne({ user: userId, course: courseId });
    if (!prof) prof = await CourseProficiency.create({ user: userId, course: courseId });
    return prof;
}

/* ────────────────────────────────────────────────────────────────
   GET /api/reviews/accomplished/:userId
   Public showcase of a user's submitted theory work.
   ──────────────────────────────────────────────────────────────── */
export const getAccomplishedTasks = async (req, res) => {
    try {
        const { userId } = req.params;

        const submissions = await TheorySubmission.find({ student: userId })
            .populate({
                path: 'task',
                select: 'title topic type difficulty course tokenStake reward',
                populate: { path: 'course', select: 'title courseCode' },
            })
            .populate('quizAttempt', 'mcqScore mcqPassed theoryQuestions status')
            .sort({ createdAt: -1 })
            .limit(20);

        const result = await Promise.all(
            submissions.map(async (sub) => {
                const upvotes = await PeerReview.countDocuments({ task: sub.task._id, reviewee: userId, type: 'upvote' });
                const downvotes = await PeerReview.countDocuments({ task: sub.task._id, reviewee: userId, type: 'downvote' });
                return {
                    submissionId: sub._id,
                    task: sub.task,
                    quizAttempt: {
                        mcqScore: sub.quizAttempt.mcqScore,
                        mcqPassed: sub.quizAttempt.mcqPassed,
                        theoryQuestionCount: sub.quizAttempt.theoryQuestions?.length || 0,
                        status: sub.quizAttempt.status,
                    },
                    pdf: { originalName: sub.pdf.originalName, uploadedAt: sub.pdf.uploadedAt },
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

/* ────────────────────────────────────────────────────────────────
   GET /api/reviews/solution/:taskId/:userId
   View theory questions. PDF path is ONLY returned if the viewer
   has already unlocked (i.e., has an existing PeerReview record).
   ──────────────────────────────────────────────────────────────── */
export const viewSolution = async (req, res) => {
    try {
        const { taskId, userId } = req.params;

        const attempt = await QuizAttempt.findOne({ user: userId, task: taskId }).sort({ createdAt: -1 });
        if (!attempt || attempt.status !== 'submitted') {
            return res.status(404).json({ success: false, message: 'No submitted solution found' });
        }

        const submission = await TheorySubmission.findOne({ student: userId, task: taskId });
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Theory submission not found' });
        }

        const task = await Task.findById(taskId).populate('course', 'title courseCode');

        // Check if current viewer already has a review
        const viewerId = req.user?.id;
        let existingReview = null;
        if (viewerId) {
            existingReview = await PeerReview.findOne({ reviewer: viewerId, task: taskId });
        }

        // Gate PDF path behind unlock
        const pdfData = existingReview
            ? { originalName: submission.pdf.originalName, storedPath: submission.pdf.storedPath, uploadedAt: submission.pdf.uploadedAt }
            : { originalName: submission.pdf.originalName, uploadedAt: submission.pdf.uploadedAt, locked: true };

        return res.status(200).json({
            success: true,
            data: {
                task: {
                    _id: task._id, title: task.title, topic: task.topic,
                    type: task.type, difficulty: task.difficulty, course: task.course,
                    tokenStake: task.tokenStake, reward: task.reward,
                },
                theoryQuestions: attempt.theoryQuestions.map((q, i) => ({ number: i + 1, question: q })),
                pdf: pdfData,
                mcqScore: attempt.mcqScore,
                existingReview: existingReview
                    ? {
                        _id: existingReview._id,
                        type: existingReview.type,
                        wager: existingReview.wager,
                        reason: existingReview.reason,
                        remarkCheck: existingReview.remarkCheck,
                        disputeStatus: existingReview.disputeStatus,
                        aiVerdict: existingReview.aiVerdict,
                        settled: existingReview.settled,
                    }
                    : null,
            },
        });
    } catch (err) {
        console.error('❌ viewSolution:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/* ────────────────────────────────────────────────────────────────
   POST /api/reviews/unlock
   Body: { taskId, revieweeId, wager }
   Pay wager to unlock the PDF. Creates PeerReview type='pending'.
   ──────────────────────────────────────────────────────────────── */
export const unlockSolution = async (req, res) => {
    try {
        const reviewerId = req.user.id;
        const { taskId, revieweeId, wager } = req.body;

        if (reviewerId === revieweeId) {
            return res.status(400).json({ success: false, message: 'Cannot review your own submission' });
        }
        if (!wager || wager < 1) {
            return res.status(400).json({ success: false, message: 'Wager must be at least 1 token' });
        }

        const attempt = await QuizAttempt.findOne({ user: revieweeId, task: taskId }).sort({ createdAt: -1 });
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
            return res.status(409).json({ success: false, message: 'You have already unlocked/reviewed this task' });
        }

        // Check reviewer balance
        const reviewer = await User.findById(reviewerId);
        if (reviewer.tokenBalance < wager) {
            return res.status(400).json({
                success: false,
                message: `Insufficient tokens. Need ${wager}, have ${reviewer.tokenBalance}`,
            });
        }

        // Deduct wager
        reviewer.tokenBalance -= wager;
        await TokenLedger.create({
            userId: reviewer._id, taskId, type: 'peer_wager',
            amount: -wager, balanceAfter: reviewer.tokenBalance,
            note: `Unlock wager: ${wager} tokens to view PDF for peer review`,
        });
        await reviewer.save();

        const task = await Task.findById(taskId);

        const review = await PeerReview.create({
            reviewer: reviewerId,
            reviewee: revieweeId,
            task: taskId,
            quizAttempt: attempt._id,
            theorySubmission: submission._id,
            course: task.course,
            type: 'pending',
            wager,
            disputeStatus: 'none',
            settled: false,
        });

        return res.status(201).json({
            success: true,
            message: `PDF unlocked! ${wager} tokens wagered.`,
            data: {
                reviewId: review._id,
                pdf: {
                    originalName: submission.pdf.originalName,
                    storedPath: submission.pdf.storedPath,
                    uploadedAt: submission.pdf.uploadedAt,
                },
            },
        });
    } catch (err) {
        console.error('❌ unlockSolution:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/* ────────────────────────────────────────────────────────────────
   POST /api/reviews/:reviewId/vote
   Body: { type: 'upvote'|'downvote', reason? }
   Upvote  → wager returned (free review, net 0)
   Downvote → AI checks remark, then pipeline starts
   ──────────────────────────────────────────────────────────────── */
export const castVote = async (req, res) => {
    try {
        const reviewerId = req.user.id;
        const { reviewId } = req.params;
        const { type, reason } = req.body;

        const review = await PeerReview.findById(reviewId);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        if (review.reviewer.toString() !== reviewerId) {
            return res.status(403).json({ success: false, message: 'Not your review' });
        }
        if (review.type !== 'pending') {
            return res.status(400).json({ success: false, message: 'Vote already cast' });
        }

        const reviewer = await User.findById(reviewerId);
        const reviewee = await User.findById(review.reviewee);
        const task = await Task.findById(review.task).populate('course', 'title');

        /* ── UPVOTE ──────────────────────────────────────────── */
        if (type === 'upvote') {
            review.type = 'upvote';
            review.settled = true;
            review.tokensTransferred = 0;

            // Return wager (net: 0 for reviewer)
            reviewer.tokenBalance += review.wager;
            reviewer.stats.reviewsGiven += 1;
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_reward',
                amount: review.wager, balanceAfter: reviewer.tokenBalance,
                note: `Upvote: wager of ${review.wager} returned`,
            });
            await reviewer.save();

            // Reviewee reputation bump
            reviewee.stats.upvotesReceived += 1;
            reviewee.recalculateReputation();
            await reviewee.save();

            const prof = await getOrCreateProficiency(review.reviewee, task.course);
            prof.upvotesReceived += 1;
            prof.recalculate();
            await prof.save();

            await review.save();

            return res.status(200).json({
                success: true,
                message: 'Upvote recorded. Wager returned — no cost to you!',
                data: { type: 'upvote', wagerReturned: review.wager },
            });
        }

        /* ── DOWNVOTE ────────────────────────────────────────── */
        if (!reason || reason.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'Downvote remark must be at least 10 characters' });
        }

        review.reason = reason.trim();
        review.type = 'downvote';
        reviewer.stats.reviewsGiven += 1;

        // Step 1: AI remark quality check (profanity / spam)
        let remarkResult;
        try {
            remarkResult = await checkRemarkQuality({
                remark: reason.trim(),
                taskTitle: task.title,
                taskTopic: task.topic,
                courseName: task.course.title,
            });
        } catch (aiErr) {
            console.error('❌ Remark check AI failed:', aiErr.message);
            remarkResult = { verdict: 'pass', reasoning: 'AI check failed — defaulting to pass.' };
        }

        review.remarkCheck = {
            status: remarkResult.verdict === 'pass' ? 'passed' : 'rejected',
            reasoning: remarkResult.reasoning,
            checkedAt: new Date(),
        };

        if (remarkResult.verdict === 'reject') {
            // ── SPAM / PROFANITY: reviewer loses wager + 10 penalty ──
            const SPAM_PENALTY = 10;
            review.disputeStatus = 'remark_rejected';
            review.settled = true;

            reviewer.tokenBalance = Math.max(0, reviewer.tokenBalance - SPAM_PENALTY);
            reviewer.stats.tokensLost += review.wager + SPAM_PENALTY;
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_penalty',
                amount: -SPAM_PENALTY, balanceAfter: reviewer.tokenBalance,
                note: `Remark rejected (spam/profanity): wager ${review.wager} forfeited + ${SPAM_PENALTY} penalty`,
            });
            await reviewer.save();
            await review.save();

            return res.status(200).json({
                success: true,
                message: `Remark rejected: ${remarkResult.reasoning}. You lost ${review.wager + SPAM_PENALTY} tokens.`,
                data: { type: 'downvote', remarkStatus: 'rejected', totalLost: review.wager + SPAM_PENALTY },
            });
        }

        // ── Remark passed → notify reviewee ─────────────────────
        review.disputeStatus = 'pending_response';
        review.settled = false;

        reviewee.stats.downvotesReceived += 1;
        reviewee.recalculateReputation();
        await reviewee.save();

        await reviewer.save();
        await review.save();

        const prof = await getOrCreateProficiency(review.reviewee, task.course);
        prof.downvotesReceived += 1;
        prof.recalculate();
        await prof.save();

        return res.status(201).json({
            success: true,
            message: 'Downvote recorded. The student will be notified to respond.',
            data: { type: 'downvote', remarkStatus: 'passed', disputeStatus: 'pending_response' },
        });
    } catch (err) {
        console.error('❌ castVote:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/* ────────────────────────────────────────────────────────────────
   POST /api/reviews/:reviewId/respond
   Body: { action: 'agree' | 'disagree' }
   Only the reviewee can respond to a pending downvote.

   AGREE →
     Reviewer gets wager back.
     Reviewee loses task.tokenStake (the task's stake value).

   DISAGREE → AI arbitration
     AI says solution correct → reviewer loses wager
     AI says solution wrong  → reviewer gets wager back,
       reviewee loses task.reward (tokens earned) + reputation hit
   ──────────────────────────────────────────────────────────────── */
export const respondToDownvote = async (req, res) => {
    try {
        const userId = req.user.id;
        const { reviewId } = req.params;
        const { action } = req.body;

        if (!['agree', 'disagree'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be "agree" or "disagree"' });
        }

        const review = await PeerReview.findById(reviewId);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        if (review.reviewee.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Only the reviewee can respond' });
        }
        if (review.disputeStatus !== 'pending_response') {
            return res.status(400).json({ success: false, message: `Cannot respond. Status: ${review.disputeStatus}` });
        }

        const task = await Task.findById(review.task).populate('course', 'title');
        const reviewer = await User.findById(review.reviewer);
        const reviewee = await User.findById(review.reviewee);

        /* ── AGREE ─────────────────────────────────────────── */
        if (action === 'agree') {
            review.disputeStatus = 'agreed';
            review.settled = true;

            // Reviewee loses task.tokenStake
            const taskLoss = task.tokenStake;
            reviewee.tokenBalance = Math.max(0, reviewee.tokenBalance - taskLoss);
            reviewee.stats.tokensLost += taskLoss;
            reviewee.stats.downvotesLost += 1;
            reviewee.recalculateReputation();
            await TokenLedger.create({
                userId: reviewee._id, taskId: task._id, type: 'peer_penalty',
                amount: -taskLoss, balanceAfter: reviewee.tokenBalance,
                note: `Agreed to downvote: lost ${taskLoss} tokens (task value) for "${task.title}"`,
            });
            await reviewee.save();

            // Reviewer gets wager back
            reviewer.tokenBalance += review.wager;
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_reward',
                amount: review.wager, balanceAfter: reviewer.tokenBalance,
                note: `Downvote upheld (agreed): wager ${review.wager} returned`,
            });
            await reviewer.save();

            review.tokensTransferred = taskLoss;
            await review.save();

            const prof = await getOrCreateProficiency(reviewee._id, task.course);
            prof.downvotesLost += 1;
            prof.recalculate();
            await prof.save();

            return res.status(200).json({
                success: true,
                message: `You agreed to the downvote. Lost ${taskLoss} tokens.`,
                data: { disputeStatus: 'agreed', tokensLost: taskLoss },
            });
        }

        /* ── DISAGREE → AI ARBITRATION ─────────────────────── */
        review.disputeStatus = 'ai_reviewing';
        await review.save();

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
            /* ── AI sided with downvoter ────────────────────── */
            review.disputeStatus = 'resolved_downvoter_wins';
            review.settled = true;

            // Reviewer gets wager back
            reviewer.tokenBalance += review.wager;
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_reward',
                amount: review.wager, balanceAfter: reviewer.tokenBalance,
                note: `AI upheld downvote: wager ${review.wager} returned`,
            });
            await reviewer.save();

            // Reviewee loses tokens earned from the task + reputation hit
            const tokenLoss = task.reward;
            reviewee.tokenBalance = Math.max(0, reviewee.tokenBalance - tokenLoss);
            reviewee.stats.tokensLost += tokenLoss;
            reviewee.stats.downvotesLost += 1;

            // Reputation penalty: loss = ceil(5 + √rep × 2)
            const repLoss = reviewee.applyReputationPenalty();

            await TokenLedger.create({
                userId: reviewee._id, taskId: task._id, type: 'peer_penalty',
                amount: -tokenLoss, balanceAfter: reviewee.tokenBalance,
                note: `AI ruled solution wrong: lost ${tokenLoss} tokens (task reward) + ${repLoss} reputation for "${task.title}"`,
            });
            await reviewee.save();

            review.tokensTransferred = tokenLoss;

            const prof = await getOrCreateProficiency(reviewee._id, task.course);
            prof.downvotesLost += 1;
            prof.recalculate();
            await prof.save();
        } else {
            /* ── AI sided with reviewee ─────────────────────── */
            review.disputeStatus = 'resolved_reviewee_wins';
            review.settled = true;

            // Reviewer loses wager permanently
            await TokenLedger.create({
                userId: reviewer._id, taskId: task._id, type: 'peer_penalty',
                amount: 0, balanceAfter: reviewer.tokenBalance,
                note: `AI ruled solution correct: wager of ${review.wager} forfeited`,
            });

            reviewee.stats.downvotesDefended += 1;
            reviewee.recalculateReputation();
            await reviewee.save();

            review.tokensTransferred = 0;

            const prof = await getOrCreateProficiency(reviewee._id, task.course);
            prof.downvotesDefended += 1;
            prof.recalculate();
            await prof.save();
        }

        await review.save();

        return res.status(200).json({
            success: true,
            message: `AI arbitration complete. ${verdict.decision === 'downvoter_correct' ? 'The downvoter was correct.' : 'Your solution was valid.'}`,
            data: {
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

/* ────────────────────────────────────────────────────────────────
   GET /api/reviews/my-reviews
   ──────────────────────────────────────────────────────────────── */
export const getMyReviews = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

        const reviews = await PeerReview.find({ reviewer: userId, type: { $ne: 'pending' } })
            .populate('reviewee', 'name email')
            .populate('task', 'title topic difficulty')
            .sort({ createdAt: -1 })
            .limit(limit);

        return res.status(200).json({ success: true, count: reviews.length, data: reviews });
    } catch (err) {
        console.error('❌ getMyReviews:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/* ────────────────────────────────────────────────────────────────
   GET /api/reviews/received
   ──────────────────────────────────────────────────────────────── */
export const getReceivedReviews = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

        const reviews = await PeerReview.find({ reviewee: userId, type: { $ne: 'pending' } })
            .populate('reviewer', 'name email')
            .populate('task', 'title topic difficulty tokenStake reward')
            .sort({ createdAt: -1 })
            .limit(limit);

        const pendingDisputes = await PeerReview.countDocuments({
            reviewee: userId,
            disputeStatus: 'pending_response',
        });

        return res.status(200).json({
            success: true,
            count: reviews.length,
            pendingDisputes,
            data: reviews,
        });
    } catch (err) {
        console.error('❌ getReceivedReviews:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
