import mongoose from 'mongoose';

const crComplaintSchema = new mongoose.Schema({
    complainant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    cr:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['false_announcement', 'missing_announcement'],
        required: true,
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: {
        type: String,
        enum: ['pending', 'resolved', 'dismissed'],
        default: 'pending',
    },
}, { timestamps: true });

// One complaint per student per course per CR tenure
crComplaintSchema.index({ complainant: 1, course: 1, cr: 1 }, { unique: true });

export default mongoose.model('CRComplaint', crComplaintSchema);
