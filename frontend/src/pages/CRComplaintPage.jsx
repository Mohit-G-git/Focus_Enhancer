import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { AlertTriangle, Send, ChevronDown } from 'lucide-react';

export default function CRComplaintPage() {
    const { user } = useAuth();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ courseId: '', type: 'general', description: '' });
    const [submitting, setSubmitting] = useState(false);

    const crCourses = user?.crForCourses || [];

    useEffect(() => {
        api.get('/complaints').then((r) => { setComplaints(r.data.data || []); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.courseId) return toast.error('Select a course');
        if (!form.description.trim()) return toast.error('Add a description');
        setSubmitting(true);
        try {
            await api.post('/complaints', form);
            toast.success('Complaint submitted');
            setForm({ courseId: '', type: 'general', description: '' });
            const r = await api.get('/complaints');
            setComplaints(r.data.data || []);
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
        finally { setSubmitting(false); }
    };

    const selCls = 'w-full input-dark rounded-xl px-4 py-2.5 text-sm appearance-none cursor-pointer';

    return (
        <div className="min-h-screen px-4 py-6 pb-24" style={{ background: '#050507' }}>
            <div className="max-w-2xl mx-auto animate-slide-up">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                        <AlertTriangle size={20} className="text-white" />
                    </div>
                    <div><h1 className="text-xl font-bold text-white">Report / Complaint</h1>
                        <p className="text-xs text-slate-500">Submit issues as Course Representative</p></div>
                </div>

                {crCourses.length === 0 ? (
                    <div className="surface rounded-2xl p-8 text-center">
                        <AlertTriangle size={32} className="mx-auto text-slate-600 mb-3" />
                        <p className="text-sm text-slate-400">You're not a Course Rep for any course.</p>
                        <p className="text-xs text-slate-600 mt-1">Only CRs can submit reports.</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="surface rounded-2xl p-6 space-y-4 mb-6">
                        <div className="relative">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Course *</label>
                            <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className={selCls}>
                                <option value="">Select course</option>
                                {crCourses.map((c) => <option key={c._id} value={c._id}>{c.courseCode} – {c.title}</option>)}
                            </select>
                            <ChevronDown size={14} className="absolute right-4 top-9 text-slate-500 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Type *</label>
                            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={selCls}>
                                <option value="general">General</option>
                                <option value="content">Content Issue</option>
                                <option value="technical">Technical</option>
                                <option value="misconduct">Misconduct</option>
                            </select>
                            <ChevronDown size={14} className="absolute right-4 top-9 text-slate-500 pointer-events-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description *</label>
                            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                                rows={4} className="w-full input-dark rounded-xl px-4 py-3 text-sm resize-none" placeholder="Describe the issue..." />
                        </div>
                        <button type="submit" disabled={submitting}
                            className="w-full py-3 rounded-xl btn-pink text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <><Send size={14} /> Submit Report</>}
                        </button>
                    </form>
                )}

                {/* Past complaints */}
                <div className="surface rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">Previous Reports</h2>
                    {loading ? (
                        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" /></div>
                    ) : complaints.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-6">No reports submitted yet</p>
                    ) : (
                        <div className="space-y-2">
                            {complaints.map((c) => (
                                <div key={c._id} className="rounded-xl p-3 border border-white/[0.04]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-white">{c.course?.courseCode}</span>
                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                                            c.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400'
                                            : c.status === 'rejected' ? 'bg-red-500/10 text-red-400'
                                            : 'bg-amber-500/10 text-amber-400'
                                        }`}>{c.status || 'pending'}</span>
                                    </div>
                                    <p className="text-xs text-slate-400">{c.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
