import { useState } from 'react';
import { X, Send, Megaphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function AnnouncementForm({ onClose }) {
    const { user } = useAuth();
    const crCourses = user?.crForCourses || [];
    const [form, setForm] = useState({ courseId: crCourses[0]?._id || '', title: '', content: '' });
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try { await api.post('/announcements', form); toast.success('Announcement posted!'); onClose(); }
        catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
        finally { setLoading(false); }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="relative w-full max-w-md mx-4 surface rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"><X size={18} /></button>
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                        <Megaphone size={16} className="text-white" />
                    </div>
                    <h2 className="text-base font-semibold text-white">New Announcement</h2>
                </div>
                <form onSubmit={submit} className="space-y-3">
                    <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                        className="w-full input-dark rounded-xl px-4 py-2.5 text-sm cursor-pointer">
                        {crCourses.map((c) => <option key={c._id} value={c._id}>{c.courseCode}</option>)}
                    </select>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                        className="w-full input-dark rounded-xl px-4 py-2.5 text-sm" placeholder="Title" />
                    <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={3} required
                        className="w-full input-dark rounded-xl px-4 py-3 text-sm resize-none" placeholder="Announcement body..." />
                    <button type="submit" disabled={loading}
                        className="w-full py-2.5 rounded-xl btn-pink text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={14} /> Post</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
