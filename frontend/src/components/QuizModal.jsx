import { useState, useEffect, useRef } from 'react';
import { X, Brain, Clock, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const PHASES = { LOADING: 'loading', ACTIVE: 'active', RESULT: 'result' };
const TIME_PER_Q = 15;

export default function QuizModal({ task, onDone, onClose }) {
    const [phase, setPhase] = useState(PHASES.LOADING);
    const [questions, setQuestions] = useState([]);
    const [current, setCurrent] = useState(0);
    const [timer, setTimer] = useState(TIME_PER_Q);
    const [selected, setSelected] = useState(null);
    const [result, setResult] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        const startQuiz = (retry = true) => {
            api.post(`/quiz/${task._id}/start`).then((r) => {
                setQuestions(r.data.data?.mcqs || []);
                setPhase(PHASES.ACTIVE);
            }).catch((err) => {
                // If backend cleaned up a stale attempt, retry once automatically
                if (retry && err.response?.status === 409) {
                    setTimeout(() => startQuiz(false), 1000);
                    return;
                }
                toast.error(err.response?.data?.message || 'Quiz failed to load');
                onClose();
            });
        };
        startQuiz();
    }, []);

    // Timer per question
    useEffect(() => {
        if (phase !== PHASES.ACTIVE) return;
        setTimer(TIME_PER_Q);
        timerRef.current = setInterval(() => {
            setTimer((p) => {
                if (p <= 1) { clearInterval(timerRef.current); submitAnswer(null); return 0; }
                return p - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [current, phase]);

    const submitAnswer = async (optionIndex) => {
        clearInterval(timerRef.current);
        setSelected(optionIndex);
        try {
            await api.post(`/quiz/${task._id}/answer`, { questionIndex: current, selectedAnswer: optionIndex ?? null });
        } catch { }
        setTimeout(() => {
            if (current + 1 < questions.length) {
                setCurrent((p) => p + 1);
                setSelected(null);
            } else {
                finishQuiz();
            }
        }, 600);
    };

    const finishQuiz = async () => {
        try {
            const r = await api.get(`/quiz/${task._id}/mcq-result`);
            setResult(r.data.data);
        } catch { setResult({ score: 0, total: questions.length, passed: false }); }
        setPhase(PHASES.RESULT);
    };

    if (phase === PHASES.LOADING) {
        return (
            <div className="modal-backdrop">
                <div className="surface rounded-2xl p-12 text-center animate-slide-up">
                    <div className="w-10 h-10 mx-auto border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mb-4" />
                    <p className="text-sm text-slate-400">Generating quiz...</p>
                </div>
            </div>
        );
    }

    if (phase === PHASES.RESULT) {
        const passed = result?.passed;
        return (
            <div className="modal-backdrop" onClick={onClose}>
                <div className="relative w-full max-w-md mx-4 surface rounded-2xl p-8 text-center animate-slide-up" onClick={(e) => e.stopPropagation()}>
                    <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                        passed ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    }`}>
                        {passed ? <CheckCircle size={32} className="text-emerald-400" /> : <XCircle size={32} className="text-red-400" />}
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">{passed ? 'Quiz Passed! 🎉' : 'Not Quite'}</h2>
                    <p className="text-sm text-slate-400 mb-1">Score: <span className="text-white font-bold">{result?.score}/{result?.maxScore || 12}</span></p>
                    {result?.attemptNumber > 1 && (
                        <p className="text-[10px] text-slate-500 mb-1">Attempt #{result.attemptNumber}</p>
                    )}
                    {result?.tokensAwarded != null && (
                        <p className={`text-xs mb-3 ${result.tokensAwarded > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {result.tokensAwarded > 0 ? `+${result.tokensAwarded} tokens earned!` : `Stake forfeited`}
                        </p>
                    )}
                    {passed ? (
                        <button onClick={() => onDone(true)}
                            className="px-6 py-2.5 rounded-xl btn-primary text-sm cursor-pointer">
                            Continue to Theory →
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 mb-1">You can re-attempt with reduced stake</p>
                            <button onClick={onClose}
                                className="px-6 py-2.5 rounded-xl text-sm cursor-pointer"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                                Back to Tasks
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const q = questions[current];
    const timerPct = (timer / TIME_PER_Q) * 100;

    return (
        <div className="modal-backdrop">
            <div className="relative w-full max-w-lg mx-4 surface rounded-2xl p-6 animate-slide-up">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"><X size={18} /></button>

                {/* Progress */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Brain size={16} className="text-pink-400" />
                        <span className="text-xs font-semibold text-white">Question {current + 1}/{questions.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock size={13} className={timer <= 5 ? 'text-red-400' : 'text-slate-500'} />
                        <span className={`text-xs font-mono font-bold ${timer <= 5 ? 'text-red-400' : 'text-white'}`}>{timer}s</span>
                    </div>
                </div>

                {/* Timer bar */}
                <div className="w-full h-1 rounded-full overflow-hidden mb-5" style={{ background: '#111118' }}>
                    <div className={`h-full rounded-full transition-all duration-1000 ${
                        timer <= 5 ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-sky-500'
                    }`} style={{ width: `${timerPct}%` }} />
                </div>

                {/* Question */}
                <p className="text-sm text-white font-medium mb-5 leading-relaxed">{q?.question}</p>

                {/* Options */}
                <div className="space-y-2">
                    {q?.options?.map((opt, i) => (
                        <button key={i} onClick={() => selected === null && submitAnswer(i)} disabled={selected !== null}
                            className={`w-full text-left p-3.5 rounded-xl text-sm transition-all cursor-pointer flex items-center gap-3 ${
                                selected === i ? 'bg-sky-500/15 border-sky-500/30 text-sky-300' : 'text-slate-300 hover:bg-white/[0.04]'
                            }`}
                            style={{ border: `1px solid ${selected === i ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.04)'}`, background: selected === i ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)' }}>
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ background: selected === i ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)' }}>
                                {String.fromCharCode(65 + i)}
                            </span>
                            {opt}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
