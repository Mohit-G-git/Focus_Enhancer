import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, ArrowRight, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function CourseRegistration() {
    const navigate = useNavigate();
    const { refreshUser } = useAuth();
    const [courses, setCourses] = useState([]);
    const [enrolled, setEnrolled] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/courses').then((r) => { setCourses(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const filtered = courses.filter((c) =>
        c.courseCode?.toLowerCase().includes(search.toLowerCase()) || c.title?.toLowerCase().includes(search.toLowerCase())
    );
    const isEnrolled = (id) => enrolled.some((e) => e._id === id);

    const enroll = async (course) => {
        try { await api.post(`/courses/${course._id}/enroll`); setEnrolled((p) => [...p, course]); toast.success(`Enrolled in ${course.courseCode}`); }
        catch (err) { toast.error(err.response?.data?.message || 'Failed to enroll'); }
    };

    const handleContinue = async () => {
        if (!enrolled.length) return toast.error('Enroll in at least one course');
        await refreshUser(); navigate('/home');
    };

    return (
        <div className="min-h-screen px-4 py-12" style={{ background: '#050507' }}>
            <div className="max-w-2xl mx-auto animate-slide-up">
                <div className="text-center mb-8">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center mb-4">
                        <BookOpen size={24} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Choose Your Courses</h1>
                    <p className="text-sm text-slate-500">Search and enroll in your semester courses.</p>
                </div>
                {enrolled.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {enrolled.map((c) => (
                            <span key={c._id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-300"
                                style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)' }}>
                                <Check size={12} /> {c.courseCode}
                            </span>
                        ))}
                    </div>
                )}
                <div className="relative mb-6">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses..."
                        className="w-full input-dark rounded-xl pl-10 pr-4 py-3 text-sm" />
                </div>
                <div className="surface rounded-2xl overflow-hidden mb-6">
                    {loading ? (
                        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" /></div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-sm text-slate-500 py-12">No courses found</p>
                    ) : (
                        <div className="divide-y divide-white/[0.04] max-h-[50vh] overflow-y-auto">
                            {filtered.map((c) => (
                                <div key={c._id} className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
                                    <div><p className="text-sm font-medium text-white">{c.courseCode}</p><p className="text-xs text-slate-500">{c.title}</p></div>
                                    {isEnrolled(c._id) ? (
                                        <span className="px-3 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10">Enrolled ✓</span>
                                    ) : (
                                        <button onClick={() => enroll(c)} className="px-4 py-1.5 rounded-lg btn-primary text-xs cursor-pointer">Enroll</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={handleContinue} disabled={!enrolled.length}
                    className="w-full py-3 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30">
                    Continue to Dashboard <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}
