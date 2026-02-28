import jwt from 'jsonwebtoken';

/**
 * JWT auth middleware.
 * Expects: Authorization: Bearer <token>
 * Sets req.user = { id, role }
 */
export const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Token invalid or expired' });
    }
};

/**
 * Role-based access control.
 * Usage: authorize('admin') or authorize('cr', 'admin')
 */
export const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: `Role '${req.user?.role}' not authorized`,
        });
    }
    next();
};
