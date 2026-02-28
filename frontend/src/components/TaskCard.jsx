import { Clock, Zap, BookOpen, ChevronRight } from 'lucide-react';
import { difficultyColor } from '../utils/helpers';

export default function TaskCard({ task, onClick }) {
    const done = task.status === 'completed';
    const diffClr = difficultyColor(task.difficulty);

    return (
        <button onClick={onClick}
            className={`w-full text-left surface rounded-xl p-4 flex items-center gap-4 card-hover group cursor-pointer transition-all ${
                done ? 'opacity-60' : ''
            }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                done ? 'bg-emerald-500/10' : 'bg-sky-500/10'
            }`}>
                <BookOpen size={18} className={done ? 'text-emerald-400' : 'text-sky-400'} />
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${done ? 'text-slate-500 line-through' : 'text-white'}`}>{task.title}</p>
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={10} /> {task.durationHours}h</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${diffClr}`}>{task.difficulty}</span>
                    {task.tokenStake > 0 && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5"><Zap size={10} /> {task.tokenStake}</span>
                    )}
                </div>
            </div>
            {done && <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg">PASS</span>}
            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
        </button>
    );
}
