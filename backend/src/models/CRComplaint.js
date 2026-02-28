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
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending',
    },
}, { timestamps: true });

crComplaintSchema.index({ complainant: 1, course: 1, status: 1 });

export default mongoose.model('CRComplaint', crComplaintSchema);
