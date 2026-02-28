import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { AlertTriangle, Send, ChevronDown, BarChart3, CheckCircle2, XCircle, Clock } from 'lucide-react';

const TYPE_LABELS = {
    false_announcement: 'Announced something that was not happening',
    missing_announcement: "Didn't announce something that was happening",
};

const STATUS_STYLES = {
    pending:  { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Pending' },
    resolved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Resolved — CR Dismissed' },
    dismissed:{ bg: 'bg-slate-500/10', text: 'text-slate-400', label: 'Dismissed' },
};

export default function CRComplaintPage() {
    const { user } = useAuth();

    const [stats, setStats] = useState([]);
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({ courseId: '', type: 'false_announcement', description: '' });

    /* ── Load stats + my complaints ─────────────────────────────── */
    const load = useCallback(async () => {
        try {
            const [sRes, cRes] = await Promise.all([
                api.get('/complaints/stats'),
                api.get('/complaints'),
            ]);
            setStats(sRes.data.data || []);
            setComplaints(cRes.data.data || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    /* ── Available courses for the dropdown (only those with a CR, not already filed) */
    const availableCourses = stats.filter((s) => !s.alreadyFiled);

    /* ── Submit ─────────────────────────────────────────────────── */
    const submit = async (e) => {
        e.preventDefault();
        if (!form.courseId) return toast.error('Select a course');
        setSubmitting(true);
        try {
            const res = await api.post('/complaints', form);
            if (res.data.data?.dismissed) {
                toast.success('Complaint filed — CR has been dismissed!', { duration: 5000 });
            } else {
                toast.success('Complaint filed successfully');
            }
            setForm({ courseId: '', type: 'false_announcement', description: '' });
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit complaint');
        } finally { setSubmitting(false); }
    };

    const selCls = 'w-full input-dark rounded-xl px-4 py-2.5 text-sm appearance-none cursor-pointer';

    return (
        <div className="min-h-screen px-4 py-6 pb-24" style={{ background: '#050507' }}>
            <div className="max-w-2xl mx-auto animate-slide-up">

                {/* ── Header ──────────────────────────────────── */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                        <AlertTriangle size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Report / Complaint</h1>
                        <p className="text-xs text-slate-500">File anonymous complaints against Course Representatives</p>
                    </div>
                </div>

                {/* ── Complaint Form ──────────────────────────── */}
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-6 h-6 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                    </div>
                ) : availableCourses.length === 0 && stats.length === 0 ? (
                    <div className="surface rounded-2xl p-8 text-center mb-6">
                        <AlertTriangle size={32} className="mx-auto text-slate-600 mb-3" />
                        <p className="text-sm text-slate-400">No courses with active CRs found.</p>
                        <p className="text-xs text-slate-600 mt-1">You can only file complaints for courses you&apos;re enrolled in that have a CR assigned.</p>
                    </div>
                ) : (
                    <>
                        {availableCourses.length > 0 && (
                            <form onSubmit={submit} className="surface rounded-2xl p-6 space-y-4 mb-6">
                                <h2 className="text-sm font-semibold text-white mb-1">File a Complaint</h2>
                                <p className="text-[10px] text-slate-500 -mt-2 mb-2">Your identity is kept confidential. The CR will not know who filed.</p>

                                {/* Course Dropdown */}
                                <div className="relative">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Course *</label>
                                    <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className={selCls}>
                                        <option value="">Select course</option>
                                        {availableCourses.map((c) => (
                                            <option key={c.courseId} value={c.courseId}>{c.courseCode} – {c.title}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-9 text-slate-500 pointer-events-none" />
                                </div>

                                {/* Type Dropdown */}
                                <div className="relative">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Type of Misinformation *</label>
                                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={selCls}>
                                        <option value="false_announcement">Announced something that was not happening</option>
                                        <option value="missing_announcement">Didn&apos;t announce something that was happening</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-4 top-9 text-slate-500 pointer-events-none" />
                                </div>

                                {/* Description (optional) */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Details <span className="text-slate-600">(optional)</span></label>
                                    <textarea value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        rows={3} maxLength={1000}
                                        className="w-full input-dark rounded-xl px-4 py-3 text-sm resize-none"
                                        placeholder="Provide any additional context..." />
                                </div>

                                <button type="submit" disabled={submitting}
                                    className="w-full py-3 rounded-xl btn-pink text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                                    {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        : <><Send size={14} /> Submit Complaint</>}
                                </button>
                            </form>
                        )}

                        {/* ── Complaint Progress per Course ─────────── */}
                        {stats.length > 0 && (
                            <div className="surface rounded-2xl p-5 mb-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <BarChart3 size={16} className="text-sky-400" />
                                    <h2 className="text-sm font-semibold text-white">CR Complaint Status</h2>
                                </div>
                                <div className="space-y-3">
                                    {stats.map((s) => {
                                        const pct = s.batchSize > 0 ? Math.round((s.complaintCount / s.batchSize) * 100) : 0;
                                        const threshold = Math.floor(s.batchSize * 0.5) + 1;
                                        const nearThreshold = pct >= 40;
                                        return (
                                            <div key={s.courseId} className="rounded-xl p-3 border border-white/[0.04]"
                                                style={{ background: 'rgba(255,255,255,0.02)' }}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-semibold text-white">{s.courseCode} — {s.title}</span>
                                                    <span className={`text-[10px] font-bold ${nearThreshold ? 'text-red-400' : 'text-slate-500'}`}>
                                                        {s.complaintCount}/{s.batchSize} ({pct}%)
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                                    <div className={`h-full rounded-full transition-all duration-500 ${
                                                        pct > 50 ? 'bg-red-500' : pct >= 40 ? 'bg-amber-500' : 'bg-sky-500'
                                                    }`} style={{ width: `${Math.min(100, pct)}%` }} />
                                                </div>
                                                <div className="flex items-center justify-between mt-1.5">
                                                    <span className="text-[10px] text-slate-600">
                                                        {threshold} complaints needed for dismissal (&gt;50%)
                                                    </span>
                                                    {s.alreadyFiled && (
                                                        <span className="text-[10px] font-medium text-pink-400">✓ You filed</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── Past Complaints ────────────────────────────── */}
                <div className="surface rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">Your Previous Complaints</h2>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                        </div>
                    ) : complaints.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-6">No complaints filed yet</p>
                    ) : (
                        <div className="space-y-2">
                            {complaints.map((c) => {
                                const sty = STATUS_STYLES[c.status] || STATUS_STYLES.pending;
                                const Icon = c.status === 'resolved' ? CheckCircle2
                                    : c.status === 'dismissed' ? XCircle : Clock;
                                return (
                                    <div key={c._id} className="rounded-xl p-3 border border-white/[0.04]"
                                        style={{ background: 'rgba(255,255,255,0.02)' }}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-semibold text-white">{c.courseCode}</span>
                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${sty.bg} ${sty.text}`}>
                                                <Icon size={10} /> {sty.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400">{TYPE_LABELS[c.type] || c.type}</p>
                                        {c.description && (
                                            <p className="text-[10px] text-slate-500 mt-1 italic">&ldquo;{c.description}&rdquo;</p>
                                        )}
                                        <p className="text-[10px] text-slate-600 mt-1">
                                            {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
