import TheorySubmission from '../models/TheorySubmission.js';
import QuizAttempt from '../models/QuizAttempt.js';
import Task from '../models/Task.js';

/* ================================================================
   THEORY CONTROLLER — Theory submission management
   ================================================================
   Endpoints:
     POST  /api/theory/:taskId/submit       → submitTheory
     GET   /api/theory/:taskId/submission    → getSubmission
     GET   /api/theory/my-submissions        → getMySubmissions
   ================================================================ */

/**
 * POST /api/theory/:taskId/submit
 * Student uploads a PDF of handwritten theory answers.
 * Requires that the student has already passed the MCQ phase.
 */
export const submitTheory = async (req, res) => {
    try {
        const userId = req.user?.id || req.body.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
        if (!req.file) return res.status(400).json({ success: false, message: 'PDF required (field: solutions)' });

        const { taskId } = req.params;

        // Verify quiz attempt exists and MCQ was passed
        const attempt = await QuizAttempt.findOne({ user: userId, task: taskId });
        if (!attempt) {
            return res.status(404).json({ success: false, message: 'No quiz attempt found for this task' });
        }
        if (!attempt.mcqPassed) {
            return res.status(403).json({ success: false, message: 'MCQ not passed. Theory submission unavailable.' });
        }
        if (attempt.status === 'submitted') {
            return res.status(400).json({ success: false, message: 'Theory already submitted for this task' });
        }

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

        // Check for existing submission
        const existing = await TheorySubmission.findOne({ student: userId, task: taskId });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Theory already submitted for this task' });
        }

        // Create theory submission
        const submission = await TheorySubmission.create({
            student: userId,
            task: taskId,
            quizAttempt: attempt._id,
            course: task.course,
            pdf: {
                originalName: req.file.originalname,
                storedPath: req.file.path,
                sizeBytes: req.file.size,
                uploadedAt: new Date(),
            },
        });

        // Update quiz attempt
        attempt.theorySubmissionPath = req.file.path;
        attempt.theorySubmittedAt = new Date();
        attempt.theorySubmission = submission._id;
        attempt.status = 'submitted';
        await attempt.save();

        return res.status(201).json({
            success: true,
            message: 'Theory solutions submitted successfully!',
            data: {
                submissionId: submission._id,
                submittedAt: submission.pdf.uploadedAt,
                gradingStatus: submission.aiGrading.status,
            },
        });
    } catch (err) {
        console.error('❌ submitTheory:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/theory/:taskId/submission
 * Get the theory submission for a specific task.
 */
export const getSubmission = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const submission = await TheorySubmission.findOne({
            student: userId,
            task: req.params.taskId,
        })
            .populate('task', 'title topic difficulty')
            .populate('course', 'title courseCode');

        if (!submission) {
            return res.status(404).json({ success: false, message: 'No theory submission found' });
        }

        return res.status(200).json({ success: true, data: submission });
    } catch (err) {
        console.error('❌ getSubmission:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/theory/my-submissions
 * List all theory submissions for the authenticated user.
 */
export const getMySubmissions = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
        const skip = (page - 1) * limit;

        const submissions = await TheorySubmission.find({ student: userId })
            .populate('task', 'title topic difficulty')
            .populate('course', 'title courseCode')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await TheorySubmission.countDocuments({ student: userId });

        return res.status(200).json({
            success: true,
            count: submissions.length,
            total,
            page,
            data: submissions,
        });
    } catch (err) {
        console.error('❌ getMySubmissions:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
