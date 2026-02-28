import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { createComplaint, getMyComplaints } from '../controllers/complaintController.js';

const router = Router();

router.post('/', protect, createComplaint);
router.get('/mine', protect, getMyComplaints);

export default router;
