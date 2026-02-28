import mongoose from 'mongoose';

const TaskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true },
        topic: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: ['coding', 'reading', 'writing', 'quiz', 'project'],
            required: true,
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            required: true,
        },
        tokenStake: { type: Number, required: true, min: 1 },
        reward: { type: Number, required: true },
        urgencyMultiplier: { type: Number, default: 1.0 },
        durationHours: { type: Number, required: true, max: 4 },
        deadline: { type: Date, required: true },

        // ── Day-by-Day Scheduling ──────────────────────────────
        scheduledDate: {
            type: Date,
            required: true,
            index: true,
        },
        passNumber: {
            type: Number,
            enum: [1, 2, 3],
            default: 1, // 1 = fresh learn, 2 = revision 1, 3 = revision 2
        },
        isRevision: {
            type: Boolean,
            default: false,
        },
        chapterRef: {
            number: { type: Number, default: null },
            title: { type: String, default: '' },
        },
        dayIndex: {
            type: Number,
            default: 0, // 0-based index within the overall schedule
        },

        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
            index: true,
        },
        announcement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Announcement',
            required: true,
        },

        // ── Task lifecycle ─────────────────────────────────────
        source: {
            type: String,
            enum: ['announcement', 'fallback', 'sunday_revision'],
            default: 'announcement',
        },
        status: {
            type: String,
            enum: ['pending', 'in_progress', 'completed', 'expired'],
            default: 'pending',
        },
        completedAt: { type: Date, default: null },

        aiGenerated: { type: Boolean, default: true },
        generationContext: {
            courseName: String,
            creditWeight: Number,
            eventType: String,
            urgency: String,
        },
    },
    { timestamps: true }
);

export default mongoose.model('Task', TaskSchema);
