import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function Navbar() {
    const { user, isAuthenticated, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [crOpen, setCrOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const crRef = useRef(null);
    const profileRef = useRef(null);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (crRef.current && !crRef.current.contains(e.target)) setCrOpen(false);
            if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Get enrolled courses with proper names
    const enrolledCourses = (user?.enrolledCourses || []).map((c) => {
        if (typeof c === 'object' && c !== null) {
            return { id: c._id || c.id, code: c.courseCode || c.code || '', name: c.title || c.name || '' };
        }
        return { id: c, code: '', name: '' };
    });

    const handleCRClick = (courseId) => {
        setCrOpen(false);
        navigate(`/cr/${courseId}`);
    };

    return (
        <nav className="navbar">
            <Link to={isAuthenticated ? '/home' : '/'} className="logo">
                Focus Enhancer
            </Link>

            <div className="navbar-right">
                {isAuthenticated && (
                    <>
                        <Link to="/chatbot" className="btn btn-ghost btn-sm">💬 AI Chat</Link>

                        {/* Become CR Dropdown */}
                        <div className="dropdown" ref={crRef}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setCrOpen(!crOpen)}>
                                🎓 Become CR ▾
                            </button>
                            {crOpen && (
                                <div className="dropdown-menu">
                                    {enrolledCourses.length > 0 ? (
                                        enrolledCourses.map((c) => (
                                            <button key={c.id} className="dropdown-item" onClick={() => handleCRClick(c.id)}>
                                                {c.code ? `${c.code} — ` : ''}{c.name || c.id}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="dropdown-item" style={{ color: 'var(--text-tertiary)', cursor: 'default' }}>
                                            Enroll in courses first
                                            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                                                Go to <span style={{ color: 'var(--accent)', cursor: 'pointer' }}
                                                    onClick={() => { setCrOpen(false); navigate('/profile'); }}>Profile</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Theme Toggle */}
                <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>

                {/* Auth / Profile */}
                {isAuthenticated ? (
                    <div className="dropdown" ref={profileRef}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setProfileOpen(!profileOpen)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'var(--accent-gradient)', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.75rem',
                            }}>
                                {user?.name?.[0]?.toUpperCase() || 'U'}
                            </span>
                            {user?.name?.split(' ')[0] || 'User'}
                        </button>
                        {profileOpen && (
                            <div className="dropdown-menu">
                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user?.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{user?.email}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                                        🪙 {user?.tokenBalance || 0} tokens • ⭐ {user?.reputation || 0} rep
                                    </div>
                                </div>
                                <button className="dropdown-item" onClick={() => { setProfileOpen(false); navigate('/profile'); }}>
                                    ⚙️ Profile & Courses
                                </button>
                                <button className="dropdown-item" onClick={() => { setProfileOpen(false); logout(); navigate('/'); }}
                                    style={{ color: 'var(--danger)' }}>
                                    🚪 Logout
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
                        <Link to="/signup" className="btn btn-primary btn-sm">Sign Up</Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
