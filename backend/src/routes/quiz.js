import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { startQuiz, answerQuestion, getMCQResult, getTheoryQuestions, submitTheory } from '../controllers/quizController.js';
import { answerRules, validate } from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads')),
        filename: (req, file, cb) => cb(null, `theory_${req.user?.id || req.body?.userId || 'anon'}_${Date.now()}.pdf`),
    }),
    fileFilter: (_, file, cb) => cb(file.mimetype === 'application/pdf' ? null : new Error('Only PDF'), file.mimetype === 'application/pdf'),
    limits: { fileSize: 20 * 1024 * 1024 },
});

router.post('/:taskId/start', protect, startQuiz);
router.post('/:taskId/answer', protect, answerRules, validate, answerQuestion);
router.get('/:taskId/mcq-result', protect, getMCQResult);
router.get('/:taskId/theory', protect, getTheoryQuestions);
router.post('/:taskId/submit-theory', protect, upload.single('solutions'), submitTheory);

export default router;
