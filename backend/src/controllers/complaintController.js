import CRComplaint from '../models/CRComplaint.js';
import Course from '../models/Course.js';
import User from '../models/User.js';

/* ================================================================
   COMPLAINT CONTROLLER — Students file complaints against CRs
   ================================================================
   • Any enrolled student can file ONE complaint per course per CR tenure
   • If unique complaints exceed 50 % of batch → CR is auto-dismissed
   • CR identity is NEVER exposed to the frontend
   • After dismissal the CR slot re-opens (first-come-first-serve)
   ================================================================ */

/**
 * POST /api/complaints
 * Body: { courseId, type, description? }
 */
export const createComplaint = async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId, type, description } = req.body;

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        if (!course.courseRep) {
            return res.status(400).json({ success: false, message: 'This course currently has no CR assigned' });
        }
        if (course.courseRep.toString() === userId) {
            return res.status(400).json({ success: false, message: 'You cannot file a complaint against yourself' });
        }
        if (!course.enrolledStudents.some((s) => s.toString() === userId)) {
            return res.status(403).json({ success: false, message: 'You must be enrolled in this course to file a complaint' });
        }

        // One complaint per student per course per CR tenure
        const existing = await CRComplaint.findOne({
            complainant: userId,
            course: courseId,
            cr: course.courseRep,
        });
        if (existing) {
            return res.status(409).json({ success: false, message: 'You have already filed a complaint for this course\'s CR' });
        }

        await CRComplaint.create({
            complainant: userId,
            course: courseId,
            cr: course.courseRep,
            type,
            description: description || '',
        });

        // Count active complaints against this CR for this course
        const complaintCount = await CRComplaint.countDocuments({
            course: courseId,
            cr: course.courseRep,
            status: 'pending',
        });

        const batchSize = course.enrolledStudents.length;
        let dismissed = false;

        // > 50 % of batch → dismiss CR
        if (batchSize > 0 && complaintCount / batchSize > 0.5) {
            const crUserId = course.courseRep;

            course.courseRep = null;
            await course.save();

            // Mark all pending complaints against this CR as resolved
            await CRComplaint.updateMany(
                { course: courseId, cr: crUserId, status: 'pending' },
                { status: 'resolved' },
            );

            // Revert role to 'student' if no longer CR for any course
            const otherCrCourses = await Course.countDocuments({ courseRep: crUserId });
            if (otherCrCourses === 0) {
                await User.findByIdAndUpdate(crUserId, { role: 'student' });
            }

            dismissed = true;
        }

        return res.status(201).json({
            success: true,
            message: dismissed
                ? 'Complaint filed. The CR has been dismissed due to exceeding the complaint threshold.'
                : 'Complaint filed successfully.',
            data: { dismissed, complaintCount, batchSize },
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'You have already filed a complaint for this course\'s CR' });
        }
        console.error('❌ createComplaint:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/complaints
 * Returns complaints filed by the current user. CR identity is anonymous.
 */
export const getMyComplaints = async (req, res) => {
    try {
        const complaints = await CRComplaint.find({ complainant: req.user.id })
            .populate('course', 'courseCode title')
            .sort({ createdAt: -1 });

        return res.json({
            success: true,
            count: complaints.length,
            data: complaints.map((c) => ({
                _id: c._id,
                courseCode: c.course?.courseCode,
                courseTitle: c.course?.title,
                type: c.type,
                description: c.description,
                status: c.status,
                createdAt: c.createdAt,
            })),
        });
    } catch (err) {
        console.error('❌ getMyComplaints:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/complaints/stats
 * For each enrolled course (that has a CR and user is not the CR),
 * return complaint count vs batch size. CR identity stays anonymous.
 */
export const getComplaintStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        const courses = await Course.find({
            _id: { $in: user.enrolledCourses || [] },
            courseRep: { $ne: null },
        }).select('courseCode title enrolledStudents courseRep');

        const stats = [];
        for (const course of courses) {
            if (course.courseRep.toString() === userId) continue; // skip if I'm CR

            const complaintCount = await CRComplaint.countDocuments({
                course: course._id,
                cr: course.courseRep,
                status: 'pending',
            });

            const myComplaint = await CRComplaint.findOne({
                complainant: userId,
                course: course._id,
                cr: course.courseRep,
            });

            stats.push({
                courseId: course._id,
                courseCode: course.courseCode,
                title: course.title,
                batchSize: course.enrolledStudents.length,
                complaintCount,
                alreadyFiled: !!myComplaint,
            });
        }

        return res.json({ success: true, data: stats });
    } catch (err) {
        console.error('❌ getComplaintStats:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
