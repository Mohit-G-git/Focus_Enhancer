import CRComplaint from '../models/CRComplaint.js';
import Course from '../models/Course.js';

/**
 * POST /api/complaints
 * Body: { courseId, type, description }
 */
export const createComplaint = async (req, res) => {
    try {
        const { courseId, type, description } = req.body;

        if (!courseId || !type || !description) {
            return res.status(400).json({ success: false, message: 'courseId, type, and description are required' });
        }

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
        if (!course.courseRep) {
            return res.status(400).json({ success: false, message: 'This course has no CR assigned' });
        }
        if (course.courseRep.toString() === req.user.id) {
            return res.status(400).json({ success: false, message: 'Cannot file a complaint against yourself' });
        }

        const complaint = await CRComplaint.create({
            complainant: req.user.id,
            course: courseId,
            cr: course.courseRep,
            type,
            description,
        });

        return res.status(201).json({
            success: true,
            message: 'Complaint filed successfully',
            data: complaint,
        });
    } catch (err) {
        console.error('❌ createComplaint:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/complaints/mine
 * Returns complaints filed by the current user.
 */
export const getMyComplaints = async (req, res) => {
    try {
        const complaints = await CRComplaint.find({ complainant: req.user.id })
            .populate('course', 'courseCode title')
            .populate('cr', 'name email')
            .sort({ createdAt: -1 });

        return res.json({ success: true, count: complaints.length, data: complaints });
    } catch (err) {
        console.error('❌ getMyComplaints:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
