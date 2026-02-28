import { useState, useEffect } from 'react';
import api from '../api/axios';
import { X, CheckCircle, XCircle, MinusCircle, FileText, Brain, Award, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

const statusMap = (status, mcqPassed) => {
    if (mcqPassed && (status === 'theory_pending' || status === 'submitted'))
        return { label: 'Passed', color: 'text-emerald-400' };
    const map = {
        submitted: { label: 'Submitted', color: 'text-sky-400' },
        graded: { label: 'Graded', color: 'text-violet-400' },
        failed: { label: 'Failed', color: 'text-red-400' },
        mcq_in_progress: { label: 'In Progress', color: 'text-amber-400' },
        mcq_completed: { label: 'Completed', color: 'text-sky-400' },
    };
    return map[status] || { label: status?.replace(/_/g, ' '), color: 'text-slate-400' };
};

export default function SubmissionDetailModal({ attemptId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showMcq, setShowMcq] = useState(true);
    const [showTheory, setShowTheory] = useState(true);

    useEffect(() => {
        if (!attemptId) return;
        setLoading(true);
        api.get(`/quiz/attempt/${attemptId}/detail`)
            .then((r) => setData(r.data.data))
            .catch((err) => console.error('Failed to load attempt detail:', err))
            .finally(() => setLoading(false));
    }, [attemptId]);

    if (!attemptId) return null;

    const optionLabel = (idx) => ['A', 'B', 'C', 'D'][idx] || '?';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border border-white/[0.06]"
                style={{ background: '#0a0a12' }}
                onClick={(e) => e.stopPropagation()}>

                {/* Close button */}
                <button onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors cursor-pointer">
                    <X size={18} />
                </button>

                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                    </div>
                ) : !data ? (
                    <div className="flex items-center justify-center py-24">
                        <p className="text-slate-500">Submission not found</p>
                    </div>
                ) : (
                    <div className="p-6">
                        {/* Header */}
                        <div className="mb-6">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                    {data.user?.name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-white truncate">{data.user?.name || 'Unknown'}</h2>
                                    <p className="text-xs text-slate-500">{data.user?.department}</p>
                                </div>
                            </div>
                            <div className="surface rounded-xl p-4">
                                <p className="text-sm font-semibold text-white mb-1">{data.task?.title || 'Task'}</p>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                    <span>{data.course?.courseCode}</span>
                                    <span className="text-slate-600">•</span>
                                    <span className="capitalize">{data.task?.difficulty}</span>
                                    <span className="text-slate-600">•</span>
                                    <span>{data.task?.topic}</span>
                                    {data.attemptNumber > 1 && (
                                        <span className="flex items-center gap-1 text-amber-400">
                                            <RotateCcw size={10} /> Attempt #{data.attemptNumber}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Score Summary */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            <div className="surface rounded-xl p-3 text-center">
                                <Brain size={14} className="text-sky-400 mx-auto mb-1" />
                                <p className="text-lg font-bold text-white">{data.mcqScore}/12</p>
                                <p className="text-[10px] text-slate-500">MCQ Score</p>
                            </div>
                            <div className="surface rounded-xl p-3 text-center">
                                {data.mcqPassed
                                    ? <CheckCircle size={14} className="text-emerald-400 mx-auto mb-1" />
                                    : <XCircle size={14} className="text-red-400 mx-auto mb-1" />}
                                <p className={`text-lg font-bold ${data.mcqPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {data.mcqPassed ? 'Passed' : 'Failed'}
                                </p>
                                <p className="text-[10px] text-slate-500">Result</p>
                            </div>
                            <div className="surface rounded-xl p-3 text-center">
                                <Award size={14} className="text-amber-400 mx-auto mb-1" />
                                <p className={`text-lg font-bold ${data.tokensAwarded > 0 ? 'text-emerald-400' : data.tokensAwarded < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                    {data.tokensAwarded > 0 ? `+${data.tokensAwarded}` : data.tokensAwarded}
                                </p>
                                <p className="text-[10px] text-slate-500">Tokens</p>
                            </div>
                            <div className="surface rounded-xl p-3 text-center">
                                <FileText size={14} className="text-violet-400 mx-auto mb-1" />
                                {(() => { const s = statusMap(data.status, data.mcqPassed); return (
                                    <p className={`text-lg font-bold ${s.color}`}>{s.label}</p>
                                ); })()}
                                <p className="text-[10px] text-slate-500">Status</p>
                            </div>
                        </div>

                        {/* MCQ Section */}
                        <div className="mb-6">
                            <button onClick={() => setShowMcq(!showMcq)}
                                className="flex items-center justify-between w-full px-4 py-3 surface rounded-xl mb-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                                <span className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Brain size={14} className="text-sky-400" /> MCQ Questions ({data.mcqDetail?.length || 0})
                                </span>
                                {showMcq ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                            </button>
                            {showMcq && data.mcqDetail?.length > 0 && (
                                <div className="space-y-4">
                                    {data.mcqDetail.map((q, qi) => (
                                        <div key={qi} className="rounded-xl border border-white/[0.04] overflow-hidden"
                                            style={{ background: 'rgba(255,255,255,0.015)' }}>
                                            <div className="px-4 py-3 border-b border-white/[0.04] flex items-start gap-3">
                                                <span className="text-xs font-bold text-slate-500 mt-0.5 shrink-0">Q{qi + 1}</span>
                                                <p className="text-sm text-white leading-relaxed">{q.question}</p>
                                                <div className="shrink-0 ml-auto">
                                                    {q.isCorrect === true && <CheckCircle size={16} className="text-emerald-400" />}
                                                    {q.isCorrect === false && <XCircle size={16} className="text-red-400" />}
                                                    {q.isCorrect === null && <MinusCircle size={16} className="text-slate-500" />}
                                                </div>
                                            </div>
                                            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {q.options.map((opt, oi) => {
                                                    const isCorrect = oi === q.correctAnswer;
                                                    const isSelected = oi === q.selectedAnswer;
                                                    let bg = 'bg-white/[0.02]';
                                                    let border = 'border-white/[0.04]';
                                                    let textColor = 'text-slate-400';
                                                    if (isCorrect) {
                                                        bg = 'bg-emerald-500/[0.08]';
                                                        border = 'border-emerald-500/20';
                                                        textColor = 'text-emerald-300';
                                                    }
                                                    if (isSelected && !isCorrect) {
                                                        bg = 'bg-red-500/[0.08]';
                                                        border = 'border-red-500/20';
                                                        textColor = 'text-red-300';
                                                    }
                                                    return (
                                                        <div key={oi} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${bg} ${border}`}>
                                                            <span className={`text-[10px] font-bold w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                                                isCorrect ? 'bg-emerald-500/20 text-emerald-400'
                                                                : isSelected ? 'bg-red-500/20 text-red-400'
                                                                : 'bg-white/[0.05] text-slate-500'
                                                            }`}>{optionLabel(oi)}</span>
                                                            <span className={`text-xs ${textColor} leading-snug`}>{opt}</span>
                                                            {isSelected && (
                                                                <span className="ml-auto text-[9px] text-slate-500 shrink-0">
                                                                    {isCorrect ? '✓ selected' : '✗ selected'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Theory Section */}
                        {(data.theoryQuestions?.length > 0 || data.theorySubmissionPath) && (
                            <div>
                                <button onClick={() => setShowTheory(!showTheory)}
                                    className="flex items-center justify-between w-full px-4 py-3 surface rounded-xl mb-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                                        <FileText size={14} className="text-violet-400" /> Theory Submission
                                    </span>
                                    {showTheory ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                                </button>
                                {showTheory && (
                                    <div className="space-y-4">
                                        {/* Theory Questions */}
                                        {data.theoryQuestions?.length > 0 && (
                                            <div className="surface rounded-xl p-4">
                                                <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Questions Asked</p>
                                                <div className="space-y-3">
                                                    {data.theoryQuestions.map((tq, ti) => (
                                                        <div key={ti} className="flex gap-3 items-start">
                                                            <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                                                                {ti + 1}
                                                            </span>
                                                            <p className="text-sm text-slate-300 leading-relaxed">{tq}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Embedded PDF */}
                                        {data.theorySubmissionPath && (
                                            <div className="surface rounded-xl overflow-hidden">
                                                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Submitted PDF</p>
                                                    <span className="text-[10px] text-slate-600">
                                                        {data.theorySubmittedAt && new Date(data.theorySubmittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="w-full" style={{ height: '60vh' }}>
                                                    <iframe
                                                        src={`/${data.theorySubmissionPath}`}
                                                        className="w-full h-full border-0"
                                                        title="Theory submission PDF"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer timestamp */}
                        {data.createdAt && (
                            <p className="text-[10px] text-slate-600 text-center mt-6">
                                Submitted on {new Date(data.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
