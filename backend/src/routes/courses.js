import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { protect } from '../middleware/auth.js';
import { courseRules, validate } from '../middleware/validate.js';
import {
    createCourse,
    getCourses,
    getCourse,
    claimCR,
    uploadBook,
    enrollStudent,
    getEnrolledStudents,
} from '../controllers/courseController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── Multer for book PDF uploads ────────────────────────────────
const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads')),
        filename: (_, file, cb) => cb(null, `book_${Date.now()}-${file.originalname}`),
    }),
    fileFilter: (_, file, cb) => cb(
        file.mimetype === 'application/pdf' ? null : new Error('Only PDF files allowed'),
        file.mimetype === 'application/pdf',
    ),
    limits: { fileSize: 50 * 1024 * 1024 },
});

// ── Routes ─────────────────────────────────────────────────────
router.post('/', protect, courseRules, validate, createCourse);
router.get('/', getCourses);
router.get('/:courseId', protect, getCourse);
router.put('/:courseId/claim-cr', protect, claimCR);
router.post('/:courseId/upload-book', protect, upload.single('book'), uploadBook);
router.post('/:courseId/enroll', protect, enrollStudent);
router.get('/:courseId/students', protect, getEnrolledStudents);

export default router;
