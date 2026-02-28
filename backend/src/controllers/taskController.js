import Task from '../models/Task.js';
import User from '../models/User.js';
import TokenLedger from '../models/TokenLedger.js';

/**
 * GET /api/tasks/course/:courseId
 * Query params: ?difficulty=easy&type=reading&announcement=ID&date=2026-03-01&pass=1&revision=true
 */
export const getCourseTasks = async (req, res) => {
    try {
        const filter = { course: req.params.courseId };
        if (req.query.difficulty) filter.difficulty = req.query.difficulty;
        if (req.query.type) filter.type = req.query.type;
        if (req.query.announcement) filter.announcement = req.query.announcement;
        if (req.query.pass) filter.passNumber = parseInt(req.query.pass, 10);
        if (req.query.revision !== undefined) filter.isRevision = req.query.revision === 'true';

        // Filter by exact date (tasks scheduled for that day)
        if (req.query.date) {
            const day = new Date(req.query.date);
            day.setHours(0, 0, 0, 0);
            const nextDay = new Date(day);
            nextDay.setDate(nextDay.getDate() + 1);
            filter.scheduledDate = { $gte: day, $lt: nextDay };
        }

        // Exclude superseded tasks unless explicitly requested
        if (req.query.includeSuperseded !== 'true') {
            filter.status = { $ne: 'superseded' };
        }

        // Filter by assignedTo if userId provided
        if (req.query.userId) {
            filter.$or = [
                { assignedTo: null },
                { assignedTo: req.query.userId },
            ];
        }

        const tasks = await Task.find(filter)
            .populate('course', 'title creditWeight durationType')
            .populate('announcement', 'title eventType eventDate topics')
            .sort({ scheduledDate: 1, createdAt: -1 });

        return res.status(200).json({ success: true, count: tasks.length, data: tasks });
    } catch (err) {
        console.error('❌ getCourseTasks:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/tasks/today/:courseId
 * Get today's scheduled tasks for a specific course.
 */
export const getTodaysTasks = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const filter = {
            course: req.params.courseId,
            scheduledDate: { $gte: today, $lt: tomorrow },
            status: { $ne: 'superseded' },
        };

        // Filter by assignedTo if userId provided
        if (req.query.userId) {
            filter.$or = [
                { assignedTo: null },
                { assignedTo: req.query.userId },
            ];
        }

        const tasks = await Task.find(filter)
            .populate('course', 'title creditWeight durationType')
            .populate('announcement', 'title eventType eventDate topics')
            .sort({ passNumber: 1, difficulty: 1 });

        return res.status(200).json({
            success: true,
            count: tasks.length,
            date: today.toISOString().split('T')[0],
            data: tasks,
        });
    } catch (err) {
        console.error('❌ getTodaysTasks:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/tasks/schedule/:courseId
 * Get the full day-by-day schedule for a course, grouped by date.
 */
export const getSchedule = async (req, res) => {
    try {
        const filter = {
            course: req.params.courseId,
            status: { $ne: 'superseded' },
        };

        // Filter by assignedTo if userId provided
        if (req.query.userId) {
            filter.$or = [
                { assignedTo: null },
                { assignedTo: req.query.userId },
            ];
        }

        const tasks = await Task.find(filter)
            .populate('announcement', 'title eventType eventDate')
            .sort({ scheduledDate: 1, passNumber: 1 });

        // Group by date
        const schedule = {};
        for (const task of tasks) {
            const dateKey = task.scheduledDate.toISOString().split('T')[0];
            if (!schedule[dateKey]) {
                schedule[dateKey] = {
                    date: dateKey,
                    dayOfWeek: task.scheduledDate.toLocaleDateString('en-US', { weekday: 'long' }),
                    tasks: [],
                };
            }
            schedule[dateKey].tasks.push(task);
        }

        const grouped = Object.values(schedule);

        return res.status(200).json({
            success: true,
            totalDays: grouped.length,
            totalTasks: tasks.length,
            data: grouped,
        });
    } catch (err) {
        console.error('❌ getSchedule:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/tasks/:taskId
 */
export const getTaskById = async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate('course', 'title creditWeight instructor durationType')
            .populate('announcement', 'title eventType eventDate topics');

        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
        return res.status(200).json({ success: true, data: task });
    } catch (err) {
        console.error('❌ getTaskById:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
