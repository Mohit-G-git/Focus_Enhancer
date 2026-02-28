import mongoose from 'mongoose';

/* ================================================================
   PEER REVIEW MODEL — Upvote / Downvote + Dispute Arbitration
   ================================================================
   Flow:
     1. Reviewer sees an accomplished task (submitted theory)
     2. They can UPVOTE (costs wager, no score change) or DOWNVOTE
     3. DOWNVOTE requires a reason + wager (compulsory token bet)
     4. Downvoted user can AGREE (loses task tokens) or DISAGREE
     5. On DISAGREE → AI arbitrates using solution PDF vs question
     6. If AI sides with downvoter → downvoted loses task tokens,
        downvoter gains their wager
     7. If AI sides with reviewee → downvoter loses wager,
        reviewee keeps tokens
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
            enum: ['upvote', 'downvote'],
            required: true,
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

        // ── Dispute flow (downvotes only) ─────────────────────
        disputeStatus: {
            type: String,
            enum: [
                'none',              // upvote — no dispute possible
                'pending_response',  // downvote cast, awaiting reviewee
                'agreed',            // reviewee accepted the downvote
                'disputed',          // reviewee disagreed → AI called
                'ai_reviewing',      // AI is analysing
                'resolved_downvoter_wins',  // AI sided with downvoter
                'resolved_reviewee_wins',   // AI sided with reviewee
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
