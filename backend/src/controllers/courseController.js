import Course from '../models/Course.js';
import User from '../models/User.js';
import { extractChapters } from '../services/chapterExtractor.js';

/* ================================================================
   COURSE CONTROLLER
   ================================================================
   Endpoints:
     POST   /api/courses               → createCourse
     GET    /api/courses                → getCourses
     GET    /api/courses/:courseId       → getCourse
     PUT    /api/courses/:courseId/claim-cr   → claimCR
     POST   /api/courses/:courseId/upload-book → uploadBook (CR only)
     POST   /api/courses/:courseId/enroll      → enrollStudent
     GET    /api/courses/:courseId/students     → getEnrolledStudents
   ================================================================ */

/**
 * POST /api/courses
 * Create a new course. Any authenticated user can seed a course.
 */
export const createCourse = async (req, res) => {
    try {
        const {
            courseCode, title, department, semester, year,
            durationType, creditWeight, syllabus, instructor,
        } = req.body;

        const exists = await Course.findOne({ courseCode: courseCode.toUpperCase() });
        if (exists) {
            return res.status(409).json({ success: false, message: 'Course code already exists' });
        }

        const course = await Course.create({
            courseCode: courseCode.toUpperCase(),
            title,
            department,
            semester,
            year,
            durationType: durationType || 'full',
            creditWeight: creditWeight || 3,
            syllabus: syllabus || '',
            instructor: instructor || '',
        });

        return res.status(201).json({
            success: true,
            message: `Course "${title}" created`,
            data: course,
        });
    } catch (err) {
        console.error('❌ createCourse:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/courses
 * List all courses. Supports filtering by department, semester, year.
 */
export const getCourses = async (req, res) => {
    try {
        const filter = {};
        if (req.query.department) filter.department = req.query.department;
        if (req.query.semester) filter.semester = parseInt(req.query.semester, 10);
        if (req.query.year) filter.year = parseInt(req.query.year, 10);

        const courses = await Course.find(filter)
            .select('-enrolledStudents')
            .sort({ courseCode: 1 });

        // CR stays anonymous — only expose whether a CR exists
        const sanitized = courses.map((c) => {
            const obj = c.toJSON();
            obj.hasCR = !!obj.courseRep;
            delete obj.courseRep;
            return obj;
        });

        return res.status(200).json({
            success: true,
            count: sanitized.length,
            data: sanitized,
        });
    } catch (err) {
        console.error('❌ getCourses:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/courses/:courseId
 * Get single course. CR sees enrolledStudents; others don't.
 */
export const getCourse = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        const data = course.toJSON();
        const userId = req.user?.id;
        const isCR = userId && course.courseRep?.toString() === userId;

        // CR stays anonymous — only the CR themselves see their status
        data.hasCR = !!data.courseRep;
        data.isMeCR = isCR;
        delete data.courseRep;

        // Only the course CR sees the enrolled students list
        if (!isCR) {
            delete data.enrolledStudents;
            data.enrolledCount = course.enrolledStudents?.length || 0;
        } else {
            await course.populate('enrolledStudents', 'name email studentId department');
            data.enrolledStudents = course.enrolledStudents;
        }

        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('❌ getCourse:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * PUT /api/courses/:courseId/claim-cr
 * A student claims the CR role for this course.
 * Fails if course already has a CR.
 */
export const claimCR = async (req, res) => {
    try {
        const userId = req.user.id;
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        if (course.courseRep) {
            return res.status(409).json({
                success: false,
                message: 'This course already has a CR assigned',
            });
        }

        // Assign CR
        course.courseRep = userId;
        await course.save();

        // Promote user role to 'cr' if currently 'student'
        const user = await User.findById(userId);
        if (user && user.role === 'student') {
            user.role = 'cr';
            await user.save();
        }

        // Auto-enroll CR if not enrolled
        if (!user.enrolledCourses.some((c) => c.toString() === course._id.toString())) {
            user.enrolledCourses.push(course._id);
            await user.save();
            if (!course.enrolledStudents.some((s) => s.toString() === userId)) {
                course.enrolledStudents.push(userId);
                await course.save();
            }
        }

        return res.status(200).json({
            success: true,
            message: `You are now the CR for "${course.title}"`,
            data: { courseId: course._id, courseCode: course.courseCode },
        });
    } catch (err) {
        console.error('❌ claimCR:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/courses/:courseId/upload-book
 * CR-only: Upload the course textbook PDF.
 * Auto-extracts chapters for fallback task generation.
 */
export const uploadBook = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No PDF uploaded' });

        const userId = req.user.id;
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        // Only the assigned CR can upload
        if (!course.courseRep || course.courseRep.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the assigned CR can upload the textbook for this course',
            });
        }

        // Store book metadata
        course.bookPdfPath = req.file.path;
        course.bookTitle = req.body.bookTitle || req.file.originalname.replace('.pdf', '');
        course.book = {
            originalName: req.file.originalname,
            storedPath: req.file.path,
            sizeBytes: req.file.size,
            uploadedAt: new Date(),
            uploadedBy: userId,
        };

        // Auto-extract chapters
        try {
            const chapters = await extractChapters(req.file.path);
            course.chapters = chapters;
            course.currentChapterIndex = 0;
            console.log(`📖 Extracted ${chapters.length} chapters from "${course.bookTitle}"`);
        } catch (extractErr) {
            console.warn(`⚠️  Chapter extraction failed: ${extractErr.message}`);
        }

        await course.save();

        return res.status(200).json({
            success: true,
            message: `Book "${course.bookTitle}" uploaded for ${course.title}`,
            data: {
                bookTitle: course.bookTitle,
                chapters: course.chapters?.length || 0,
                sizeBytes: req.file.size,
            },
        });
    } catch (err) {
        console.error('❌ uploadBook:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/courses/:courseId/enroll
 * Student self-enrolls in a course.
 */
export const enrollStudent = async (req, res) => {
    try {
        const userId = req.user.id;
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        // Check if already enrolled
        if (course.enrolledStudents.some((s) => s.toString() === userId)) {
            return res.status(409).json({ success: false, message: 'Already enrolled in this course' });
        }

        // Add to course's student list
        course.enrolledStudents.push(userId);
        await course.save();

        // Add to user's enrolled courses
        const user = await User.findById(userId);
        if (!user.enrolledCourses.some((c) => c.toString() === course._id.toString())) {
            user.enrolledCourses.push(course._id);
            await user.save();
        }

        return res.status(200).json({
            success: true,
            message: `Enrolled in "${course.title}"`,
            data: { courseId: course._id, courseCode: course.courseCode },
        });
    } catch (err) {
        console.error('❌ enrollStudent:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/courses/:courseId/students
 * CR-only: List enrolled students.
 */
export const getEnrolledStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const course = await Course.findById(req.params.courseId)
            .populate('enrolledStudents', 'name email studentId department semester');

        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        if (!course.courseRep || course.courseRep.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the course CR can view enrolled students',
            });
        }

        return res.status(200).json({
            success: true,
            count: course.enrolledStudents.length,
            data: course.enrolledStudents,
        });
    } catch (err) {
        console.error('❌ getEnrolledStudents:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};
