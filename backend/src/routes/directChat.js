import { Router } from 'express';
import {
    sendRequest,
    getIncomingRequests,
    getOutgoingRequests,
    acceptRequest,
    rejectRequest,
    sendMessage,
    getConversation,
    listConversations,
    endConversation,
} from '../controllers/directChatController.js';
import { chatRequestRules, directMessageRules, validate } from '../middleware/validate.js';

const router = Router();

// ── Chat requests ──────────────────────────────────────────────
router.post('/request', chatRequestRules, validate, sendRequest);
router.get('/requests/incoming', getIncomingRequests);
router.get('/requests/outgoing', getOutgoingRequests);
router.put('/:conversationId/accept', acceptRequest);
router.put('/:conversationId/reject', rejectRequest);

// ── Messaging ──────────────────────────────────────────────────
router.post('/:conversationId/message', directMessageRules, validate, sendMessage);

// ── Conversation management ────────────────────────────────────
router.get('/', listConversations);
router.get('/:conversationId', getConversation);
router.put('/:conversationId/end', endConversation);

export default router;
