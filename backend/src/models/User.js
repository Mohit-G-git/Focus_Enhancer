import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/* ================================================================
   USER MODEL — Enriched for frontend-readiness
   ================================================================ */

const MoodEntrySchema = new mongoose.Schema(
    {
        mood: {
            type: String,
            enum: ['happy', 'neutral', 'stressed', 'anxious', 'sad', 'frustrated', 'motivated'],
            required: true,
        },
        recordedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        passwordHash: {
            type: String,
            required: true,
            select: false,
        },

        // ── Student metadata ───────────────────────────────────
        studentId: { type: String, trim: true, sparse: true, unique: true },
        department: { type: String, trim: true },
        semester: { type: Number, min: 1, max: 8 },
        year: { type: Number },
        university: { type: String, trim: true },
        avatar: { type: String, default: null },

        // ── Tokens & Role ──────────────────────────────────────
        tokenBalance: { type: Number, default: 100, min: 0 },
        reputation: { type: Number, default: 0 },
        role: {
            type: String,
            enum: ['student', 'cr', 'admin'],
            default: 'student',
        },
        enrolledCourses: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        ],

        // ── Streak tracking ────────────────────────────────────
        streak: {
            currentDays: { type: Number, default: 0 },
            longestStreak: { type: Number, default: 0 },
            lastActiveDate: { type: Date },
        },
        sundayRevisionCourseIndex: { type: Number, default: 0 },

        // ── Aggregate stats (running averages) ─────────────────
        stats: {
            tasksCompleted: { type: Number, default: 0 },
            quizzesTaken: { type: Number, default: 0 },
            quizzesPassed: { type: Number, default: 0 },
            avgMcqScore: { type: Number, default: 0 },
            tokensEarned: { type: Number, default: 0 },
            tokensLost: { type: Number, default: 0 },
            // ── Peer review stats ──────────────────────────────
            upvotesReceived: { type: Number, default: 0 },
            downvotesReceived: { type: Number, default: 0 },
            downvotesLost: { type: Number, default: 0 },
            downvotesDefended: { type: Number, default: 0 },
            reviewsGiven: { type: Number, default: 0 },
        },

        // ── Wellbeing / mood ───────────────────────────────────
        wellbeing: {
            moodHistory: {
                type: [MoodEntrySchema],
                default: [],
            },
            lastChatAt: { type: Date },
        },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────
UserSchema.index({ department: 1, semester: 1 });

// ── Pre-save: hash password ────────────────────────────────────
UserSchema.pre('save', async function () {
    if (!this.isModified('passwordHash')) return;
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

// ── Methods ────────────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

/** Append a mood entry, capping at 30 (FIFO). */
UserSchema.methods.addMoodEntry = function (mood) {
    if (!this.wellbeing) this.wellbeing = { moodHistory: [] };
    this.wellbeing.moodHistory.push({ mood, recordedAt: new Date() });
    if (this.wellbeing.moodHistory.length > 30) {
        this.wellbeing.moodHistory = this.wellbeing.moodHistory.slice(-30);
    }
};

/** Update running MCQ average after a quiz. */
UserSchema.methods.recordMcqScore = function (score) {
    const s = this.stats;
    const total = s.avgMcqScore * s.quizzesTaken + score;
    s.quizzesTaken += 1;
    s.avgMcqScore = Math.round((total / s.quizzesTaken) * 100) / 100;
};

/**
 * Recompute reputation from aggregate stats.
 *
 * Formula:
 *   rep = (upvotes × 10) − (downvotesLost × 15) + (downvotesDefended × 5)
 *       + (quizzesPassed × 3) − (tokensLost / 10)
 *       + (tasksCompleted × 2)
 * Clamped to 0 minimum.
 */
UserSchema.methods.recalculateReputation = function () {
    const s = this.stats;
    this.reputation = Math.max(
        0,
        Math.round(
            s.upvotesReceived * 10
            - s.downvotesLost * 15
            + s.downvotesDefended * 5
            + s.quizzesPassed * 3
            - s.tokensLost / 10
            + s.tasksCompleted * 2,
        ),
    );
    return this.reputation;
};

/** Bump streak if active today; reset if gap > 1 day. */
UserSchema.methods.updateStreak = function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last = this.streak.lastActiveDate
        ? new Date(this.streak.lastActiveDate)
        : null;

    if (last) {
        last.setHours(0, 0, 0, 0);
        const diffDays = Math.round((today - last) / 864e5);
        if (diffDays === 0) return;
        if (diffDays === 1) {
            this.streak.currentDays += 1;
        } else {
            this.streak.currentDays = 1;
        }
    } else {
        this.streak.currentDays = 1;
    }
    this.streak.lastActiveDate = today;
    if (this.streak.currentDays > (this.streak.longestStreak || 0)) {
        this.streak.longestStreak = this.streak.currentDays;
    }
};

export default mongoose.model('User', UserSchema);
