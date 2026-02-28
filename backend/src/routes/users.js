import { Router } from 'express';
import { searchUsers } from '../controllers/directChatController.js';
import User from '../models/User.js';
import QuizAttempt from '../models/QuizAttempt.js';

const router = Router();

// Search users by name or email
router.get('/search', searchUsers);

// Random theory submission PDF (any user)
router.get('/random-submission', async (req, res) => {
    try {
        const count = await QuizAttempt.countDocuments({ theorySubmissionPath: { $ne: null } });
        if (count === 0) return res.status(404).json({ success: false, message: 'No submissions found' });
        const skip = Math.floor(Math.random() * count);
        const sub = await QuizAttempt.findOne({ theorySubmissionPath: { $ne: null } })
            .skip(skip)
            .populate('task', 'title topic difficulty')
            .populate('course', 'courseCode title')
            .populate('user', 'name department');
        return res.json({
            success: true,
            data: {
                _id: sub._id,
                user: { name: sub.user?.name, department: sub.user?.department },
                task: sub.task,
                course: sub.course,
                mcqScore: sub.mcqScore,
                theorySubmissionPath: sub.theorySubmissionPath,
                theorySubmittedAt: sub.theorySubmittedAt,
                attemptNumber: sub.attemptNumber,
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Public user profile with submissions
router.get('/:userId/profile', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-passwordHash')
            .populate('enrolledCourses', 'courseCode title');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Get their quiz attempts (submissions) — only completed/submitted ones
        const submissions = await QuizAttempt.find({
            user: req.params.userId,
            status: { $in: ['submitted', 'failed', 'theory_pending', 'mcq_completed'] },
        })
            .populate('task', 'title topic difficulty tokenStake')
            .populate('course', 'courseCode title')
            .sort({ createdAt: -1 })
            .limit(50);

        return res.json({
            success: true,
            data: {
                user,
                submissions: submissions.map((s) => ({
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
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Basic user info (backward compat)
router.get('/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-passwordHash')
            .populate('enrolledCourses', 'courseCode title');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.json({ success: true, data: user });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
