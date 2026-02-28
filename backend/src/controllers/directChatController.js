import DirectConversation from '../models/DirectConversation.js';
import User from '../models/User.js';

/* ================================================================
   DIRECT CHAT CONTROLLER — User-to-User Messaging
   ================================================================ */

/**
 * POST /api/direct-chat/request
 * Body: { targetUserId }
 * Send a chat request to another user.
 */
export const sendRequest = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { targetUserId } = req.body;

        if (senderId === targetUserId) {
            return res.status(400).json({ success: false, message: 'Cannot send a chat request to yourself' });
        }

        // Check target user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Target user not found' });
        }

        // Check for existing active or pending conversation between these two
        const existing = await DirectConversation.findOne({
            participants: { $all: [senderId, targetUserId] },
            status: { $in: ['requested', 'active'] },
        });
        if (existing) {
            const msg = existing.status === 'requested'
                ? 'A chat request is already pending between you two'
                : 'You already have an active conversation with this user';
            return res.status(409).json({ success: false, message: msg });
        }

        const conversation = await DirectConversation.create({
            participants: [senderId, targetUserId],
            initiator: senderId,
            status: 'requested',
        });

        res.status(201).json({
            success: true,
            message: 'Chat request sent',
            conversation: {
                _id: conversation._id,
                participants: conversation.participants,
                status: conversation.status,
                createdAt: conversation.createdAt,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/direct-chat/requests/incoming
 * List pending chat requests where the current user is the receiver.
 */
export const getIncomingRequests = async (req, res) => {
    try {
        const userId = req.user.id;

        const requests = await DirectConversation.find({
            participants: userId,
            initiator: { $ne: userId },
            status: 'requested',
        })
            .populate('initiator', 'name email avatar department')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: requests.length, requests });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/direct-chat/requests/outgoing
 * List pending chat requests the current user has sent.
 */
export const getOutgoingRequests = async (req, res) => {
    try {
        const userId = req.user.id;

        const requests = await DirectConversation.find({
            initiator: userId,
            status: 'requested',
        })
            .populate('participants', 'name email avatar department')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: requests.length, requests });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/direct-chat/:conversationId/accept
 * Accept a pending chat request (only the non-initiator can accept).
 */
export const acceptRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        const convo = await DirectConversation.findById(conversationId);
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        if (convo.status !== 'requested') {
            return res.status(400).json({ success: false, message: `Cannot accept — conversation is ${convo.status}` });
        }
        if (convo.initiator.toString() === userId) {
            return res.status(403).json({ success: false, message: 'The initiator cannot accept their own request' });
        }
        if (!convo.participants.map(String).includes(userId)) {
            return res.status(403).json({ success: false, message: 'You are not a participant in this conversation' });
        }

        convo.status = 'active';
        convo.acceptedAt = new Date();
        await convo.save();

        res.json({ success: true, message: 'Chat request accepted', conversation: convo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/direct-chat/:conversationId/reject
 * Reject a pending chat request (only the non-initiator can reject).
 */
export const rejectRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        const convo = await DirectConversation.findById(conversationId);
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        if (convo.status !== 'requested') {
            return res.status(400).json({ success: false, message: `Cannot reject — conversation is ${convo.status}` });
        }
        if (convo.initiator.toString() === userId) {
            return res.status(403).json({ success: false, message: 'The initiator cannot reject their own request' });
        }
        if (!convo.participants.map(String).includes(userId)) {
            return res.status(403).json({ success: false, message: 'You are not a participant in this conversation' });
        }

        // Delete the request entirely
        await DirectConversation.findByIdAndDelete(conversationId);

        res.json({ success: true, message: 'Chat request rejected' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/direct-chat/:conversationId/message
 * Body: { content }
 * Send a message in an active conversation.
 */
export const sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { content } = req.body;

        const convo = await DirectConversation.findById(conversationId);
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        if (!convo.participants.map(String).includes(userId)) {
            return res.status(403).json({ success: false, message: 'You are not a participant in this conversation' });
        }
        if (convo.status !== 'active') {
            return res.status(400).json({ success: false, message: `Cannot send messages — conversation is ${convo.status}` });
        }

        convo.messages.push({ sender: userId, content });
        await convo.save();

        const newMsg = convo.messages[convo.messages.length - 1];
        res.status(201).json({ success: true, message: newMsg });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/direct-chat/:conversationId
 * Get a conversation with messages (only participants can view).
 */
export const getConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        const convo = await DirectConversation.findById(conversationId)
            .populate('participants', 'name email avatar department')
            .populate('initiator', 'name email avatar')
            .populate('endedBy', 'name');

        if (!convo) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        if (!convo.participants.some((p) => p._id.toString() === userId)) {
            return res.status(403).json({ success: false, message: 'You are not a participant in this conversation' });
        }

        res.json({ success: true, conversation: convo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/direct-chat
 * List all conversations (active, requested, ended) for the current user.
 * Query: ?status=active|requested|ended  (optional filter)
 */
export const listConversations = async (req, res) => {
    try {
        const userId = req.user.id;
        const filter = { participants: userId };

        if (req.query.status) {
            filter.status = req.query.status;
        }

        const conversations = await DirectConversation.find(filter)
            .populate('participants', 'name email avatar department')
            .select('-messages')
            .sort({ updatedAt: -1 });

        res.json({ success: true, count: conversations.length, conversations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/direct-chat/:conversationId/end
 * End an active conversation (either participant can end it).
 */
export const endConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        const convo = await DirectConversation.findById(conversationId);
        if (!convo) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        if (!convo.participants.map(String).includes(userId)) {
            return res.status(403).json({ success: false, message: 'You are not a participant in this conversation' });
        }
        if (convo.status === 'ended') {
            return res.status(400).json({ success: false, message: 'Conversation is already ended' });
        }
        // Allow ending from both 'requested' (cancel) and 'active' states
        convo.status = 'ended';
        convo.endedAt = new Date();
        convo.endedBy = userId;
        await convo.save();

        res.json({ success: true, message: 'Conversation ended', conversation: convo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/users/search?q=searchTerm
 * Search users by name or email. Excludes the requesting user.
 * Returns max 20 results.
 */
export const searchUsers = async (req, res) => {
    try {
        const userId = req.user.id;
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }

        const regex = new RegExp(q.trim(), 'i');
        const users = await User.find({
            _id: { $ne: userId },
            $or: [{ name: regex }, { email: regex }],
        })
            .select('name email avatar department semester university')
            .limit(20)
            .sort({ name: 1 });

        res.json({ success: true, count: users.length, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
