import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { Trophy, Crown, Medal } from 'lucide-react';

export default function MiniLeaderboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [entries, setEntries] = useState([]);

    useEffect(() => {
        api.get('/leaderboard/overall?page=1&limit=9').then((r) => setEntries(r.data.data || [])).catch(() => {});
    }, []);

    const rankIcon = (i) => {
        if (i === 0) return <Crown size={12} className="text-amber-400" />;
        if (i === 1) return <Medal size={12} className="text-slate-300" />;
        if (i === 2) return <Medal size={12} className="text-amber-600" />;
        return <span className="text-[10px] text-slate-600 font-mono">{i + 1}</span>;
    };

    return (
        <div className="glass rounded-2xl p-4 sticky top-20">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Trophy size={14} className="text-amber-400" />
                    <span className="text-xs font-semibold text-white">Top Rankings</span>
                </div>
                <button onClick={() => navigate('/leaderboard')} className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer">View all →</button>
            </div>
            <div className="space-y-1">
                {entries.map((e, i) => {
                    const name = e.user?.name || e.name;
                    const uid = e.userId || e.user?._id || e._id;
                    const isMe = uid === user?._id;
                    return (
                        <div key={uid || i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                            isMe ? 'bg-sky-500/[0.06]' : 'hover:bg-white/[0.03]'
                        }`}>
                            <div className="w-5 flex justify-center">{rankIcon(i)}</div>
                            <button onClick={() => navigate(`/profile/${uid}`)}
                                className={`text-xs truncate flex-1 text-left cursor-pointer hover:underline ${isMe ? 'text-sky-400 font-semibold' : 'text-slate-400'}`}>
                                {name} {isMe && <span className="text-[9px] text-sky-500">(you)</span>}
                            </button>
                            <span className="text-[10px] text-slate-500 font-mono">{e.tokens ?? e.tokenBalance}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
