import { Router } from 'express';
import { searchUsers } from '../controllers/directChatController.js';
import User from '../models/User.js';

const router = Router();

// Search users by name or email
router.get('/search', searchUsers);

// Public user profile
router.get('/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-passwordHash')
            .populate('enrolledCourses', 'courseCode title');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.json({ success: true, data: user });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
