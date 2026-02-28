import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import {
    X, ThumbsUp, ThumbsDown, Loader2, FileText, Brain,
    AlertCircle, Coins, ChevronDown, ChevronUp, Lock, Unlock, ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

const WAGER_COST = 5;

export default function ReviewSolutionModal({ taskId, revieweeId, revieweeName, onClose }) {
    const { user, refreshUser } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showQuestions, setShowQuestions] = useState(true);

    // Vote state
    const [voteType, setVoteType] = useState(null);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadSolution = useCallback(async () => {
        if (!taskId || !revieweeId) return;
        setLoading(true);
        try {
            const r = await api.get(`/reviews/solution/${taskId}/${revieweeId}`);
            setData(r.data.data);
        } catch (err) {
            console.error('Failed to load solution:', err);
            toast.error(err.response?.data?.message || 'Failed to load solution');
        } finally {
            setLoading(false);
        }
    }, [taskId, revieweeId]);

    useEffect(() => { loadSolution(); }, [loadSolution]);

    const existing = data?.existingReview;
    const isLocked = !existing; // No review record = PDF locked
    const isPending = existing?.type === 'pending'; // Unlocked but no vote yet
    const hasVoted = existing && existing.type !== 'pending'; // Already voted
    const isSelf = revieweeId === user?._id || revieweeId === user?.id;

    /* ── Unlock (pay wager) ─────────────────────────────────── */
    const handleUnlock = async () => {
        if ((user?.tokenBalance || 0) < WAGER_COST) {
            return toast.error(`You need at least ${WAGER_COST} tokens`);
        }
        setSubmitting(true);
        try {
            const r = await api.post('/reviews/unlock', {
                taskId, revieweeId, wager: WAGER_COST,
            });
            toast.success(r.data.message);
            await refreshUser();
            await loadSolution(); // reload to get PDF path + review record
        } catch (err) {
            toast.error(err.response?.data?.message || 'Unlock failed');
        }
        setSubmitting(false);
    };

    /* ── Cast vote ──────────────────────────────────────────── */
    const handleVote = async () => {
        if (!voteType) return toast.error('Select upvote or downvote');
        if (voteType === 'downvote' && reason.trim().length < 10) {
            return toast.error('Remark must be at least 10 characters');
        }

        setSubmitting(true);
        try {
            const body = { type: voteType };
            if (voteType === 'downvote') body.reason = reason.trim();

            const r = await api.post(`/reviews/${existing._id}/vote`, body);
            toast.success(r.data.message);
            await refreshUser();
            await loadSolution();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Vote failed');
        }
        setSubmitting(false);
    };

    /* ── Dispute status label helpers ───────────────────────── */
    const disputeBadge = (status) => {
        const map = {
            none: null,
            remark_rejected: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Remark Rejected' },
            pending_response: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Awaiting Response' },
            agreed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Agreed' },
            ai_reviewing: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'AI Reviewing…' },
            resolved_downvoter_wins: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Downvote Upheld' },
            resolved_reviewee_wins: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Solution Valid' },
        };
        const s = map[status];
        if (!s) return null;
        return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${s.bg} ${s.text}`}>{s.label}</span>;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border border-white/[0.06]"
                style={{ background: '#0a0a12' }}
                onClick={(e) => e.stopPropagation()}>

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
                        <p className="text-slate-500">Solution not found</p>
                    </div>
                ) : (
                    <div className="p-6">
                        {/* Header */}
                        <div className="mb-5">
                            <h2 className="text-lg font-bold text-white mb-1">{data.task?.title}</h2>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                <span>by <span className="text-sky-400">{revieweeName}</span></span>
                                <span className="text-slate-600">•</span>
                                <span>{data.task?.course?.courseCode}</span>
                                <span className="text-slate-600">•</span>
                                <span className="capitalize">{data.task?.difficulty}</span>
                                <span className="text-slate-600">•</span>
                                <span>MCQ: <span className="text-white font-semibold">{data.mcqScore}/12</span></span>
                            </div>
                        </div>

                        {/* Theory Questions (always visible) */}
                        <div className="mb-5">
                            <button onClick={() => setShowQuestions(!showQuestions)}
                                className="flex items-center justify-between w-full px-4 py-3 surface rounded-xl cursor-pointer hover:bg-white/[0.03] transition-colors">
                                <span className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Brain size={14} className="text-violet-400" />
                                    Theory Questions ({data.theoryQuestions?.length || 0})
                                </span>
                                {showQuestions
                                    ? <ChevronUp size={14} className="text-slate-500" />
                                    : <ChevronDown size={14} className="text-slate-500" />}
                            </button>
                            {showQuestions && data.theoryQuestions?.length > 0 && (
                                <div className="mt-3 surface rounded-xl p-4 space-y-3">
                                    {data.theoryQuestions.map((q) => (
                                        <div key={q.number} className="flex gap-3 items-start">
                                            <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                                                {q.number}
                                            </span>
                                            <p className="text-sm text-slate-300 leading-relaxed">{q.question}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── LOCKED STATE ──────────────────────── */}
                        {isLocked && !isSelf && (
                            <div className="mb-6 surface rounded-xl overflow-hidden border border-amber-500/10">
                                <div className="p-8 flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
                                        <Lock size={28} className="text-amber-400" />
                                    </div>
                                    <h3 className="text-base font-bold text-white mb-2">PDF Solution Locked</h3>
                                    <p className="text-sm text-slate-400 mb-1 max-w-sm">
                                        Pay <span className="text-amber-400 font-bold">{WAGER_COST} tokens</span> to unlock the PDF and review this submission.
                                    </p>
                                    <p className="text-xs text-slate-500 mb-5 max-w-sm">
                                        Upvoting is free (wager returned). Downvoting stakes your wager.
                                    </p>
                                    <button onClick={handleUnlock}
                                        disabled={submitting || (user?.tokenBalance || 0) < WAGER_COST}
                                        className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black transition-all cursor-pointer flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                                        {submitting
                                            ? <><Loader2 size={16} className="animate-spin" /> Unlocking…</>
                                            : <><Unlock size={16} /> Unlock for {WAGER_COST} Tokens</>}
                                    </button>
                                    {(user?.tokenBalance || 0) < WAGER_COST && (
                                        <p className="text-xs text-red-400 mt-3">
                                            Insufficient balance ({user?.tokenBalance || 0} tokens)
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── UNLOCKED: PDF VIEWER ─────────────── */}
                        {!isLocked && data.pdf?.storedPath && (
                            <div className="mb-5 surface rounded-xl overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        <FileText size={12} className="text-sky-400" /> Submitted PDF
                                    </p>
                                    <span className="text-[10px] text-slate-600">{data.pdf.originalName}</span>
                                </div>
                                <div className="w-full" style={{ height: '50vh' }}>
                                    <iframe src={`/${data.pdf.storedPath}`} className="w-full h-full border-0" title="Theory submission PDF" />
                                </div>
                            </div>
                        )}

                        {/* ── ALREADY VOTED NOTICE ─────────────── */}
                        {hasVoted && (
                            <div className="space-y-3 mb-5">
                                <div className={`p-4 rounded-xl border ${
                                    existing.type === 'upvote'
                                        ? 'bg-emerald-500/[0.06] border-emerald-500/10'
                                        : 'bg-red-500/[0.06] border-red-500/10'
                                }`}>
                                    <p className={`text-sm flex items-center gap-2 ${
                                        existing.type === 'upvote' ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                        {existing.type === 'upvote'
                                            ? <><ThumbsUp size={14} /> You upvoted this submission</>
                                            : <><ThumbsDown size={14} /> You downvoted this submission</>}
                                    </p>
                                    {existing.reason && (
                                        <p className="text-xs text-slate-400 mt-2">
                                            Your remark: "{existing.reason}"
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2">
                                        {disputeBadge(existing.disputeStatus)}
                                        {existing.remarkCheck?.status === 'rejected' && (
                                            <span className="text-[10px] text-red-400 flex items-center gap-1">
                                                <ShieldAlert size={10} /> {existing.remarkCheck.reasoning}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* AI Verdict if available */}
                                {existing.aiVerdict?.decision && (
                                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <p className="text-[11px] text-slate-400">
                                            🔨 AI Verdict:{' '}
                                            <span className={existing.aiVerdict.decision === 'downvoter_correct' ? 'text-emerald-400' : 'text-red-400'}>
                                                {existing.aiVerdict.decision === 'downvoter_correct'
                                                    ? 'Your downvote was upheld ✓'
                                                    : 'The solution was valid'}
                                            </span>
                                            {existing.aiVerdict.confidence != null && (
                                                <span className="text-slate-600 ml-1">
                                                    ({Math.round(existing.aiVerdict.confidence * 100)}% confidence)
                                                </span>
                                            )}
                                        </p>
                                        {existing.aiVerdict.reasoning && (
                                            <p className="text-[10px] text-slate-500 mt-1">{existing.aiVerdict.reasoning}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── VOTE SECTION (only when unlocked + pending) ── */}
                        {isPending && (
                            <div className="surface rounded-xl p-5">
                                <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                                    <Coins size={14} className="text-amber-400" /> Cast Your Review
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Upvoting is <span className="text-emerald-400 font-semibold">free</span> (wager returned).
                                    Downvoting requires a remark — your <span className="text-amber-400 font-semibold">{existing.wager}</span> tokens are at stake.
                                </p>

                                <div className="flex gap-3 mb-4">
                                    <button onClick={() => setVoteType('upvote')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer border ${
                                            voteType === 'upvote'
                                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-emerald-400 hover:border-emerald-500/20'
                                        }`}>
                                        <ThumbsUp size={18} /> Upvote
                                    </button>
                                    <button onClick={() => setVoteType('downvote')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer border ${
                                            voteType === 'downvote'
                                                ? 'bg-red-500/15 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                                                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-red-400 hover:border-red-500/20'
                                        }`}>
                                        <ThumbsDown size={18} /> Downvote
                                    </button>
                                </div>

                                {voteType === 'downvote' && (
                                    <div className="mb-4 animate-slide-up">
                                        <label className="text-xs text-slate-400 mb-1.5 block">
                                            Remark <span className="text-red-400">*</span>
                                            <span className="text-slate-600 ml-1">(min 10 chars — AI will check for spam/profanity)</span>
                                        </label>
                                        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                                            placeholder="Explain specifically what is wrong with the solution…"
                                            rows={3}
                                            className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-red-500/30"
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
                                        <p className="text-[10px] text-slate-600 mt-1 text-right">{reason.length}/2000</p>
                                    </div>
                                )}

                                {voteType && (
                                    <div className="space-y-3 animate-slide-up">
                                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] text-slate-500">
                                            {voteType === 'upvote' ? (
                                                <p><ThumbsUp size={10} className="inline text-emerald-400 mr-1" />
                                                Your <span className="text-amber-400">{existing.wager}</span> tokens will be returned. The student gains reputation.</p>
                                            ) : (
                                                <p><ThumbsDown size={10} className="inline text-red-400 mr-1" />
                                                Your remark will be checked by AI. If valid, the student must respond. If spam, you lose <span className="text-red-400">{existing.wager + 10}</span> tokens.</p>
                                            )}
                                        </div>

                                        <button onClick={handleVote} disabled={submitting}
                                            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                                voteType === 'upvote'
                                                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white'
                                                    : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white'
                                            } disabled:opacity-50 disabled:cursor-not-allowed`}>
                                            {submitting ? (
                                                <><Loader2 size={14} className="animate-spin" /> Processing…</>
                                            ) : voteType === 'upvote' ? (
                                                <><ThumbsUp size={14} /> Submit Upvote (free)</>
                                            ) : (
                                                <><ThumbsDown size={14} /> Submit Downvote</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Self-review notice */}
                        {isSelf && (
                            <div className="p-4 rounded-xl bg-slate-500/[0.06] border border-slate-500/10">
                                <p className="text-sm text-slate-400">You can't review your own submission.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
