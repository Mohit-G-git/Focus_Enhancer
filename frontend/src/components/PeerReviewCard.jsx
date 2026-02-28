import { useState } from 'react';
import { ThumbsUp, ThumbsDown, FileText } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function PeerReviewCard({ submission }) {
    const [loading, setLoading] = useState(false);
    const [voted, setVoted] = useState(null);

    const vote = async (type) => {
        setLoading(true);
        try {
            await api.post(`/peer-review/${submission._id}/${type}`, { reason: type === 'downvote' ? 'Needs improvement' : undefined });
            toast.success(type === 'upvote' ? 'Upvoted!' : 'Downvoted');
            setVoted(type);
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
        finally { setLoading(false); }
    };

    const pr = submission.peerReview || {};

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                    <FileText size={12} />
                    <span>{submission.pdf?.originalName || 'Submission'}</span>
                    {submission.quizAttempt?.theoryQuestionCount && (
                        <span className="text-slate-600">• {submission.quizAttempt.theoryQuestionCount} questions</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button onClick={() => !voted && !loading && vote('upvote')} disabled={loading || !!voted}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        voted === 'upvote' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/5'
                    } disabled:opacity-50`}>
                    <ThumbsUp size={13} /> {pr.upvotes ?? 0}
                </button>
                <button onClick={() => !voted && !loading && vote('downvote')} disabled={loading || !!voted}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        voted === 'downvote' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'text-slate-500 hover:text-red-400 hover:bg-red-500/5'
                    } disabled:opacity-50`}>
                    <ThumbsDown size={13} /> {pr.downvotes ?? 0}
                </button>
            </div>
        </div>
    );
}
