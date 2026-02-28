import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { User, Flame, Trophy, BookOpen, BarChart3, Clock, Award, FileText, ExternalLink, RotateCcw } from 'lucide-react';

export default function ProfilePage() {
    const { userId } = useParams();
    const { user: me } = useAuth();
    const [profile, setProfile] = useState(null);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);

    const isSelf = !userId || userId === me?._id || userId === me?.id;

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                if (isSelf) {
                    // Always fetch fresh from API — don't rely on auth context timing
                    const [meRes, subRes] = await Promise.all([
                        api.get('/auth/me'),
                        api.get('/tasks/submissions'),
                    ]);
                    if (cancelled) return;
                    setProfile(meRes.data.data);
                    setSubmissions(subRes.data.data || []);
                } else {
                    const r = await api.get(`/users/${userId}/profile`);
                    if (cancelled) return;
                    setProfile(r.data.data?.user || r.data.data);
                    setSubmissions(r.data.data?.submissions || []);
                }
            } catch (err) {
                console.error('Profile load error:', err);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [userId, isSelf]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#050507' }}>
            <div className="w-10 h-10 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
        </div>
    );
    if (!profile) return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#050507' }}>
            <p className="text-slate-500">User not found</p>
        </div>
    );

    const stats = [
        { label: 'Streak', value: `${profile.streak?.currentDays || 0}d`, icon: Flame, color: 'text-orange-400' },
        { label: 'Tokens', value: profile.tokenBalance ?? 0, icon: Award, color: 'text-sky-400' },
        { label: 'Quizzes', value: profile.stats?.quizzesPassed ?? 0, icon: BookOpen, color: 'text-emerald-400' },
        { label: 'Avg MCQ', value: `${(profile.stats?.avgMcqScore ?? 0).toFixed(0)}%`, icon: BarChart3, color: 'text-pink-400' },
        { label: 'Reputation', value: profile.reputation ?? 0, icon: Trophy, color: 'text-violet-400' },
        { label: 'Tasks Done', value: profile.stats?.tasksCompleted ?? 0, icon: Clock, color: 'text-cyan-400' },
    ];

    return (
        <div className="min-h-screen px-4 py-6 pb-24" style={{ background: '#050507' }}>
            <div className="max-w-3xl mx-auto animate-slide-up">
                {/* Profile Header */}
                <div className="relative surface rounded-2xl overflow-hidden mb-6">
                    <div className="h-24 bg-gradient-to-r from-sky-600/20 via-pink-600/20 to-violet-600/20" />
                    <div className="px-6 pb-6 -mt-8">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-pink-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-sky-500/20 mb-3">
                            {profile.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <h1 className="text-xl font-bold text-white">{profile.name}</h1>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                            {profile.department && <span>{profile.department}</span>}
                            {profile.university && <span>• {profile.university}</span>}
                            {profile.semester && <span>• Sem {profile.semester}</span>}
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
                    {stats.map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="surface rounded-xl p-3 text-center card-hover">
                            <Icon size={16} className={`${color} mx-auto mb-1.5`} />
                            <p className="text-lg font-bold text-white">{value}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{label}</p>
                        </div>
                    ))}
                </div>

                {/* Submissions */}
                <div className="surface rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" /> Quiz Attempts & Submissions
                    </h2>
                    {submissions.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">No submissions yet</p>
                    ) : (
                        <div className="space-y-3">
                            {submissions.map((sub) => (
                                <div key={sub._id} className="rounded-xl p-4 border border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="text-sm font-medium text-white">{sub.task?.title || 'Task'}</p>
                                            <p className="text-xs text-slate-500">{sub.course?.courseCode}</p>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                            sub.mcqPassed ? 'bg-emerald-500/10 text-emerald-400'
                                            : sub.status === 'failed' ? 'bg-red-500/10 text-red-400'
                                            : 'bg-amber-500/10 text-amber-400'
                                        }`}>
                                            {sub.mcqPassed ? 'passed' : sub.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                                        <span>MCQ: <span className="text-white font-semibold">{sub.mcqScore ?? '—'}/12</span></span>
                                        {sub.attemptNumber > 1 && (
                                            <span className="flex items-center gap-1 text-amber-400">
                                                <RotateCcw size={10} /> Attempt #{sub.attemptNumber}
                                            </span>
                                        )}
                                        {sub.effectiveStake != null && (
                                            <span className="text-slate-500">Stake: {sub.effectiveStake}</span>
                                        )}
                                        {sub.tokensAwarded != null && (
                                            <span className={sub.tokensAwarded > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                {sub.tokensAwarded > 0 ? `+${sub.tokensAwarded}` : sub.tokensAwarded}
                                            </span>
                                        )}
                                    </div>
                                    {sub.theorySubmissionPath && (
                                        <a href={`/${sub.theorySubmissionPath}`} target="_blank" rel="noreferrer"
                                            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                                            <ExternalLink size={11} /> View Theory PDF
                                        </a>
                                    )}
                                    {sub.createdAt && (
                                        <p className="text-[10px] text-slate-600 mt-1">{new Date(sub.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
