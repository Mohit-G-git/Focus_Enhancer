import mongoose from 'mongoose';

/* ================================================================
   COURSE MODEL — Enriched for frontend-readiness
   ================================================================ */

const CourseSchema = new mongoose.Schema(
    {
        courseCode: {
            type: String,
            required: [true, 'Course code is required'],
            unique: true,
            uppercase: true,
            trim: true,
        },
        title: {
            type: String,
            required: [true, 'Course title is required'],
            trim: true,
        },
        department: { type: String, trim: true },
        semester: { type: Number, min: 1, max: 8 },
        year: { type: Number },

        durationType: {
            type: String,
            enum: ['full', 'fractal'],
            required: true,
            default: 'full',
        },
        totalWeeks: { type: Number, default: 16 },
        creditWeight: {
            type: Number,
            required: true,
            min: 1,
            max: 6,
            default: 3,
        },
        syllabus: { type: String, default: '' },
        instructor: { type: String, default: '' },

        // ── Book ───────────────────────────────────────────────
        bookPdfPath: { type: String, default: null },
        bookTitle: { type: String, default: '' },
        book: {
            originalName: { type: String, default: '' },
            storedPath: { type: String, default: '' },
            sizeBytes: { type: Number, default: 0 },
            uploadedAt: { type: Date },
            uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        },

        // ── People ─────────────────────────────────────────────
        courseRep: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        enrolledStudents: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        ],

        // ── Chapter Tracking ───────────────────────────────────
        chapters: [
            {
                number: { type: Number, required: true },
                title: { type: String, required: true },
            },
        ],
        currentChapterIndex: { type: Number, default: 0 },
        lastFallbackTaskDate: { type: Date, default: null },
        weeklyChapterStartDate: { type: Date, default: null },
        lastAnnouncementDate: { type: Date, default: null },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────
CourseSchema.index({ department: 1, semester: 1 });
CourseSchema.index({ courseRep: 1 });

// ── Pre-save: sync totalWeeks with durationType ────────────────
CourseSchema.pre('save', function () {
    if (this.isModified('durationType')) {
        this.totalWeeks = this.durationType === 'full' ? 16 : 8;
    }
});

// ── Virtual: chapterCount ──────────────────────────────────────
CourseSchema.virtual('chapterCount').get(function () {
    return this.chapters?.length || 0;
});
CourseSchema.set('toJSON', { virtuals: true });
CourseSchema.set('toObject', { virtuals: true });

export default mongoose.model('Course', CourseSchema);
