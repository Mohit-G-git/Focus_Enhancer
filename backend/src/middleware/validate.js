import { body, validationResult } from 'express-validator';

/**
 * Runs validation and returns 400 with errors if any fail.
 */
export const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
        });
    }
    next();
};

// ── Auth Validation ────────────────────────────────────────────────

export const registerRules = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required')
        .custom((val) => {
            if (!val.toLowerCase().endsWith('@iitj.ac.in')) {
                throw new Error('Only @iitj.ac.in email addresses are allowed');
            }
            return true;
        }),
    body('password').isLength({ min: 6 }).withMessage('Password must be ≥6 characters'),
    body('studentId').optional().trim().notEmpty().withMessage('studentId cannot be empty if provided'),
    body('department').optional().trim(),
    body('semester').optional().isInt({ min: 1, max: 8 }).withMessage('Semester must be 1-8'),
    body('year').optional().isInt({ min: 2000 }).withMessage('Valid year required'),
    body('university').optional().trim(),
];

export const loginRules = [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
];

// ── Course Validation ──────────────────────────────────────────────

export const courseRules = [
    body('courseCode').trim().notEmpty().withMessage('Course code is required')
        .isLength({ min: 2, max: 15 }).withMessage('Course code must be 2-15 chars'),
    body('title').trim().notEmpty().withMessage('Course title is required'),
    body('department').optional().trim(),
    body('semester').optional().isInt({ min: 1, max: 8 }).withMessage('Semester must be 1-8'),
    body('year').optional().isInt({ min: 2000 }).withMessage('Valid year required'),
    body('durationType').optional().isIn(['full', 'fractal']).withMessage('durationType must be full or fractal'),
    body('creditWeight').optional().isInt({ min: 1, max: 6 }).withMessage('creditWeight must be 1-6'),
];

// ── Announcement Validation ────────────────────────────────────────

export const announcementRules = [
    body('courseId').isMongoId().withMessage('Valid courseId required'),
    body('eventType')
        .isIn(['quiz', 'assignment', 'midterm', 'final', 'lecture', 'lab'])
        .withMessage('eventType must be quiz/assignment/midterm/final/lecture/lab'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('topics').isArray({ min: 1 }).withMessage('At least one topic required'),
    body('eventDate').isISO8601().withMessage('eventDate must be a valid date'),
];

// ── Quiz Validation ────────────────────────────────────────────────

export const answerRules = [
    body('questionIndex').isInt({ min: 0, max: 5 }).withMessage('questionIndex must be 0-5'),
    body('selectedAnswer')
        .optional({ nullable: true })
        .isInt({ min: 0, max: 3 })
        .withMessage('selectedAnswer must be 0-3 or null'),
];

// ── Chat Validation ────────────────────────────────────────────────

export const chatMessageRules = [
    body('message')
        .trim()
        .notEmpty()
        .withMessage('Message is required')
        .isLength({ max: 5000 })
        .withMessage('Message must be ≤5000 characters'),
    body('conversationId')
        .optional({ nullable: true })
        .isMongoId()
        .withMessage('conversationId must be a valid ID'),
];

// ── Peer Review Validation ─────────────────────────────────────────

export const peerReviewRules = [
    body('taskId').isMongoId().withMessage('Valid taskId required'),
    body('revieweeId').isMongoId().withMessage('Valid revieweeId required'),
    body('wager').isInt({ min: 1 }).withMessage('Wager must be at least 1 token'),
];

export const downvoteRules = [
    body('taskId').isMongoId().withMessage('Valid taskId required'),
    body('revieweeId').isMongoId().withMessage('Valid revieweeId required'),
    body('wager').isInt({ min: 1 }).withMessage('Wager must be at least 1 token'),
    body('reason')
        .trim()
        .notEmpty()
        .withMessage('Reason is required for downvotes')
        .isLength({ min: 10, max: 2000 })
        .withMessage('Reason must be 10-2000 characters'),
];

export const disputeRules = [
    body('action')
        .isIn(['agree', 'disagree'])
        .withMessage('Action must be "agree" or "disagree"'),
];

// ── Direct Chat Validation ─────────────────────────────────────────

export const chatRequestRules = [
    body('targetUserId')
        .isMongoId()
        .withMessage('Valid targetUserId required'),
];

export const directMessageRules = [
    body('content')
        .trim()
        .notEmpty()
        .withMessage('Message content is required')
        .isLength({ max: 5000 })
        .withMessage('Message must be ≤5000 characters'),
];
