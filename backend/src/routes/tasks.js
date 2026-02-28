import { Router } from 'express';
import { getCourseTasks, getTaskById, getTodaysTasks, getSchedule } from '../controllers/taskController.js';

const router = Router();

router.get('/course/:courseId', getCourseTasks);
router.get('/today/:courseId', getTodaysTasks);
router.get('/schedule/:courseId', getSchedule);
router.get('/:taskId', getTaskById);

export default router;
