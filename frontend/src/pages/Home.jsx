import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { taskAPI, leaderboardAPI, courseAPI } from '../api';
import TaskPopup from '../components/TaskPopup';

export default function Home() {
    const { user, refreshUser } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [leaders, setLeaders] = useState([]);
    const [courses, setCourses] = useState([]);
    const [activeCourse, setActiveCourse] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [tab, setTab] = useState('all');

    // Load enrolled courses
    useEffect(() => {
        if (user?.enrolledCourses?.length) {
            const ids = user.enrolledCourses.map((c) => c._id || c);
            courseAPI.getAll().then((res) => {
                const all = res.data.data || res.data || [];
                const enrolled = all.filter((c) => ids.includes(c._id));
                setCourses(enrolled);
                if (enrolled.length > 0 && !activeCourse) setActiveCourse(enrolled[0]._id);
            }).catch(() => { });
        }
    }, [user]);

    // Load tasks for active course
    useEffect(() => {
        if (!activeCourse) return;
        setLoadingTasks(true);
        const fetcher = tab === 'today' ? taskAPI.getToday : taskAPI.getByCourse;
        fetcher(activeCourse).then((res) => {
            setTasks(res.data.data || res.data || []);
        }).catch(() => setTasks([]))
            .finally(() => setLoadingTasks(false));
    }, [activeCourse, tab]);

    // Load leaderboard
    useEffect(() => {
        if (activeCourse) {
            leaderboardAPI.getByCourse(activeCourse)
                .then((res) => setLeaders(res.data.data || res.data || []))
                .catch(() => {
                    leaderboardAPI.getOverall()
                        .then((res) => setLeaders(res.data.data || res.data || []))
                        .catch(() => setLeaders([]));
                });
        } else {
            leaderboardAPI.getOverall()
                .then((res) => setLeaders(res.data.data || res.data || []))
                .catch(() => setLeaders([]));
        }
    }, [activeCourse]);

    const getDifficultyBadge = (d) => {
        const map = {
            EASY: 'badge-easy', MEDIUM: 'badge-medium', HARD: 'badge-hard',
            easy: 'badge-easy', medium: 'badge-medium', hard: 'badge-hard'
        };
        return map[d] || 'badge-accent';
    };

    const formatDeadline = (d) => {
        if (!d) return '';
        const diff = new Date(d) - Date.now();
        if (diff < 0) return 'Expired';
        const hours = Math.floor(diff / 3600000);
        if (hours < 24) return `${hours}h left`;
        return `${Math.floor(hours / 24)}d left`;
    };

    const handleTaskDone = () => {
        setSelectedTask(null);
        refreshUser();
        // Reload tasks
        if (activeCourse) {
            const fetcher = tab === 'today' ? taskAPI.getToday : taskAPI.getByCourse;
            fetcher(activeCourse).then((res) => setTasks(res.data.data || res.data || [])).catch(() => { });
        }
    };

    return (
        <div className="container">
            {/* Stats bar */}
            <div className="stats-bar">
                <div className="stat-chip">🪙 <span className="stat-value">{user?.tokenBalance || 0}</span> Tokens</div>
                <div className="stat-chip">🔥 <span className="stat-value">{user?.streak?.currentDays || 0}</span> Day Streak</div>
                <div className="stat-chip">⭐ <span className="stat-value">{user?.reputation || 0}</span> Reputation</div>
                <div className="stat-chip">✅ <span className="stat-value">{user?.stats?.tasksCompleted || 0}</span> Completed</div>
            </div>

            {/* Course selector tabs */}
            <div className="tab-bar" style={{ overflowX: 'auto' }}>
                {courses.map((c) => (
                    <button key={c._id} className={`tab ${activeCourse === c._id ? 'active' : ''}`}
                        onClick={() => setActiveCourse(c._id)}>
                        {c.courseCode || c.title}
                    </button>
                ))}
                {courses.length === 0 && (
                    <span style={{ padding: '10px 18px', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                        Enroll in courses from your <a href="/profile">Profile</a>
                    </span>
                )}
            </div>

            {/* Task filter tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className={`btn btn-sm ${tab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setTab('all')}>All Tasks</button>
                <button className={`btn btn-sm ${tab === 'today' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setTab('today')}>Today</button>
            </div>

            <div className="home-layout">
                {/* Left: Task list */}
                <div>
                    {loadingTasks && <div className="spinner" />}

                    {!loadingTasks && tasks.length === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📚</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                No tasks available for this course yet.
                            </p>
                        </div>
                    )}

                    <div className="task-list">
                        {tasks.map((task) => (
                            <div key={task._id} className="task-row" onClick={() => setSelectedTask(task)}>
                                <div>
                                    <div className="task-title">{task.title}</div>
                                    <div className="task-topic">{task.topic || task.description?.slice(0, 50)}</div>
                                </div>
                                <span className={`badge ${getDifficultyBadge(task.difficulty)}`}>
                                    {task.difficulty}
                                </span>
                                <span className="task-reward">🪙 {task.tokenReward || task.stakeRequired || 10}</span>
                                <span className="task-deadline">{formatDeadline(task.deadline)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Leaderboard */}
                <div className="leaderboard-panel">
                    <div className="card">
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>🏆 Leaderboard</h3>
                        {leaders.length === 0 && (
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>No rankings yet</p>
                        )}
                        {leaders.slice(0, 15).map((l, i) => (
                            <div key={l._id || i} className="leaderboard-row">
                                <div className={`lb-rank ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}`}>
                                    {i + 1}
                                </div>
                                <div className="lb-name">
                                    {l.name || l.user?.name || 'Student'}
                                    {(l._id === user?._id || l.user?._id === user?._id) &&
                                        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: 6 }}>YOU</span>}
                                </div>
                                <div className="lb-score">{l.reputation ?? l.score ?? 0}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Task Popup */}
            {selectedTask && (
                <TaskPopup task={selectedTask} onClose={() => setSelectedTask(null)} onDone={handleTaskDone} />
            )}
        </div>
    );
}
