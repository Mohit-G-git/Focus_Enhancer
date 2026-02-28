import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { courseAPI, announcementAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function CRPage() {
    const { courseId } = useParams();
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isCR, setIsCR] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [claiming, setClaiming] = useState(false);
    const [annForm, setAnnForm] = useState({
        title: '', body: '', type: 'QUIZ', topics: '', eventDate: '',
        schedule: '', quizDate: '', quizTopics: '', quizFormat: 'MCQ', additionalNotes: '',
    });
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        setLoading(true);
        courseAPI.getOne(courseId)
            .then((res) => {
                const c = res.data.data || res.data;
                setCourse(c);
                // Check if current user is the CR
                const crId = c.courseRep?._id || c.courseRep;
                const userId = user?._id || user?.id;
                setIsCR(crId && userId && crId.toString() === userId.toString());
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [courseId, user]);

    const handleClaim = async () => {
        setClaiming(true);
        setError('');
        try {
            await courseAPI.claimCR(courseId);
            await refreshUser();
            const res = await courseAPI.getOne(courseId);
            const c = res.data.data || res.data;
            setCourse(c);
            setIsCR(true);
            setStatus('✅ You are now the CR for this course!');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to claim CR');
        } finally {
            setClaiming(false);
        }
    };

    const handleAnnouncement = async (e) => {
        e.preventDefault();
        setPosting(true);
        setError('');

        let fullBody = annForm.body;
        if (annForm.schedule) fullBody += `\n\nClass Schedule: ${annForm.schedule}`;
        if (annForm.quizDate) fullBody += `\nQuiz/Exam Date: ${annForm.quizDate}`;
        if (annForm.quizTopics) fullBody += `\nQuiz Topics: ${annForm.quizTopics}`;
        if (annForm.quizFormat) fullBody += `\nFormat: ${annForm.quizFormat}`;
        if (annForm.additionalNotes) fullBody += `\nNotes: ${annForm.additionalNotes}`;

        try {
            const topicsArray = annForm.topics
                ? annForm.topics.split(',').map((t) => t.trim()).filter(Boolean)
                : [];
            await announcementAPI.create({
                courseId,
                title: annForm.title,
                body: fullBody,
                type: annForm.type,
                topics: topicsArray,
                eventDate: annForm.eventDate || annForm.quizDate || undefined,
            });
            setStatus('✅ Announcement posted! AI is generating study plan tasks...');
            setAnnForm({
                title: '', body: '', type: 'QUIZ', topics: '', eventDate: '',
                schedule: '', quizDate: '', quizTopics: '', quizFormat: 'MCQ', additionalNotes: '',
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to post announcement');
        } finally {
            setPosting(false);
        }
    };

    const af = (key, val) => setAnnForm((f) => ({ ...f, [key]: val }));

    if (loading) return <div className="spinner" />;

    return (
        <div className="profile-page" style={{ maxWidth: 620 }}>
            <h2>🎓 Course Representative</h2>
            <p className="subtitle">
                {course ? `${course.courseCode} — ${course.title}` : 'Course not found'}
            </p>

            {error && <div className="error-msg">{error}</div>}
            {status && <div style={{
                background: 'var(--success-light)', color: 'var(--success)',
                padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: '0.85rem'
            }}>{status}</div>}

            {/* ── Not CR yet: Show claim button ──────────────────── */}
            {!isCR && (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👑</div>
                    <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Become the CR</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
                        {course?.courseRep
                            ? 'This course already has a CR assigned.'
                            : 'No CR assigned yet. Claim this role to post announcements and generate AI study plans for students.'}
                    </p>
                    <button className="btn btn-primary btn-lg" onClick={handleClaim}
                        disabled={claiming || !!course?.courseRep}>
                        {claiming ? 'Claiming...' : course?.courseRep ? 'CR Already Assigned' : '👑 Claim CR'}
                    </button>
                </div>
            )}

            {/* ── Is CR: Show announcement form ─────────────────── */}
            {isCR && (
                <div className="card" style={{ marginTop: 8 }}>
                    <h3 style={{ fontWeight: 700, marginBottom: 4, fontSize: '1rem' }}>📢 Post Announcement</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>
                        Add timetable, quiz details, and topics — AI will generate study plan tasks for students.
                    </p>

                    <form onSubmit={handleAnnouncement}>
                        <div className="input-group" style={{ marginBottom: 12 }}>
                            <label>Announcement Title</label>
                            <input type="text" value={annForm.title} required onChange={(e) => af('title', e.target.value)}
                                placeholder="e.g. Mid-Sem Exam Preparation" />
                        </div>

                        <div className="input-group" style={{ marginBottom: 12 }}>
                            <label>Description</label>
                            <textarea value={annForm.body} required rows={2} onChange={(e) => af('body', e.target.value)}
                                placeholder="Brief description of the event..." />
                        </div>

                        {/* Timetable & Schedule */}
                        <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
                            <div style={{
                                fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
                                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12
                            }}>
                                📅 Timetable & Quiz Details
                            </div>
                            <div className="profile-grid">
                                <div className="input-group">
                                    <label>Class Schedule</label>
                                    <input type="text" value={annForm.schedule} onChange={(e) => af('schedule', e.target.value)}
                                        placeholder="Mon 10am, Wed 2pm" />
                                </div>
                                <div className="input-group">
                                    <label>Quiz/Exam Date</label>
                                    <input type="date" value={annForm.quizDate} onChange={(e) => af('quizDate', e.target.value)} />
                                </div>
                                <div className="input-group">
                                    <label>Quiz Format</label>
                                    <select value={annForm.quizFormat} onChange={(e) => af('quizFormat', e.target.value)}>
                                        <option value="MCQ">MCQ</option>
                                        <option value="Theory">Theory/Written</option>
                                        <option value="Mixed">Mixed (MCQ + Theory)</option>
                                        <option value="Practical">Practical/Lab</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label>Type</label>
                                    <select value={annForm.type} onChange={(e) => af('type', e.target.value)}>
                                        <option value="QUIZ">Quiz</option>
                                        <option value="ASSIGNMENT">Assignment</option>
                                        <option value="GENERAL">General</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: 12 }}>
                            <label>📝 Topics for Study Plan (comma-separated)</label>
                            <input type="text" value={annForm.topics} onChange={(e) => af('topics', e.target.value)}
                                placeholder="e.g. Linear Regression, Neural Networks, CNNs" />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                AI will generate daily tasks cycling through these topics
                            </span>
                        </div>

                        <div className="input-group" style={{ marginBottom: 12 }}>
                            <label>Event Date (study plan deadline)</label>
                            <input type="date" value={annForm.eventDate} onChange={(e) => af('eventDate', e.target.value)} />
                        </div>

                        <div className="input-group" style={{ marginBottom: 16 }}>
                            <label>Additional Notes for AI</label>
                            <textarea value={annForm.additionalNotes} rows={2} onChange={(e) => af('additionalNotes', e.target.value)}
                                placeholder="e.g. Focus on proofs, skip derivations, exam is open-book..." />
                        </div>

                        <button className="btn btn-primary" type="submit" disabled={posting} style={{ width: '100%' }}>
                            {posting ? '⏳ Posting & Generating...' : '📢 Post & Generate Study Plan'}
                        </button>
                    </form>
                </div>
            )}

            <button className="btn btn-ghost" onClick={() => navigate('/home')} style={{ marginTop: 20, width: '100%' }}>
                ← Back to Home
            </button>
        </div>
    );
}
