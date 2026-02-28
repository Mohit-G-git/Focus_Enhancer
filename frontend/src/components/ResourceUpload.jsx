import { useState } from 'react';
import { X, Upload, FileText } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function ResourceUpload({ onClose, courses }) {
    const [courseId, setCourseId] = useState(courses[0]?._id || '');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!file) return toast.error('Select a PDF');
        setLoading(true);
        const fd = new FormData();
        fd.append('book', file);
        fd.append('bookTitle', file.name.replace('.pdf', ''));
        try {
            const res = await api.post(`/courses/${courseId}/upload-book`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success(`Uploaded! ${res.data.data?.chapters || 0} chapters extracted.`);
            onClose();
        } catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
        finally { setLoading(false); }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="relative w-full max-w-md mx-4 surface rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"><X size={18} /></button>
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                        <Upload size={16} className="text-white" />
                    </div>
                    <h2 className="text-base font-semibold text-white">Upload Textbook</h2>
                </div>
                <form onSubmit={submit} className="space-y-4">
                    <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                        className="w-full input-dark rounded-xl px-4 py-2.5 text-sm cursor-pointer">
                        {courses.map((c) => <option key={c._id} value={c._id}>{c.courseCode} – {c.title}</option>)}
                    </select>
                    <label className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors hover:border-sky-500/30"
                        style={{ borderColor: file ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <FileText size={24} className={file ? 'text-sky-400' : 'text-slate-600'} />
                        <span className="text-xs text-slate-400">{file ? file.name : 'Click to select PDF'}</span>
                        <input type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
                    </label>
                    <button type="submit" disabled={loading}
                        className="w-full py-2.5 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload size={14} /> Upload</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
