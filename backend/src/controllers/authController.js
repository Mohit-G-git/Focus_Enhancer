import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import TokenLedger from '../models/TokenLedger.js';

/**
 * POST /api/auth/register
 * Body: { name, email, password, role?, studentId?, department?, semester?, year?, university? }
 */
export const register = async (req, res) => {
    try {
        const {
            name, email, password, role,
            studentId, department, semester, year, university,
        } = req.body;

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        // Check studentId uniqueness if provided
        if (studentId) {
            const idExists = await User.findOne({ studentId });
            if (idExists) {
                return res.status(409).json({ success: false, message: 'Student ID already registered' });
            }
        }

        const user = await User.create({
            name,
            email,
            passwordHash: password, // pre-save hook hashes it
            role: role || 'student',
            studentId: studentId || undefined,
            department: department || undefined,
            semester: semester || undefined,
            year: year || undefined,
            university: university || undefined,
        });

        // Grant initial tokens
        await TokenLedger.create({
            userId: user._id,
            type: 'initial',
            amount: 100,
            balanceAfter: 100,
            note: 'Welcome bonus: 100 tokens',
        });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    studentId: user.studentId,
                    department: user.department,
                    tokenBalance: user.tokenBalance,
                },
            },
        });
    } catch (err) {
        console.error('❌ register:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email }).select('+passwordHash');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Update streak on login
        user.updateStreak();
        await user.save();

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    studentId: user.studentId,
                    department: user.department,
                    tokenBalance: user.tokenBalance,
                    reputation: user.reputation,
                    streak: user.streak,
                    stats: user.stats,
                },
            },
        });
    } catch (err) {
        console.error('❌ login:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /api/auth/me
 * Returns current user's full profile (requires JWT).
 */
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('enrolledCourses', 'courseCode title creditWeight durationType currentChapterIndex chapters');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        return res.status(200).json({ success: true, data: user });
    } catch (err) {
        console.error('❌ getMe:', err.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * PUT /api/auth/profile
 * Update profile metadata (studentId, department, semester, year, university, avatar, name).
 */
export const updateProfile = async (req, res) => {
    try {
        const allowedFields = ['name', 'studentId', 'department', 'semester', 'year', 'university', 'avatar'];
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        // Check studentId uniqueness if changing it
        if (updates.studentId) {
            const idExists = await User.findOne({
                studentId: updates.studentId,
                _id: { $ne: req.user.id },
            });
            if (idExists) {
                return res.status(409).json({ success: false, message: 'Student ID already in use' });
            }
        }

        const user = await User.findByIdAndUpdate(req.user.id, updates, {
            new: true,
            runValidators: true,
        }).populate('enrolledCourses', 'courseCode title creditWeight durationType');

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        return res.status(200).json({
            success: true,
            message: 'Profile updated',
            data: user,
        });
    } catch (err) {
        console.error('❌ updateProfile:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
