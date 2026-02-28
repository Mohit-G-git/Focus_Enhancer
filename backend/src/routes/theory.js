import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/auth.js';
import { submitTheory, getSubmission, getMySubmissions } from '../controllers/theoryController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── Multer for theory PDF uploads ──────────────────────────────
const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads')),
        filename: (req, file, cb) =>
            cb(null, `theory_${req.user?.id || 'anon'}_${Date.now()}.pdf`),
    }),
    fileFilter: (_, file, cb) =>
        cb(file.mimetype === 'application/pdf' ? null : new Error('Only PDF'), file.mimetype === 'application/pdf'),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// ── Routes ─────────────────────────────────────────────────────
router.get('/my-submissions', protect, getMySubmissions);
router.post('/:taskId/submit', protect, upload.single('solutions'), submitTheory);
router.get('/:taskId/submission', protect, getSubmission);

export default router;
