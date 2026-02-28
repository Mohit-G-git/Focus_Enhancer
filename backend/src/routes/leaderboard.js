import { Router } from 'express';
import { getOverallLeaderboard, getCourseLeaderboard } from '../controllers/leaderboardController.js';

const router = Router();

router.get('/overall', getOverallLeaderboard);
router.get('/course/:courseId', getCourseLeaderboard);

export default router;
