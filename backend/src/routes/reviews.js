import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { unlockRules, voteRules, disputeRules, validate } from '../middleware/validate.js';
import {
    getAccomplishedTasks,
    viewSolution,
    unlockSolution,
    castVote,
    respondToDownvote,
    getMyReviews,
    getReceivedReviews,
} from '../controllers/peerReviewController.js';

const router = Router();

// Public: view accomplished tasks on a profile
router.get('/accomplished/:userId', getAccomplishedTasks);

// Protected: all review actions require auth
router.get('/solution/:taskId/:userId', protect, viewSolution);
router.post('/unlock', protect, unlockRules, validate, unlockSolution);
router.post('/:reviewId/vote', protect, voteRules, validate, castVote);
router.post('/:reviewId/respond', protect, disputeRules, validate, respondToDownvote);
router.get('/my-reviews', protect, getMyReviews);
router.get('/received', protect, getReceivedReviews);

export default router;
