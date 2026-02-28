import { Router } from 'express';
import { createAnnouncement, getCourseAnnouncements } from '../controllers/announcementController.js';
import { protect } from '../middleware/auth.js';
import { announcementRules, validate } from '../middleware/validate.js';

const router = Router();

router.post('/', protect, announcementRules, validate, createAnnouncement);
router.get('/course/:courseId', getCourseAnnouncements);

export default router;
