import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { peerReviewRules, downvoteRules, disputeRules, validate } from '../middleware/validate.js';
import {
    getAccomplishedTasks,
    viewSolution,
    upvote,
    downvote,
    respondToDownvote,
    getMyReviews,
    getReceivedReviews,
} from '../controllers/peerReviewController.js';

const router = Router();

// ── Public: view accomplished tasks on a profile ───────────────
router.get('/accomplished/:userId', getAccomplishedTasks);

// ── Protected: all review actions require auth ─────────────────
router.get('/solution/:taskId/:userId', protect, viewSolution);
router.post('/upvote', protect, peerReviewRules, validate, upvote);
router.post('/downvote', protect, downvoteRules, validate, downvote);
router.post('/:reviewId/respond', protect, disputeRules, validate, respondToDownvote);
router.get('/my-reviews', protect, getMyReviews);
router.get('/received', protect, getReceivedReviews);

export default router;
