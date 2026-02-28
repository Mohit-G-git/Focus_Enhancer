import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { courseAPI } from '../api';

export default function Profile() {
    const { user, updateProfile, isFirstVisit, clearFirstVisit, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [allCourses, setAllCourses] = useState([]);
    const [form, setForm] = useState({
        name: '', studentId: '', department: '', semester: '', university: '',
    });
    const [newCourse, setNewCourse] = useState({ courseCode: '', title: '' });
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setForm({
                name: user.name || '',
                studentId: user.studentId || '',
                department: user.department || '',
                semester: user.semester || '',
                university: user.university || '',
            });
        }
        loadCourses();
    }, [user]);

    const loadCourses = () => {
        courseAPI.getAll().then((res) => {
            setAllCourses(res.data.data || res.data || []);
        }).catch(() => { });
    };

    const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

    // Create a new course
    const handleCreateCourse = async () => {
        if (!newCourse.courseCode.trim() || !newCourse.title.trim()) return;
        setCreating(true);
        setError('');
        try {
            await courseAPI.create({
                courseCode: newCourse.courseCode.trim(),
                title: newCourse.title.trim(),
            });
            setNewCourse({ courseCode: '', title: '' });
            loadCourses();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create course');
        } finally {
            setCreating(false);
        }
    };

    // Enroll in a course
    const handleEnroll = async (courseId) => {
        setError('');
        try {
            await courseAPI.enroll(courseId);
            await refreshUser();
            loadCourses();
        } catch (err) {
            setError(err.response?.data?.message || 'Enrollment failed');
        }
    };

    // Check if user is enrolled in a course
    const isEnrolled = (courseId) => {
        return user?.enrolledCourses?.some((c) => (c._id || c) === courseId);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await updateProfile({
                name: form.name,
                studentId: form.studentId || undefined,
                department: form.department || undefined,
                semester: Number(form.semester) || undefined,
                university: form.university || undefined,
            });
            if (isFirstVisit) {
                clearFirstVisit();
                navigate('/welcome');
            } else {
                navigate('/home');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="profile-page">
            <h2>{isFirstVisit ? '👋 Complete Your Profile' : '⚙️ Edit Profile'}</h2>
            <p className="subtitle">
                {isFirstVisit ? 'Set up your profile to get personalized study tasks' : 'Update your details'}
            </p>

            {error && <div className="error-msg">{error}</div>}

            <form onSubmit={handleSave}>
                <div className="profile-grid">
                    <div className="input-group">
                        <label>Full Name</label>
                        <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} required />
                    </div>
                    <div className="input-group">
                        <label>Student ID</label>
                        <input type="text" value={form.studentId} onChange={(e) => update('studentId', e.target.value)}
                            placeholder="e.g. 2024CS101" />
                    </div>
                    <div className="input-group">
                        <label>Department</label>
                        <input type="text" value={form.department} onChange={(e) => update('department', e.target.value)}
                            placeholder="e.g. Computer Science" />
                    </div>
                    <div className="input-group">
                        <label>Semester</label>
                        <select value={form.semester} onChange={(e) => update('semester', e.target.value)}>
                            <option value="">Select</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                        <label>University</label>
                        <input type="text" value={form.university} onChange={(e) => update('university', e.target.value)}
                            placeholder="e.g. IIT Delhi" />
                    </div>
                </div>

                {/* ── Create Course ──────────────────────────────────── */}
                <div style={{ marginTop: 28 }}>
                    <label style={{
                        fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10
                    }}>
                        ➕ Add a New Course
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <div className="input-group" style={{ flex: '0 0 120px' }}>
                            <label style={{ fontSize: '0.7rem' }}>Course Code</label>
                            <input type="text" value={newCourse.courseCode}
                                onChange={(e) => setNewCourse((c) => ({ ...c, courseCode: e.target.value }))}
                                placeholder="CS301" />
                        </div>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.7rem' }}>Course Name</label>
                            <input type="text" value={newCourse.title}
                                onChange={(e) => setNewCourse((c) => ({ ...c, title: e.target.value }))}
                                placeholder="Machine Learning" />
                        </div>
                        <button type="button" className="btn btn-primary btn-sm"
                            onClick={handleCreateCourse} disabled={creating}
                            style={{ height: 40, whiteSpace: 'nowrap' }}>
                            {creating ? '...' : '+ Create'}
                        </button>
                    </div>
                </div>

                {/* ── Enroll in Courses ───────────────────────────────── */}
                <div style={{ marginTop: 24 }}>
                    <label style={{
                        fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10
                    }}>
                        📚 Available Courses — Click to Enroll
                    </label>
                    {allCourses.length === 0 && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                            No courses yet. Create one above!
                        </p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {allCourses.map((c) => (
                            <button key={c._id} type="button" onClick={() => !isEnrolled(c._id) && handleEnroll(c._id)}
                                className={`btn btn-sm ${isEnrolled(c._id) ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ cursor: isEnrolled(c._id) ? 'default' : 'pointer' }}>
                                {isEnrolled(c._id) ? '✓ ' : ''}{c.courseCode} — {c.title}
                            </button>
                        ))}
                    </div>
                </div>

                <button className="btn btn-primary btn-lg" type="submit" disabled={saving}
                    style={{ width: '100%', marginTop: 28 }}>
                    {saving ? 'Saving...' : (isFirstVisit ? 'Continue →' : 'Save Changes')}
                </button>
            </form>
        </div>
    );
}
