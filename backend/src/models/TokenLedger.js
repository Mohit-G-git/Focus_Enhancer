import mongoose from 'mongoose';

const TokenLedgerSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            default: null,
        },
        type: {
            type: String,
            enum: ['stake', 'reward', 'penalty', 'bonus', 'initial', 'peer_wager', 'peer_reward', 'peer_penalty'],
            required: true,
        },
        amount: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        note: { type: String, default: '' },
    },
    { timestamps: true, strict: true }
);

export default mongoose.model('TokenLedger', TokenLedgerSchema);
