import mongoose from 'mongoose';

/**
 * ============================================================
 *  DIRECT CONVERSATION MODEL — User-to-User Messaging
 * ============================================================
 *
 *  Lifecycle:
 *    1. User A sends a chat request → status: 'requested'
 *    2. User B accepts → status: 'active', messages can flow
 *    3. Either user ends it → status: 'ended'
 *
 *  Constraints:
 *    - Exactly 2 participants per conversation
 *    - Only the NON-initiator can accept / reject
 *    - Only active conversations accept new messages
 * ============================================================
 */

const DirectMessageSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

const DirectConversationSchema = new mongoose.Schema(
    {
        participants: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            validate: {
                validator: (v) => v.length === 2,
                message: 'A direct conversation must have exactly 2 participants',
            },
            required: true,
        },
        initiator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['requested', 'active', 'ended'],
            default: 'requested',
            index: true,
        },
        messages: {
            type: [DirectMessageSchema],
            default: [],
        },
        acceptedAt: { type: Date, default: null },
        endedAt: { type: Date, default: null },
        endedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────
DirectConversationSchema.index({ participants: 1, status: 1 });
DirectConversationSchema.index({ initiator: 1 });

export default mongoose.model('DirectConversation', DirectConversationSchema);
