import { useState } from 'react';
import { X, Send, Megaphone, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';

const EVENT_TYPES = ['quiz', 'assignment', 'midterm', 'final', 'lecture', 'lab'];

export default function AnnouncementForm({ onClose, onCreated }) {
    const { user } = useAuth();
    const crCourses = user?.crForCourses || [];
    const [form, setForm] = useState({
        courseId: crCourses[0]?._id || '',
        eventType: 'quiz',
        title: '',
        topics: [''],
        eventDate: '',
        description: '',
    });
    const [loading, setLoading] = useState(false);

    const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
    const setTopic = (i, v) => { const t = [...form.topics]; t[i] = v; setField('topics', t); };
    const addTopic = () => setField('topics', [...form.topics, '']);
    const removeTopic = (i) => { const t = form.topics.filter((_, j) => j !== i); setField('topics', t.length ? t : ['']); };

    const submit = async (e) => {
        e.preventDefault();
        const cleanTopics = form.topics.map((t) => t.trim()).filter(Boolean);
        if (!cleanTopics.length) { toast.error('Add at least one topic'); return; }
        if (!form.eventDate) { toast.error('Set an event date'); return; }
        setLoading(true);
        try {
            const res = await api.post('/announcements', { ...form, topics: cleanTopics });
            const taskCount = res.data.data?.tasks?.length || 0;
            toast.success(`Announcement posted! ${taskCount} tasks generated.`);
            onCreated?.();
            onClose();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
        finally { setLoading(false); }
    };

    // min date = tomorrow
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="relative w-full max-w-lg mx-4 surface rounded-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"><X size={18} /></button>
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                        <Megaphone size={16} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">New Announcement</h2>
                        <p className="text-[10px] text-slate-500">Tasks will be auto-generated for enrolled students</p>
                    </div>
                </div>
                <form onSubmit={submit} className="space-y-4">
                    {/* Course + Event Type */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">Course</label>
                            <select value={form.courseId} onChange={(e) => setField('courseId', e.target.value)}
                                className="w-full input-dark rounded-xl px-3 py-2.5 text-sm cursor-pointer">
                                {crCourses.map((c) => <option key={c._id} value={c._id}>{c.courseCode}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">Event Type</label>
                            <select value={form.eventType} onChange={(e) => setField('eventType', e.target.value)}
                                className="w-full input-dark rounded-xl px-3 py-2.5 text-sm cursor-pointer capitalize">
                                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">Title</label>
                        <input value={form.title} onChange={(e) => setField('title', e.target.value)} required
                            className="w-full input-dark rounded-xl px-3 py-2.5 text-sm" placeholder="e.g. Midterm 1 — Trees & Graphs" />
                    </div>

                    {/* Event Date */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">Event Date</label>
                        <input type="date" value={form.eventDate} onChange={(e) => setField('eventDate', e.target.value)}
                            min={minDate} required
                            className="w-full input-dark rounded-xl px-3 py-2.5 text-sm" />
                    </div>

                    {/* Topics */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Topics (syllabus covered)</label>
                            <button type="button" onClick={addTopic}
                                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5 cursor-pointer">
                                <Plus size={10} /> Add
                            </button>
                        </div>
                        <div className="space-y-2">
                            {form.topics.map((t, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input value={t} onChange={(e) => setTopic(i, e.target.value)}
                                        className="flex-1 input-dark rounded-xl px-3 py-2 text-sm"
                                        placeholder={`Topic ${i + 1}, e.g. Binary Trees`} />
                                    {form.topics.length > 1 && (
                                        <button type="button" onClick={() => removeTopic(i)}
                                            className="p-1.5 text-slate-600 hover:text-red-400 cursor-pointer">
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Description (optional) */}
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1 block">Description (optional)</label>
                        <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} rows={2}
                            className="w-full input-dark rounded-xl px-3 py-2.5 text-sm resize-none" placeholder="Additional details..." />
                    </div>

                    <button type="submit" disabled={loading}
                        className="w-full py-3 rounded-xl btn-pink text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Generating tasks…
                            </>
                        ) : (
                            <><Send size={14} /> Post Announcement &amp; Generate Tasks</>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
