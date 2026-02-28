import QuizAttempt from '../models/QuizAttempt.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import TokenLedger from '../models/TokenLedger.js';
import CourseProficiency from '../models/CourseProficiency.js';
import { generateMCQs, generateTheoryQuestions } from '../services/questionGenerator.js';

const PTS = { correct: 2, unattempted: -1, wrong: -2 };
const PASS_THRESHOLD = 8;
const TIME_LIMIT_MS = 15_000;
const TIME_GRACE_MS = 2_000;

/**
 * POST /api/quiz/:taskId/start
 */
export const startQuiz = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user?.id || req.body.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

        const task = await Task.findById(taskId).populate('course');
        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

        // Reject if the task has been superseded by a newer announcement
        if (task.status === 'superseded') {
            return res.status(409).json({
                success: false,
                message: 'This task has been superseded by a newer announcement. Check your updated tasks.',
            });
        }

        const existing = await QuizAttempt.findOne({ user: userId, task: taskId });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Quiz already ${existing.status}. One attempt per task.`,
            });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.tokenBalance < task.tokenStake) {
            return res.status(400).json({
                success: false,
                message: `Insufficient tokens. Need ${task.tokenStake}, have ${user.tokenBalance}`,
            });
        }

        // Generate unique MCQs FIRST (before deducting stake)
        // If Gemini fails, the user doesn't lose tokens
        const mcqs = await generateMCQs({
            taskTitle: task.title, taskTopic: task.topic,
            courseName: task.course.title, bookPdfPath: task.course.bookPdfPath,
        });

        // Deduct stake only after MCQs are successfully generated
        user.tokenBalance -= task.tokenStake;
        await TokenLedger.create({
            userId: user._id, taskId: task._id, type: 'stake',
            amount: -task.tokenStake, balanceAfter: user.tokenBalance,
            note: `Staked ${task.tokenStake} tokens for: "${task.title}"`,
        });
        await user.save();

        const attempt = await QuizAttempt.create({
            user: userId, task: taskId, course: task.course._id, mcqs, mcqStartedAt: new Date(),
        });

        // Return MCQs WITHOUT correct answers
        const sanitized = mcqs.map((m, i) => ({
            index: i, question: m.question, options: m.options, timeLimit: 15,
        }));

        return res.status(201).json({
            success: true,
            message: `Quiz started! ${task.tokenStake} tokens staked.`,
            data: { attemptId: attempt._id, mcqs: sanitized, passThreshold: PASS_THRESHOLD, tokenStake: task.tokenStake },
        });
    } catch (err) {
        console.error('❌ startQuiz:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/quiz/:taskId/answer
 */
export const answerQuestion = async (req, res) => {
    try {
        const { taskId } = req.params;
        const userId = req.user?.id || req.body.userId;
        const { questionIndex, selectedAnswer } = req.body;

        const attempt = await QuizAttempt.findOne({ user: userId, task: taskId });
        if (!attempt) return res.status(404).json({ success: false, message: 'No quiz attempt found' });
        if (attempt.status !== 'mcq_in_progress') {
            return res.status(400).json({ success: false, message: `Quiz is ${attempt.status}` });
        }
        if (attempt.mcqResponses.some((r) => r.questionIndex === questionIndex)) {
            return res.status(400).json({ success: false, message: `Q${questionIndex} already answered` });
        }

        const now = new Date();
        const elapsed = now - attempt.mcqStartedAt;
        const maxMs = (questionIndex + 1) * (TIME_LIMIT_MS + TIME_GRACE_MS);
        const mcq = attempt.mcqs[questionIndex];

        let points, isCorrect;
        if (elapsed > maxMs || selectedAnswer === null || selectedAnswer === undefined) {
            points = PTS.unattempted; isCorrect = null;
        } else if (selectedAnswer === mcq.correctAnswer) {
            points = PTS.correct; isCorrect = true;
        } else {
            points = PTS.wrong; isCorrect = false;
        }

        attempt.mcqResponses.push({
            questionIndex, selectedAnswer: selectedAnswer ?? null,
            answeredAt: now, timeTakenMs: elapsed - questionIndex * TIME_LIMIT_MS,
            isCorrect, points,
        });
        await attempt.save();

        return res.status(200).json({
            success: true,
            data: { questionIndex, points, isCorrect, remaining: 6 - attempt.mcqResponses.length },
        });
    } catch (err) {
        console.error('❌ answerQuestion:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/quiz/:taskId/mcq-result
 */
export const getMCQResult = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        const attempt = await QuizAttempt.findOne({ user: userId, task: req.params.taskId });
        if (!attempt) return res.status(404).json({ success: false, message: 'No quiz attempt' });

        // Auto-fill unanswered as unattempted
        for (let i = 0; i < 6; i++) {
            if (!attempt.mcqResponses.some((r) => r.questionIndex === i)) {
                attempt.mcqResponses.push({ questionIndex: i, selectedAnswer: null, points: PTS.unattempted });
            }
        }

        const score = attempt.mcqResponses.reduce((s, r) => s + r.points, 0);
        const passed = score >= PASS_THRESHOLD;
        attempt.mcqScore = score;
        attempt.mcqPassed = passed;
        attempt.status = passed ? 'theory_pending' : 'failed';

        if (!attempt.tokenSettled) {
            const task = await Task.findById(req.params.taskId);
            const user = await User.findById(userId);

            // Record MCQ score in user stats
            user.recordMcqScore(score);

            if (passed) {
                const total = task.tokenStake + task.reward;
                user.tokenBalance += total;
                user.stats.quizzesPassed += 1;
                user.stats.tokensEarned += task.reward;
                attempt.tokensAwarded = task.reward;
                await TokenLedger.create({
                    userId: user._id, taskId: task._id, type: 'reward',
                    amount: total, balanceAfter: user.tokenBalance,
                    note: `MCQ passed (${score}/12). Stake returned + ${task.reward} reward.`,
                });
            } else {
                user.stats.tokensLost += task.tokenStake;
                attempt.tokensAwarded = -task.tokenStake;
                await TokenLedger.create({
                    userId: user._id, taskId: task._id, type: 'penalty',
                    amount: 0, balanceAfter: user.tokenBalance,
                    note: `MCQ failed (${score}/12). Stake of ${task.tokenStake} forfeited.`,
                });
            }

            // Update streak
            user.updateStreak();
            attempt.tokenSettled = true;
            await user.save();

            // Update course proficiency
            let prof = await CourseProficiency.findOne({ user: userId, course: task.course });
            if (!prof) prof = await CourseProficiency.create({ user: userId, course: task.course });
            prof.quizzesPassed += passed ? 1 : 0;
            prof.quizzesFailed += passed ? 0 : 1;
            prof.tasksAttempted += 1;
            if (passed) prof.tasksCompleted += 1;
            prof.recalculate();
            await prof.save();
        }
        await attempt.save();

        const breakdown = attempt.mcqResponses
            .sort((a, b) => a.questionIndex - b.questionIndex)
            .map((r) => {
                const mcq = attempt.mcqs[r.questionIndex];
                return {
                    question: mcq?.question,
                    yourAnswer: r.selectedAnswer != null ? mcq?.options[r.selectedAnswer] : 'Unattempted',
                    correctAnswer: mcq?.options[mcq?.correctAnswer],
                    points: r.points,
                };
            });

        return res.status(200).json({
            success: true,
            data: { score, maxScore: 12, passed, threshold: PASS_THRESHOLD, tokensAwarded: attempt.tokensAwarded, breakdown },
        });
    } catch (err) {
        console.error('❌ getMCQResult:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/quiz/:taskId/theory
 */
export const getTheoryQuestions = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        const attempt = await QuizAttempt.findOne({ user: userId, task: req.params.taskId });
        if (!attempt) return res.status(404).json({ success: false, message: 'No quiz attempt' });
        if (!attempt.mcqPassed) {
            return res.status(403).json({ success: false, message: 'MCQ not passed. Theory unavailable.' });
        }

        if (!attempt.theoryQuestions?.length) {
            const task = await Task.findById(req.params.taskId).populate('course');
            const qs = await generateTheoryQuestions({
                taskTitle: task.title, taskTopic: task.topic,
                courseName: task.course.title, bookPdfPath: task.course.bookPdfPath,
            });
            attempt.theoryQuestions = qs;
            attempt.status = 'theory_pending';
            await attempt.save();
        }

        return res.status(200).json({
            success: true,
            data: { questions: attempt.theoryQuestions.map((q, i) => ({ number: i + 1, question: q })) },
        });
    } catch (err) {
        console.error('❌ getTheoryQuestions:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/quiz/:taskId/submit-theory
 */
export const submitTheory = async (req, res) => {
    try {
        const userId = req.user?.id || req.body.userId;
        if (!req.file) return res.status(400).json({ success: false, message: 'PDF required (field: solutions)' });

        const attempt = await QuizAttempt.findOne({ user: userId, task: req.params.taskId });
        if (!attempt) return res.status(404).json({ success: false, message: 'No quiz attempt' });
        if (attempt.status !== 'theory_pending') {
            return res.status(400).json({ success: false, message: `Cannot submit. Status: ${attempt.status}` });
        }

        attempt.theorySubmissionPath = req.file.path;
        attempt.theorySubmittedAt = new Date();
        attempt.status = 'submitted';
        await attempt.save();

        return res.status(200).json({
            success: true,
            message: 'Theory solutions submitted! Awaiting peer verification.',
            data: { submittedAt: attempt.theorySubmittedAt },
        });
    } catch (err) {
        console.error('❌ submitTheory:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
