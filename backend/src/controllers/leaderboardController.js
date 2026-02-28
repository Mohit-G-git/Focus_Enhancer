import User from '../models/User.js';
import CourseProficiency from '../models/CourseProficiency.js';
import Course from '../models/Course.js';

/* ================================================================
   LEADERBOARD CONTROLLER
   ================================================================
   Endpoints:
     GET /api/leaderboard/overall        → Overall token + reputation
     GET /api/leaderboard/course/:courseId → Course proficiency + reputation
   ================================================================ */

/**
 * GET /api/leaderboard/overall
 * Query: ?page=1&limit=20
 *
 * Returns users ranked by tokenBalance DESC, then reputation DESC.
 * Includes name, tokenBalance, reputation, stats summary.
 */
export const getOverallLeaderboard = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const skip = (page - 1) * limit;

        const users = await User.find({})
            .select('name studentId department tokenBalance reputation stats.tasksCompleted stats.quizzesPassed stats.upvotesReceived stats.downvotesLost')
            .sort({ tokenBalance: -1, reputation: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await User.countDocuments({});

        const leaderboard = users.map((u, i) => ({
            rank: skip + i + 1,
            userId: u._id,
            name: u.name,
            studentId: u.studentId || null,
            department: u.department || null,
            tokenBalance: u.tokenBalance,
            reputation: u.reputation,
            stats: {
                tasksCompleted: u.stats?.tasksCompleted || 0,
                quizzesPassed: u.stats?.quizzesPassed || 0,
                upvotesReceived: u.stats?.upvotesReceived || 0,
                downvotesLost: u.stats?.downvotesLost || 0,
            },
        }));

        return res.status(200).json({
            success: true,
            count: leaderboard.length,
            total,
            page,
            data: leaderboard,
        });
    } catch (err) {
        console.error('❌ getOverallLeaderboard:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/leaderboard/course/:courseId
 * Query: ?page=1&limit=20
 *
 * Returns students ranked by proficiencyScore DESC within a course.
 * Includes name, proficiencyScore, reputation, course-specific metrics.
 */
export const getCourseLeaderboard = async (req, res) => {
    try {
        const { courseId } = req.params;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const skip = (page - 1) * limit;

        // Verify course exists
        const course = await Course.findById(courseId).select('title courseCode');
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        const proficiencies = await CourseProficiency.find({ course: courseId })
            .populate('user', 'name studentId department reputation tokenBalance')
            .sort({ proficiencyScore: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await CourseProficiency.countDocuments({ course: courseId });

        const leaderboard = proficiencies.map((p, i) => ({
            rank: skip + i + 1,
            userId: p.user?._id,
            name: p.user?.name,
            studentId: p.user?.studentId || null,
            department: p.user?.department || null,
            reputation: p.user?.reputation || 0,
            proficiencyScore: p.proficiencyScore,
            metrics: {
                upvotesReceived: p.upvotesReceived,
                downvotesReceived: p.downvotesReceived,
                downvotesLost: p.downvotesLost,
                downvotesDefended: p.downvotesDefended,
                tasksCompleted: p.tasksCompleted,
                quizzesPassed: p.quizzesPassed,
                quizzesFailed: p.quizzesFailed,
            },
        }));

        return res.status(200).json({
            success: true,
            course: { _id: course._id, title: course.title, courseCode: course.courseCode },
            count: leaderboard.length,
            total,
            page,
            data: leaderboard,
        });
    } catch (err) {
        console.error('❌ getCourseLeaderboard:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
