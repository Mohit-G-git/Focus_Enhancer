import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { startQuiz, answerQuestion, getMCQResult, getTheoryQuestions, submitTheory, getAttemptInfo } from '../controllers/quizController.js';
import { answerRules, validate } from '../middleware/validate.js';

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

router.get('/:taskId/attempt-info', getAttemptInfo);
router.post('/:taskId/start', startQuiz);
router.post('/:taskId/answer', answerRules, validate, answerQuestion);
router.get('/:taskId/mcq-result', getMCQResult);
router.get('/:taskId/theory', getTheoryQuestions);
router.post('/:taskId/submit-theory', upload.single('solutions'), submitTheory);

export default router;
