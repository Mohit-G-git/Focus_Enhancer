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
const DECAY_BASE = 0.6; // stake multiplier per re-attempt

/** Calculate effective stake for attempt N: max(1, ceil(base * 0.6^(n-1))) */
function calcDecayedStake(baseStake, attemptNumber) {
    return Math.max(1, Math.ceil(baseStake * Math.pow(DECAY_BASE, attemptNumber - 1)));
}

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

        // Fetch ALL previous attempts for this user+task (sorted newest first)
        const prevAttempts = await QuizAttempt.find({ user: userId, task: taskId })
            .sort({ createdAt: -1 });

        const latest = prevAttempts[0] || null;

        // If there's an in-progress attempt, clean it up and let user start fresh
        if (latest && latest.status === 'mcq_in_progress') {
            if (!latest.tokenSettled) {
                const stakeToRefund = latest.effectiveStake || task.tokenStake;
                const u = await User.findById(userId);
                u.tokenBalance += stakeToRefund;
                await TokenLedger.create({
                    userId: u._id, taskId: task._id, type: 'bonus',
                    amount: stakeToRefund, balanceAfter: u.tokenBalance,
                    note: `Refund interrupted quiz stake for: "${task.title}"`,
                });
                await u.save();
            }
            await QuizAttempt.findOneAndDelete({ _id: latest._id });
            // Fall through — this counts as the same attempt number
        } else if (latest) {
            // There's a finished attempt — check if re-attempt is allowed
            if (latest.status === 'theory_pending' || latest.status === 'mcq_completed') {
                return res.status(400).json({
                    success: false,
                    message: 'You have an unfinished quiz. Complete or abandon it before re-attempting.',
                });
            }
            // status = 'failed' or 'submitted' → allow re-attempt
        }

        // Calculate attempt number
        // Count only "completed" attempts (not the in-progress one we may have just deleted)
        const completedCount = prevAttempts.filter(
            (a) => a.status !== 'mcq_in_progress'
        ).length;
        const attemptNumber = completedCount + 1;
        const effectiveStake = calcDecayedStake(task.tokenStake, attemptNumber);

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.tokenBalance < effectiveStake) {
            return res.status(400).json({
                success: false,
                message: `Insufficient tokens. Need ${effectiveStake} (attempt #${attemptNumber}), have ${user.tokenBalance}`,
            });
        }

        // Generate unique MCQs FIRST (before deducting stake)
        // If Gemini fails, the user doesn't lose tokens
        const mcqs = await generateMCQs({
            taskTitle: task.title, taskTopic: task.topic,
            courseName: task.course.title, bookPdfPath: task.course.bookPdfPath,
        });

        // Deduct decayed stake
        user.tokenBalance -= effectiveStake;
        await TokenLedger.create({
            userId: user._id, taskId: task._id, type: 'stake',
            amount: -effectiveStake, balanceAfter: user.tokenBalance,
            note: `Staked ${effectiveStake} tokens (attempt #${attemptNumber}, decay=${Math.round(Math.pow(DECAY_BASE, attemptNumber - 1) * 100)}%) for: "${task.title}"`,
        });
        await user.save();

        const attempt = await QuizAttempt.create({
            user: userId, task: taskId, course: task.course._id, mcqs,
            mcqStartedAt: new Date(), attemptNumber, effectiveStake,
        });

        // Return MCQs WITHOUT correct answers
        const sanitized = mcqs.map((m, i) => ({
            index: i, question: m.question, options: m.options, timeLimit: 15,
        }));

        return res.status(201).json({
            success: true,
            message: `Quiz started! ${effectiveStake} tokens staked (attempt #${attemptNumber}).`,
            data: {
                attemptId: attempt._id, mcqs: sanitized,
                passThreshold: PASS_THRESHOLD, tokenStake: effectiveStake,
                attemptNumber, originalStake: task.tokenStake,
            },
        });
    } catch (err) {
        // Handle race condition: if duplicate key error, delete stale and tell user to retry
        if (err.code === 11000) {
            await QuizAttempt.deleteOne({ user: req.user?.id || req.body.userId, task: req.params.taskId, status: 'mcq_in_progress' });
            return res.status(409).json({ success: false, message: 'Cleaned up interrupted quiz. Please try again.' });
        }
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

        const attempt = await QuizAttempt.findOne({ user: userId, task: taskId }).sort({ createdAt: -1 });
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
        const attempt = await QuizAttempt.findOne({ user: userId, task: req.params.taskId }).sort({ createdAt: -1 });
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
            const stake = attempt.effectiveStake || task.tokenStake;

            // Record MCQ score in user stats
            user.recordMcqScore(score);

            if (passed) {
                const total = stake + task.reward;
                user.tokenBalance += total;
                user.stats.quizzesPassed += 1;
                user.stats.tokensEarned += task.reward;
                attempt.tokensAwarded = task.reward;
                await TokenLedger.create({
                    userId: user._id, taskId: task._id, type: 'reward',
                    amount: total, balanceAfter: user.tokenBalance,
                    note: `MCQ passed (${score}/12, attempt #${attempt.attemptNumber}). Stake ${stake} returned + ${task.reward} reward.`,
                });
            } else {
                user.stats.tokensLost += stake;
                attempt.tokensAwarded = -stake;
                await TokenLedger.create({
                    userId: user._id, taskId: task._id, type: 'penalty',
                    amount: 0, balanceAfter: user.tokenBalance,
                    note: `MCQ failed (${score}/12, attempt #${attempt.attemptNumber}). Stake of ${stake} forfeited.`,
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
        const attempt = await QuizAttempt.findOne({ user: userId, task: req.params.taskId }).sort({ createdAt: -1 });
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

        const attempt = await QuizAttempt.findOne({ user: userId, task: req.params.taskId }).sort({ createdAt: -1 });
        if (!attempt) return res.status(404).json({ success: false, message: 'No quiz attempt' });
        if (attempt.status !== 'theory_pending') {
            return res.status(400).json({ success: false, message: `Cannot submit. Status: ${attempt.status}` });
        }

        // Store relative path so it can be served via /uploads/...
        const relPath = req.file.path.includes('uploads/')
            ? 'uploads/' + req.file.path.split('uploads/').pop()
            : req.file.path;
        attempt.theorySubmissionPath = relPath;
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

/**
 * GET /api/quiz/:taskId/attempt-info
 * Returns attempt history and what the next attempt would cost.
 */
export const getAttemptInfo = async (req, res) => {
    try {
        const userId = req.user?.id || req.query.userId;
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

        const attempts = await QuizAttempt.find({ user: userId, task: req.params.taskId })
            .sort({ createdAt: -1 })
            .select('attemptNumber effectiveStake mcqScore mcqPassed status createdAt');

        const completedCount = attempts.filter((a) => a.status !== 'mcq_in_progress').length;
        const nextAttemptNumber = completedCount + 1;
        const nextStake = calcDecayedStake(task.tokenStake, nextAttemptNumber);
        const latest = attempts[0] || null;
        const canRetry = !latest || ['failed', 'submitted'].includes(latest.status);

        return res.status(200).json({
            success: true,
            data: {
                totalAttempts: completedCount,
                nextAttemptNumber,
                originalStake: task.tokenStake,
                nextStake,
                decayRate: DECAY_BASE,
                canRetry,
                latestStatus: latest?.status || null,
                history: attempts.map((a) => ({
                    attemptNumber: a.attemptNumber,
                    stake: a.effectiveStake,
                    score: a.mcqScore,
                    passed: a.mcqPassed,
                    status: a.status,
                    date: a.createdAt,
                })),
            },
        });
    } catch (err) {
        console.error('❌ getAttemptInfo:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/quiz/attempt/:attemptId/detail
 * Returns full submission detail for viewing another user's attempt.
 * Includes MCQ questions (with correct answers), user responses,
 * theory questions, and theory PDF path.
 */
export const getAttemptDetail = async (req, res) => {
    try {
        const attempt = await QuizAttempt.findById(req.params.attemptId)
            .populate('task', 'title topic difficulty tokenStake description')
            .populate('course', 'courseCode title')
            .populate('user', 'name department');

        if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });

        // Build MCQ detail: question, options, correct answer, user's answer, correctness
        const mcqDetail = attempt.mcqs.map((q, idx) => {
            const response = attempt.mcqResponses.find((r) => r.questionIndex === idx) || {};
            return {
                question: q.question,
                options: q.options,
                correctAnswer: q.correctAnswer,
                selectedAnswer: response.selectedAnswer ?? null,
                isCorrect: response.isCorrect ?? null,
                points: response.points ?? 0,
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                _id: attempt._id,
                user: attempt.user,
                task: attempt.task,
                course: attempt.course,
                attemptNumber: attempt.attemptNumber,
                effectiveStake: attempt.effectiveStake,
                mcqScore: attempt.mcqScore,
                mcqPassed: attempt.mcqPassed,
                status: attempt.status,
                tokensAwarded: attempt.tokensAwarded,
                mcqDetail,
                theoryQuestions: attempt.theoryQuestions || [],
                theorySubmissionPath: attempt.theorySubmissionPath,
                theorySubmittedAt: attempt.theorySubmittedAt,
                createdAt: attempt.createdAt,
            },
        });
    } catch (err) {
        console.error('❌ getAttemptDetail:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
