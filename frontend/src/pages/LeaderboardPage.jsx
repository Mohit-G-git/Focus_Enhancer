import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { Trophy, Medal, Crown, ChevronLeft, ChevronRight, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LeaderboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState('overall');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [courseId, setCourseId] = useState('');

    useEffect(() => {
        setLoading(true); setPage(1);
        const endpoint = tab === 'overall' ? '/leaderboard/overall' : `/leaderboard/course/${courseId}`;
        if (tab === 'course' && !courseId) { setLoading(false); return; }
        api.get(`${endpoint}?page=1&limit=20`).then((r) => {
            setData(r.data.data || []); setTotal(r.data.total || 0); setLoading(false);
        }).catch(() => setLoading(false));
    }, [tab, courseId]);

    const loadPage = (p) => {
        setPage(p); setLoading(true);
        const endpoint = tab === 'overall' ? '/leaderboard/overall' : `/leaderboard/course/${courseId}`;
        api.get(`${endpoint}?page=${p}&limit=20`).then((r) => {
            setData(r.data.data || []); setLoading(false);
        }).catch(() => setLoading(false));
    };

    const rankIcon = (i) => {
        const r = (page - 1) * 20 + i + 1;
        if (r === 1) return <Crown size={16} className="text-amber-400" />;
        if (r === 2) return <Medal size={16} className="text-slate-300" />;
        if (r === 3) return <Medal size={16} className="text-amber-600" />;
        return <span className="text-xs text-slate-500 font-mono w-4 text-center">{r}</span>;
    };

    const totalPages = Math.ceil(total / 20);

    return (
        <div className="min-h-screen px-4 py-6 pb-24" style={{ background: '#050507' }}>
            <div className="max-w-3xl mx-auto animate-slide-up">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                        <Trophy size={20} className="text-white" />
                    </div>
                    <div><h1 className="text-xl font-bold text-white">Leaderboard</h1>
                        <p className="text-xs text-slate-500">{total} students ranked</p></div>
                </div>

                {/* Tab Toggle */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="flex rounded-xl p-1" style={{ background: '#111118' }}>
                        {['overall', 'course'].map((t) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                    tab === t ? 'bg-gradient-to-r from-sky-500/20 to-pink-500/20 text-white' : 'text-slate-500 hover:text-slate-300'
                                }`} style={tab === t ? { border: '1px solid rgba(56,189,248,0.15)' } : {}}>
                                {t === 'overall' ? 'Overall' : 'By Course'}
                            </button>
                        ))}
                    </div>
                    {tab === 'course' && (
                        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                            className="input-dark rounded-lg px-3 py-2 text-xs flex-1 max-w-xs cursor-pointer">
                            <option value="">Select course</option>
                            {user?.enrolledCourses?.map((c) => <option key={c._id} value={c._id}>{c.courseCode}</option>)}
                        </select>
                    )}
                </div>

                {/* Table */}
                <div className="surface rounded-2xl overflow-hidden">
                    <div className={`grid items-center px-4 py-3 border-b border-white/[0.04] ${tab === 'course' ? 'grid-cols-[3rem_1fr_auto_auto_auto]' : 'grid-cols-[3rem_1fr_auto_auto]'}`}>
                        <span className="text-[10px] font-semibold text-slate-600 uppercase">#</span>
                        <span className="text-[10px] font-semibold text-slate-600 uppercase">Student</span>
                        {tab === 'course' && (
                            <span className="text-[10px] font-semibold text-slate-600 uppercase text-right pr-4 flex items-center gap-1 justify-end">
                                <Brain size={10} className="text-violet-400" /> Proficiency
                            </span>
                        )}
                        <span className="text-[10px] font-semibold text-slate-600 uppercase text-right pr-4">Tokens</span>
                        <span className="text-[10px] font-semibold text-slate-600 uppercase text-right">Rep</span>
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" /></div>
                    ) : data.length === 0 ? (
                        <p className="text-center text-sm text-slate-500 py-12">No entries</p>
                    ) : (
                        data.map((entry, i) => {
                            const uid = entry.userId || entry.user?._id || entry._id;
                            const isMe = uid === user?._id;
                            const name = entry.user?.name || entry.name;
                            return (
                                <div key={uid || i}
                                    className={`grid items-center px-4 py-3 border-b border-white/[0.02] transition-colors ${tab === 'course' ? 'grid-cols-[3rem_1fr_auto_auto_auto]' : 'grid-cols-[3rem_1fr_auto_auto]'} ${
                                        isMe ? 'bg-sky-500/[0.04]' : 'hover:bg-white/[0.02]'
                                    }`}>
                                    <div className="flex items-center justify-center">{rankIcon(i)}</div>
                                    <button onClick={() => navigate(`/profile/${uid}`)}
                                        className={`text-sm font-medium text-left cursor-pointer hover:underline ${isMe ? 'text-sky-400' : 'text-slate-300'}`}>
                                        {name} {isMe && <span className="text-[10px] text-sky-500">(you)</span>}
                                    </button>
                                    {tab === 'course' && (
                                        <span className="text-sm font-bold text-right pr-4 bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                                            {entry.proficiencyScore ?? 0}
                                        </span>
                                    )}
                                    <span className="text-sm font-semibold text-white text-right pr-4">{entry.tokens ?? entry.tokenBalance}</span>
                                    <span className="text-sm text-slate-400 text-right">{entry.reputation ?? '-'}</span>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                        <button onClick={() => loadPage(page - 1)} disabled={page <= 1}
                            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 cursor-pointer">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                        <button onClick={() => loadPage(page + 1)} disabled={page >= totalPages}
                            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 cursor-pointer">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
