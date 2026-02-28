import { Router } from 'express';
import { getMyTasks, getCourseTasks, getTaskById, getTodaysTasks, getSchedule } from '../controllers/taskController.js';
import QuizAttempt from '../models/QuizAttempt.js';

const router = Router();

// Self-user submissions (quiz attempts)
router.get('/submissions', async (req, res) => {
    try {
        const submissions = await QuizAttempt.find({
            user: req.user.id,
            status: { $in: ['submitted', 'failed', 'theory_pending', 'mcq_completed'] },
        })
            .populate('task', 'title topic difficulty tokenStake')
            .populate('course', 'courseCode title')
            .sort({ createdAt: -1 })
            .limit(50);

        return res.json({
            success: true,
            data: submissions.map((s) => ({
                _id: s._id,
                task: s.task,
                course: s.course,
                attemptNumber: s.attemptNumber,
                mcqScore: s.mcqScore,
                mcqPassed: s.mcqPassed,
                status: s.status,
                effectiveStake: s.effectiveStake,
                tokensAwarded: s.tokensAwarded,
                theorySubmissionPath: s.theorySubmissionPath,
                theorySubmittedAt: s.theorySubmittedAt,
                createdAt: s.createdAt,
            })),
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/', getMyTasks);
router.get('/course/:courseId', getCourseTasks);
router.get('/today/:courseId', getTodaysTasks);
router.get('/schedule/:courseId', getSchedule);
router.get('/:taskId', getTaskById);

export default router;
