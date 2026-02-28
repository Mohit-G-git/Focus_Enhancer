import Announcement from '../models/Announcement.js';
import Course from '../models/Course.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { generateTasks } from '../services/aiTaskGenerator.js';

/**
 * POST /api/announcements
 * CR-only: Create an announcement for a course the user is CR of.
 */
export const createAnnouncement = async (req, res) => {
    try {
        const { courseId, eventType, title, topics, eventDate, description } = req.body;

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        // ── CR-only gating ─────────────────────────────────────
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

        const user = await User.findById(userId);
        if (!user || user.role !== 'cr') {
            return res.status(403).json({ success: false, message: 'Only CRs can create announcements' });
        }
        if (!course.courseRep || course.courseRep.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not the CR for this course',
            });
        }

        // Validate event date is in the future
        const evDate = new Date(eventDate);
        if (evDate <= new Date()) {
            return res.status(400).json({ success: false, message: 'eventDate must be in the future' });
        }

        const announcement = await Announcement.create({
            course: courseId,
            eventType,
            title,
            topics,
            eventDate: evDate,
            description: description || '',
            anonymous: true,
            createdBy: userId,
            tasksGenerated: false,
        });

        // Update course's last announcement date
        course.lastAnnouncementDate = new Date();
        await course.save();

        console.log(`📢 Announcement: "${title}" for ${course.title} by CR ${user.name}`);

        // Auto-generate tasks via AI
        let generatedTasks = [];
        try {
            const taskData = await generateTasks({
                courseName: course.title,
                creditWeight: course.creditWeight,
                durationType: course.durationType,
                courseId: course._id.toString(),
                announcementId: announcement._id.toString(),
                eventType,
                topics,
                eventDate: announcement.eventDate,
                bookPdfPath: course.bookPdfPath || null,
            });
            generatedTasks = await Task.insertMany(taskData);
            announcement.tasksGenerated = true;
            await announcement.save();
            console.log(`🤖 Generated ${generatedTasks.length} tasks`);

            // ── Supersede old overlapping tasks ────────────────
            if (generatedTasks.length > 0) {
                try {
                    const newIds = generatedTasks.map((t) => t._id);
                    const dates = generatedTasks.map((t) => new Date(t.scheduledDate));
                    const minDate = new Date(Math.min(...dates));
                    minDate.setHours(0, 0, 0, 0);
                    const maxDate = new Date(Math.max(...dates));
                    maxDate.setDate(maxDate.getDate() + 1);
                    maxDate.setHours(0, 0, 0, 0);

                    const oldTasks = await Task.find({
                        course: course._id,
                        _id: { $nin: newIds },
                        status: 'pending',
                        scheduledDate: { $gte: minDate, $lt: maxDate },
                    });

                    if (oldTasks.length > 0) {
                        const activeAttemptTaskIds = await QuizAttempt.find({
                            task: { $in: oldTasks.map((t) => t._id) },
                            status: 'mcq_in_progress',
                        }).distinct('task');

                        const protectedSet = new Set(activeAttemptTaskIds.map((id) => id.toString()));
                        const toSupersede = oldTasks.filter((t) => !protectedSet.has(t._id.toString()));

                        if (toSupersede.length > 0) {
                            await Task.updateMany(
                                { _id: { $in: toSupersede.map((t) => t._id) } },
                                { status: 'superseded', supersededBy: announcement._id },
                            );
                            console.log(`♻️  Superseded ${toSupersede.length} old tasks (${protectedSet.size} protected)`);
                        }
                    }
                } catch (superErr) {
                    console.error(`⚠️  Supersession check failed: ${superErr.message}`);
                }
            }
        } catch (aiErr) {
            console.error(`❌ AI task gen failed: ${aiErr.message}`);
        }

        return res.status(201).json({
            success: true,
            message: `Announcement created. ${generatedTasks.length} tasks generated.`,
            data: { announcement, tasks: generatedTasks },
        });
    } catch (err) {
        console.error('❌ createAnnouncement:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/announcements
 * Get all active announcements for the authenticated user's enrolled courses.
 */
export const getMyAnnouncements = async (req, res) => {
    try {
        const User = (await import('../models/User.js')).default;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const courseIds = user.enrolledCourses || [];
        if (courseIds.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const announcements = await Announcement.find({
            course: { $in: courseIds },
            isActive: true,
        })
            .populate('course', 'courseCode title')
            .sort({ eventDate: 1 })
            .select('-createdBy');

        return res.status(200).json({ success: true, count: announcements.length, data: announcements });
    } catch (err) {
        console.error('❌ getMyAnnouncements:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/announcements/course/:courseId
 */
export const getCourseAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.find({
            course: req.params.courseId,
            isActive: true,
        })
            .sort({ eventDate: 1 })
            .select('-createdBy');

        return res.status(200).json({ success: true, count: announcements.length, data: announcements });
    } catch (err) {
        console.error('❌ getCourseAnnouncements:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
