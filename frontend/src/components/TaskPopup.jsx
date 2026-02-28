import { useState, useEffect, useRef } from 'react';
import { X, Play, Coffee, Brain, FileText, CheckCircle, Timer, Zap } from 'lucide-react';
import { formatTime, playAlertSound } from '../utils/helpers';
import QuizModal from './QuizModal';
import TheoryUpload from './TheoryUpload';

const PHASES = { IDLE: 'idle', STUDY: 'study', BREAK: 'break', QUIZ: 'quiz', THEORY: 'theory', DONE: 'done' };
const BREAK_SEC = 300;

export default function TaskPopup({ task, onClose }) {
    const lsKey = `taskpopup_${task._id}`;

    // Always start fresh from IDLE — study timer → break → quiz → theory
    // Clear any stale saved state on open
    useEffect(() => { localStorage.removeItem(lsKey); }, [lsKey]);

    const [phase, setPhase] = useState(PHASES.IDLE);
    const [studyLeft, setStudyLeft] = useState(Math.round(task.durationHours * 3600));
    const [breakLeft, setBreakLeft] = useState(BREAK_SEC);
    const [running, setRunning] = useState(false);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!running) return;
        intervalRef.current = setInterval(() => {
            if (phase === PHASES.STUDY) {
                setStudyLeft((p) => { if (p <= 1) { clearInterval(intervalRef.current); playAlertSound(); setPhase(PHASES.BREAK); setRunning(false); return 0; } return p - 1; });
            } else if (phase === PHASES.BREAK) {
                setBreakLeft((p) => { if (p <= 1) { clearInterval(intervalRef.current); playAlertSound(); setPhase(PHASES.QUIZ); setRunning(false); return 0; } return p - 1; });
            }
        }, 1000);
        return () => clearInterval(intervalRef.current);
    }, [running, phase]);

    const start = () => { setPhase(PHASES.STUDY); setRunning(true); };
    const startBreak = () => { setPhase(PHASES.BREAK); setRunning(true); };
    const skipBreak = () => { setPhase(PHASES.QUIZ); };
    const handleQuizDone = (passed) => { setPhase(passed ? PHASES.THEORY : PHASES.DONE); if (!passed) localStorage.removeItem(lsKey); };
    const handleTheoryDone = () => { setPhase(PHASES.DONE); localStorage.removeItem(lsKey); };
    const handleClose = () => { clearInterval(intervalRef.current); onClose(); };

    const totalSec = task.durationHours * 3600;
    const studyProgress = totalSec > 0 ? ((totalSec - studyLeft) / totalSec) * 100 : 0;
    const breakProgress = ((BREAK_SEC - breakLeft) / BREAK_SEC) * 100;

    const phaseConfig = {
        [PHASES.IDLE]: { icon: Play, color: 'from-sky-500 to-cyan-400', label: 'Ready to Study' },
        [PHASES.STUDY]: { icon: Timer, color: 'from-sky-500 to-blue-500', label: 'Studying' },
        [PHASES.BREAK]: { icon: Coffee, color: 'from-emerald-500 to-teal-500', label: 'Break Time' },
        [PHASES.QUIZ]: { icon: Brain, color: 'from-pink-500 to-rose-500', label: 'Quiz Time' },
        [PHASES.THEORY]: { icon: FileText, color: 'from-violet-500 to-purple-500', label: 'Theory Submission' },
        [PHASES.DONE]: { icon: CheckCircle, color: 'from-emerald-500 to-green-500', label: 'Completed!' },
    };
    const cfg = phaseConfig[phase];

    if (phase === PHASES.QUIZ) return <QuizModal task={task} onDone={handleQuizDone} onClose={handleClose} />;
    if (phase === PHASES.THEORY) return <TheoryUpload task={task} onDone={handleTheoryDone} onClose={handleClose} />;

    return (
        <div className="modal-backdrop" onClick={handleClose}>
            <div className="relative w-full max-w-md mx-4 surface rounded-2xl p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <button onClick={handleClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"><X size={18} /></button>

                {/* Header */}
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${cfg.color} flex items-center justify-center mb-3 shadow-lg`}>
                        <cfg.icon size={24} className="text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-white">{task.title}</h2>
                    <p className="text-xs text-slate-500 mt-1">{task.course?.courseCode} • {task.durationHours}h • {task.difficulty}</p>
                    {task.tokenStake > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400 mt-2"><Zap size={12} /> {task.tokenStake} tokens staked</span>
                    )}
                </div>

                {/* Phase Content */}
                {phase === PHASES.IDLE && (
                    <div>
                        {task.description && <p className="text-sm text-slate-400 mb-4 leading-relaxed">{task.description}</p>}
                        <button onClick={start} className="w-full py-3 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 cursor-pointer">
                            <Play size={16} /> Start Studying
                        </button>
                    </div>
                )}

                {phase === PHASES.STUDY && (
                    <div>
                        <div className="text-center mb-4">
                            <p className="text-4xl font-mono font-bold text-white mb-1">{formatTime(studyLeft)}</p>
                            <p className="text-xs text-slate-500">{cfg.label}</p>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden mb-4" style={{ background: '#111118' }}>
                            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-1000" style={{ width: `${studyProgress}%` }} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setRunning(!running)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${running ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'btn-primary'}`}>
                                {running ? 'Pause' : 'Resume'}
                            </button>
                        </div>
                    </div>
                )}

                {phase === PHASES.BREAK && (
                    <div>
                        <div className="text-center mb-4">
                            <p className="text-4xl font-mono font-bold text-emerald-400 mb-1">{formatTime(breakLeft)}</p>
                            <p className="text-xs text-slate-500">Take a breather ☕</p>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden mb-4" style={{ background: '#111118' }}>
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000" style={{ width: `${breakProgress}%` }} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setRunning(!running)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer">
                                {running ? 'Pause' : 'Resume'}
                            </button>
                            <button onClick={skipBreak} className="flex-1 py-2.5 rounded-xl btn-primary text-sm cursor-pointer">
                                Skip → Quiz
                            </button>
                        </div>
                    </div>
                )}

                {phase === PHASES.DONE && (
                    <div className="text-center">
                        <p className="text-emerald-400 text-sm mb-4">Task flow complete! 🎉</p>
                        <button onClick={handleClose} className="px-6 py-2.5 rounded-xl btn-primary text-sm cursor-pointer">Done</button>
                    </div>
                )}
            </div>
        </div>
    );
}
