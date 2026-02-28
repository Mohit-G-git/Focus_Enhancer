import mongoose from 'mongoose';

/* ================================================================
   COURSE PROFICIENCY MODEL — Per-user per-course skill metric
   ================================================================
   Tracks a student's performance within a specific course based
   on peer review outcomes and task completion.

   proficiencyScore = weighted combination of:
     - Upvotes received (positive signal)
     - Downvotes lost (negative signal)
     - Tasks completed vs total tasks attempted
     - Quiz pass rate for the course
   ================================================================ */

const CourseProficiencySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
        },

        // ── Peer review metrics ───────────────────────────────
        upvotesReceived: { type: Number, default: 0 },
        downvotesReceived: { type: Number, default: 0 },
        downvotesLost: { type: Number, default: 0 },       // AI sided with downvoter
        downvotesDefended: { type: Number, default: 0 },    // AI sided with reviewee

        // ── Task & quiz metrics ───────────────────────────────
        tasksCompleted: { type: Number, default: 0 },
        tasksAttempted: { type: Number, default: 0 },
        quizzesPassed: { type: Number, default: 0 },
        quizzesFailed: { type: Number, default: 0 },

        // ── Computed score ────────────────────────────────────
        proficiencyScore: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// One proficiency doc per user per course
CourseProficiencySchema.index({ user: 1, course: 1 }, { unique: true });
// Leaderboard queries: sort by score within a course
CourseProficiencySchema.index({ course: 1, proficiencyScore: -1 });

/**
 * Recompute the proficiency score from raw metrics.
 *
 * Formula:
 *   score = (upvotes × 10) − (downvotesLost × 15) + (downvotesDefended × 5)
 *         + (tasksCompleted × 3) − (quizzesFailed × 2)
 *         + (quizzesPassed × 5)
 *
 * Clamped to 0 minimum.
 */
CourseProficiencySchema.methods.recalculate = function () {
    this.proficiencyScore = Math.max(
        0,
        this.upvotesReceived * 10
        - this.downvotesLost * 15
        + this.downvotesDefended * 5
        + this.tasksCompleted * 3
        - this.quizzesFailed * 2
        + this.quizzesPassed * 5,
    );
    return this.proficiencyScore;
};

export default mongoose.model('CourseProficiency', CourseProficiencySchema);
