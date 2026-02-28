import { Router } from 'express';
import { complaintRules, validate } from '../middleware/validate.js';
import {
    createComplaint,
    getMyComplaints,
    getComplaintStats,
} from '../controllers/complaintController.js';

const router = Router();

// NOTE: protect is already applied at the app.use('/api/complaints', protect, ...)
// level in app.js, so we don't need it here.

router.get('/stats', getComplaintStats);
router.get('/', getMyComplaints);
router.post('/', complaintRules, validate, createComplaint);

export default router;
