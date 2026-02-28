import { Router } from 'express';
import {
    sendMessage,
    getConversations,
    getConversationById,
    removeConversation,
} from '../controllers/chatController.js';
import { chatMessageRules, validate } from '../middleware/validate.js';

const router = Router();

// Send a message (creates new conversation if no conversationId)
router.post('/message', chatMessageRules, validate, sendMessage);

// List all conversations for a user
router.get('/conversations', getConversations);

// Get full conversation history
router.get('/conversations/:conversationId', getConversationById);

// Delete a conversation
router.delete('/conversations/:conversationId', removeConversation);

export default router;
