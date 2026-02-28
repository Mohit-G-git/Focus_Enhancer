import mongoose from 'mongoose';

const AnnouncementSchema = new mongoose.Schema(
    {
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
            index: true,
        },
        eventType: {
            type: String,
            enum: ['quiz', 'assignment', 'midterm', 'final', 'lecture', 'lab'],
            required: true,
        },
        title: {
            type: String,
            required: [true, 'Announcement title is required'],
            trim: true,
        },
        topics: {
            type: [String],
            required: true,
            validate: {
                validator: (arr) => arr.length > 0,
                message: 'At least one topic is required',
            },
        },
        eventDate: {
            type: Date,
            required: [true, 'Event date is required'],
        },
        description: { type: String, default: '' },
        anonymous: { type: Boolean, default: true },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        tasksGenerated: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export default mongoose.model('Announcement', AnnouncementSchema);
