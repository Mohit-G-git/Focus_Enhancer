import mongoose from 'mongoose';

/* ================================================================
   THEORY SUBMISSION MODEL — Handwritten theory answer uploads
   ================================================================
   Students upload a PDF of handwritten answers after passing MCQ.
   AI grading is applied per-question with a total score.
   ================================================================ */

const QuestionBreakdownSchema = new mongoose.Schema(
    {
        questionIndex: { type: Number, required: true },
        score: { type: Number, default: 0 },
        maxScore: { type: Number, default: 10 },
        feedback: { type: String, default: '' },
    },
    { _id: false }
);

const TheorySubmissionSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
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
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
        },

        // ── PDF ────────────────────────────────────────────────
        pdf: {
            originalName: { type: String, required: true },
            storedPath: { type: String, required: true },
            sizeBytes: { type: Number, default: 0 },
            uploadedAt: { type: Date, default: Date.now },
        },

        // ── AI Grading ────────────────────────────────────────
        aiGrading: {
            status: {
                type: String,
                enum: ['pending', 'grading', 'graded', 'failed'],
                default: 'pending',
            },
            totalScore: { type: Number, default: 0 },
            maxScore: { type: Number, default: 70 },
            feedback: { type: String, default: '' },
            questionBreakdown: { type: [QuestionBreakdownSchema], default: [] },
            gradedAt: { type: Date },
        },

        tokensAwarded: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// One submission per student per task
TheorySubmissionSchema.index({ student: 1, task: 1 }, { unique: true });

export default mongoose.model('TheorySubmission', TheorySubmissionSchema);
