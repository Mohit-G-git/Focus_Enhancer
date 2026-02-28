import { Router } from 'express';
import { searchUsers } from '../controllers/directChatController.js';

const router = Router();

// Search users by name or email
router.get('/search', searchUsers);

export default router;
