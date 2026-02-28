import { useState, useEffect, useRef } from 'react';
import { X, FileText, Upload, Clock, Send, CheckCircle } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { formatTime } from '../utils/helpers';

const THEORY_TIME = 7200; // 2 hours

export default function TheoryUpload({ task, onDone, onClose }) {
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(THEORY_TIME);
    const [submitted, setSubmitted] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        api.get(`/quiz/${task._id}/theory`).then((r) => {
            setQuestions(r.data.data?.questions || []);
            setLoading(false);
        }).catch(() => { toast.error('Failed to load theory questions'); setLoading(false); });
    }, []);

    useEffect(() => {
        if (loading || submitted) return;
        timerRef.current = setInterval(() => {
            setTimeLeft((p) => {
                if (p <= 1) { clearInterval(timerRef.current); handleSubmit(); return 0; }
                return p - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [loading, submitted]);

    const handleSubmit = async () => {
        clearInterval(timerRef.current);
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('answers', JSON.stringify(answers));
            if (file) fd.append('theoryPdf', file);
            await api.post(`/quiz/${task._id}/submit-theory`, fd);
            toast.success('Theory submitted!');
            setSubmitted(true);
        } catch (err) { toast.error(err.response?.data?.message || 'Submit failed'); }
        finally { setSubmitting(false); }
    };

    if (submitted) {
        return (
            <div className="modal-backdrop" onClick={onClose}>
                <div className="surface rounded-2xl p-8 text-center animate-slide-up mx-4 max-w-md" onClick={(e) => e.stopPropagation()}>
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                        <CheckCircle size={32} className="text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">Submitted! 🎉</h2>
                    <p className="text-sm text-slate-400 mb-4">AI is grading your answers...</p>
                    <button onClick={onDone} className="px-6 py-2.5 rounded-xl btn-primary text-sm cursor-pointer">Finish Task</button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="modal-backdrop">
                <div className="surface rounded-2xl p-12 text-center animate-slide-up">
                    <div className="w-10 h-10 mx-auto border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-4" />
                    <p className="text-sm text-slate-400">Loading theory questions...</p>
                </div>
            </div>
        );
    }

    const timerColor = timeLeft < 600 ? 'text-red-400' : timeLeft < 1800 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <div className="modal-backdrop overflow-y-auto py-8">
            <div className="relative w-full max-w-2xl mx-4 surface rounded-2xl p-6 animate-slide-up">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"><X size={18} /></button>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                            <FileText size={16} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-white">Theory Questions</h2>
                            <p className="text-[10px] text-slate-500">{questions.length} questions</p>
                        </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${timerColor}`}
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Clock size={13} />
                        <span className="text-xs font-mono font-bold">{formatTime(timeLeft)}</span>
                    </div>
                </div>

                {/* Questions */}
                <div className="space-y-5 mb-6">
                    {questions.map((q, i) => (
                        <div key={i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <p className="text-sm text-white font-medium mb-2"><span className="text-sky-400 mr-1">Q{i + 1}.</span> {q.question || q}</p>
                            <textarea rows={3} value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                                className="w-full input-dark rounded-lg px-3 py-2 text-sm resize-none" placeholder="Your answer..." />
                        </div>
                    ))}
                </div>

                {/* PDF Upload */}
                <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors hover:border-violet-500/30 mb-5"
                    style={{ borderColor: file ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <Upload size={18} className={file ? 'text-violet-400' : 'text-slate-600'} />
                    <div>
                        <p className="text-xs font-medium text-slate-300">{file ? file.name : 'Attach PDF (optional)'}</p>
                        <p className="text-[10px] text-slate-500">Upload your handwritten or typed theory answers</p>
                    </div>
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
                </label>

                <button onClick={handleSubmit} disabled={submitting}
                    className="w-full py-3 rounded-xl btn-pink text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={14} /> Submit Theory</>}
                </button>
            </div>
        </div>
    );
}
