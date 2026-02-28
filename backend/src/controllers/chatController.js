import {
    chat,
    getConversation,
    listConversations,
    deleteConversation,
} from '../services/chatbot.js';

/**
 * POST /api/chat/message
 * Send a message to Focus Buddy and get a response.
 *
 * Body: { message, conversationId? }
 * - message: string (required) — the user's message
 * - conversationId: string (optional) — continue an existing conversation
 *
 * If conversationId is omitted, a new conversation is created.
 */
export const sendMessage = async (req, res) => {
    try {
        const userId = req.user?.id || req.body.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const { message, conversationId } = req.body;
        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'message is required' });
        }

        const result = await chat(userId, message.trim(), conversationId || null);

        return res.status(200).json({
            success: true,
            data: {
                response: result.response,
                conversationId: result.conversationId,
                title: result.title,
                mood: result.mood,
                category: result.category,
            },
        });
    } catch (err) {
        console.error('❌ sendMessage:', err.message);
        const status = err.message === 'User not found' ? 404
            : err.message === 'Conversation not found' ? 404
                : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/chat/conversations
 * List all conversations for the authenticated user.
 * Query: ?page=1&limit=20
 */
export const getConversations = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

        const conversations = await listConversations(userId, { page, limit });

        return res.status(200).json({
            success: true,
            count: conversations.length,
            page,
            data: conversations,
        });
    } catch (err) {
        console.error('❌ getConversations:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/chat/conversations/:conversationId
 * Get full conversation history.
 */
export const getConversationById = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const conversation = await getConversation(userId, req.params.conversationId);

        return res.status(200).json({
            success: true,
            data: {
                _id: conversation._id,
                title: conversation.title,
                category: conversation.category,
                mood: conversation.mood,
                messageCount: conversation.messages.length,
                messages: conversation.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    timestamp: m.timestamp,
                })),
                relatedCourse: conversation.relatedCourse,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
            },
        });
    } catch (err) {
        console.error('❌ getConversationById:', err.message);
        const status = err.message === 'Conversation not found' ? 404 : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
};

/**
 * DELETE /api/chat/conversations/:conversationId
 * Soft-delete a conversation.
 */
export const removeConversation = async (req, res) => {
    try {
        const userId = req.user?.id || req.body.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        await deleteConversation(userId, req.params.conversationId);

        return res.status(200).json({
            success: true,
            message: 'Conversation deleted',
        });
    } catch (err) {
        console.error('❌ removeConversation:', err.message);
        const status = err.message === 'Conversation not found' ? 404 : 500;
        return res.status(status).json({ success: false, message: err.message });
    }
};
