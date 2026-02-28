import mongoose from 'mongoose';

/**
 * ============================================================
 *  CONVERSATION MODEL — Personalized Student Chatbot
 * ============================================================
 *
 *  Each document is ONE conversation thread for a user.
 *  A user can have multiple conversations (like ChatGPT).
 *  Messages alternate between 'user' and 'assistant'.
 *
 *  The model also tracks:
 *    - conversation title (auto-generated from first message)
 *    - mood tag (detected from conversation context)
 *    - category (academic / emotional / doubt / general)
 * ============================================================
 */

const MessageSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const ConversationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        title: {
            type: String,
            default: 'New Conversation',
            trim: true,
        },
        messages: {
            type: [MessageSchema],
            default: [],
        },
        // Auto-detected from conversation context
        category: {
            type: String,
            enum: ['academic', 'emotional', 'doubt', 'general'],
            default: 'general',
        },
        // Last detected mood — helps personalize future responses
        mood: {
            type: String,
            enum: ['happy', 'neutral', 'stressed', 'anxious', 'sad', 'frustrated', 'motivated', null],
            default: null,
        },
        // Which course this conversation is about (if any)
        relatedCourse: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Compound index for efficient listing
ConversationSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model('Conversation', ConversationSchema);
