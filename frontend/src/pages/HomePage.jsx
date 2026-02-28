import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Plus, Calendar, Filter, Flame, Clock, ChevronRight, BookOpen, Megaphone, Upload } from 'lucide-react';
import TaskCard from '../components/TaskCard';
import MiniLeaderboard from '../components/MiniLeaderboard';
import AnnouncementForm from '../components/AnnouncementForm';
import ResourceUpload from '../components/ResourceUpload';
import TaskPopup from '../components/TaskPopup';
import { relativeDate } from '../utils/helpers';

export default function HomePage() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');
    const [selectedTask, setSelectedTask] = useState(null);
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [announcements, setAnnouncements] = useState([]);

    const isCR = user?.crForCourses?.length > 0;

    const fetchTasks = () => {
        api.get('/tasks').then((r) => { setTasks(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
    };
    useEffect(() => { fetchTasks(); }, []);
    useEffect(() => {
        api.get('/announcements').then((r) => setAnnouncements(r.data.data || [])).catch(() => {});
    }, []);

    const generateTask = async () => {
        setGenerating(true);
        try { await api.post('/tasks/generate'); fetchTasks(); toast.success('New task generated!'); }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to generate'); }
        finally { setGenerating(false); }
    };

    const filtered = useMemo(() => {
        const now = tasks.filter((t) => {
            if (filter === 'pending') return !t.completed && !t.passed;
            if (filter === 'completed') return t.completed || t.passed;
            return true;
        });
        const groups = {};
        now.forEach((t) => { const d = new Date(t.deadline).toDateString(); (groups[d] = groups[d] || []).push(t); });
        return Object.entries(groups).sort(([a], [b]) => new Date(a) - new Date(b));
    }, [tasks, filter]);

    return (
        <div className="min-h-screen px-4 py-6 pb-24" style={{ background: '#050507' }}>
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-4 animate-fade-in">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1 text-slate-500">
                                <Flame size={14} className="text-orange-400" />
                                <span className="text-white font-semibold">{user?.streak?.currentDays || 0}</span> day streak
                            </span>
                            <span className="flex items-center gap-1 text-slate-500">
                                <span className="text-white font-semibold">{user?.stats?.quizzesPassed || 0}</span> quizzes passed
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isCR && (
                            <>
                                <button onClick={() => setShowAnnouncement(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-pink-400 cursor-pointer transition-colors"
                                    style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.15)' }}>
                                    <Megaphone size={14} /> Announce
                                </button>
                                <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-violet-400 cursor-pointer transition-colors"
                                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                                    <Upload size={14} /> Upload
                                </button>
                            </>
                        )}
                        <button onClick={generateTask} disabled={generating}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl btn-primary text-xs cursor-pointer disabled:opacity-50">
                            {generating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
                            Generate Task
                        </button>
                    </div>
                </div>

                {/* Announcements */}
                {announcements.length > 0 && (
                    <div className="mb-6 space-y-2 animate-fade-in">
                        {announcements.slice(0, 3).map((a) => (
                            <div key={a._id} className="flex items-start gap-3 p-3 rounded-xl"
                                style={{ background: 'rgba(244,114,182,0.05)', border: '1px solid rgba(244,114,182,0.1)' }}>
                                <Megaphone size={14} className="text-pink-400 mt-0.5 shrink-0" />
                                <div><p className="text-xs text-white font-medium">{a.title}</p>
                                    <p className="text-xs text-slate-500">{a.content}</p></div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-6">
                    {/* Main */}
                    <div className="flex-1 min-w-0">
                        {/* Filters */}
                        <div className="flex items-center gap-2 mb-5">
                            <Filter size={14} className="text-slate-500" />
                            {['all', 'pending', 'completed'].map((f) => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                        filter === f ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                                    }`} style={filter === f ? { border: '1px solid rgba(56,189,248,0.15)' } : {}}>
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                </button>
                            ))}
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-16">
                                <BookOpen size={40} className="mx-auto text-slate-700 mb-3" />
                                <p className="text-slate-500 text-sm">No tasks yet. Generate one to get started!</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {filtered.map(([date, group]) => (
                                    <div key={date} className="animate-fade-in">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Calendar size={13} className="text-slate-600" />
                                            <span className="text-xs font-medium text-slate-500">{relativeDate(date)}</span>
                                            <div className="flex-1 h-px bg-white/[0.04]" />
                                        </div>
                                        <div className="space-y-2">
                                            {group.map((task) => (
                                                <TaskCard key={task._id} task={task} onClick={() => setSelectedTask(task)} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="hidden lg:block w-72 shrink-0">
                        <MiniLeaderboard />
                    </div>
                </div>
            </div>

            {selectedTask && <TaskPopup task={selectedTask} onClose={() => { setSelectedTask(null); fetchTasks(); }} />}
            {showAnnouncement && <AnnouncementForm onClose={() => setShowAnnouncement(false)} />}
            {showUpload && <ResourceUpload onClose={() => setShowUpload(false)} courses={user?.enrolledCourses || []} />}
        </div>
    );
}
