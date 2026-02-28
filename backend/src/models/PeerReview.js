import mongoose from 'mongoose';

/* ================================================================
   PEER REVIEW MODEL — Wager-gated PDF unlock + Upvote / Downvote
   ================================================================
   Flow:
     1. Reviewer pays wager to UNLOCK the PDF  → type: 'pending'
     2. UPVOTE  → wager returned (net 0), reviewee gains reputation
     3. DOWNVOTE → remark required
        a. AI checks remark for profanity/spam
           • Rejected → reviewer loses wager + 10-token penalty
        b. Remark passes → reviewee notified (pending_response)
           • AGREE → reviewer gets wager back, reviewee loses task.tokenStake
           • DISAGREE → AI arbitration
              - Solution correct → reviewer loses wager
              - Solution wrong → reviewer gets wager back,
                reviewee loses task.reward + reputation hit
   ================================================================ */

const PeerReviewSchema = new mongoose.Schema(
    {
        // ── Participants ──────────────────────────────────────
        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        reviewee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // ── What is being reviewed ────────────────────────────
        task: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
        },
        quizAttempt: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'QuizAttempt',
            required: true,
        },
        theorySubmission: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TheorySubmission',
            required: true,
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
            index: true,
        },

        // ── Review details ────────────────────────────────────
        type: {
            type: String,
            enum: ['pending', 'upvote', 'downvote'],
            default: 'pending',
        },
        wager: {
            type: Number,
            required: true,
            min: 1,
        },
        reason: {
            type: String,
            default: '',
            trim: true,
        },

        // ── AI remark quality check (profanity/spam) ──────────
        remarkCheck: {
            status: {
                type: String,
                enum: ['none', 'passed', 'rejected'],
                default: 'none',
            },
            reasoning: { type: String, default: '' },
            checkedAt: { type: Date, default: null },
        },

        // ── Dispute flow (downvotes only) ─────────────────────
        disputeStatus: {
            type: String,
            enum: [
                'none',              // pending / upvote — no dispute
                'remark_rejected',   // AI flagged remark as spam/profanity
                'pending_response',  // downvote cast, awaiting reviewee
                'agreed',            // reviewee accepted the downvote
                'ai_reviewing',      // AI is analysing the dispute
                'resolved_downvoter_wins',
                'resolved_reviewee_wins',
            ],
            default: 'none',
        },
        aiVerdict: {
            decision: {
                type: String,
                enum: ['downvoter_correct', 'reviewee_correct', null],
                default: null,
            },
            reasoning: { type: String, default: '' },
            confidence: { type: Number, min: 0, max: 1, default: null },
            reviewedAt: { type: Date, default: null },
        },

        // ── Token settlement ──────────────────────────────────
        settled: { type: Boolean, default: false },
        tokensTransferred: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// One review per reviewer per task
PeerReviewSchema.index({ reviewer: 1, task: 1 }, { unique: true });
// Efficient queries for a user's received reviews
PeerReviewSchema.index({ reviewee: 1, type: 1 });

export default mongoose.model('PeerReview', PeerReviewSchema);
