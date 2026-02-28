import mongoose from 'mongoose';

const MCQSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        options: {
            type: [String],
            required: true,
            validate: { validator: (a) => a.length === 4, message: '4 options required' },
        },
        correctAnswer: { type: Number, required: true, min: 0, max: 3 },
    },
    { _id: false }
);

const MCQResponseSchema = new mongoose.Schema(
    {
        questionIndex: { type: Number, required: true },
        selectedAnswer: { type: Number, default: null },
        answeredAt: { type: Date, default: null },
        timeTakenMs: { type: Number, default: null },
        isCorrect: { type: Boolean, default: null },
        points: { type: Number, default: 0 },
    },
    { _id: false }
);

const QuizAttemptSchema = new mongoose.Schema(
    {
        user: {
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
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
        },
        theorySubmission: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TheorySubmission',
        },
        mcqs: {
            type: [MCQSchema],
            required: true,
            validate: { validator: (a) => a.length === 6, message: '6 MCQs required' },
        },
        mcqResponses: { type: [MCQResponseSchema], default: [] },
        mcqStartedAt: { type: Date, required: true },
        timePerQuestion: { type: Number, default: 15 },
        mcqScore: { type: Number, default: 0 },
        mcqPassed: { type: Boolean, default: null },
        theoryQuestions: { type: [String], default: [] },
        theorySubmissionPath: { type: String, default: null },
        theorySubmittedAt: { type: Date, default: null },
        status: {
            type: String,
            enum: ['mcq_in_progress', 'mcq_completed', 'theory_pending', 'submitted', 'failed'],
            default: 'mcq_in_progress',
        },
        attemptNumber: { type: Number, default: 1, min: 1 },
        effectiveStake: { type: Number, default: null }, // decayed stake for this attempt
        tokenSettled: { type: Boolean, default: false },
        tokensAwarded: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Allow multiple attempts per user+task (non-unique compound index for fast lookups)
QuizAttemptSchema.index({ user: 1, task: 1 });

export default mongoose.model('QuizAttempt', QuizAttemptSchema);
