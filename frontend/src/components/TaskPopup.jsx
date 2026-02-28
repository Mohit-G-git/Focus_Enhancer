import { useState, useEffect, useRef, useCallback } from 'react';
import { quizAPI, theoryAPI } from '../api';

const PHASE = {
    INPUT_TIME: 'input_time',
    STUDY_TIMER: 'study_timer',
    BEEP_COUNTDOWN: 'beep_countdown',
    QUIZ: 'quiz',
    RESULTS: 'results',
    THEORY: 'theory',
};

const Q_TIME = 20; // seconds per MCQ question

// Web Audio beep generator
function playBeep(freq = 880, duration = 200) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, duration);
    } catch { /* audio not available */ }
}

export default function TaskPopup({ task, onClose, onDone }) {
    const [phase, setPhase] = useState(PHASE.INPUT_TIME);

    // Time input
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(30);

    // Study timer (seconds remaining)
    const [studyRemaining, setStudyRemaining] = useState(0);

    // Beep countdown (300 seconds = 5 min)
    const [beepRemaining, setBeepRemaining] = useState(300);

    // Quiz state
    const [mcqs, setMcqs] = useState([]);
    const [currentQ, setCurrentQ] = useState(0);
    const [qTimer, setQTimer] = useState(Q_TIME);
    const [selected, setSelected] = useState(null);
    const [answered, setAnswered] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Results & theory
    const [results, setResults] = useState(null);
    const [theoryQs, setTheoryQs] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const timerRef = useRef(null);
    const beepIntervalRef = useRef(null);

    // ────────────── Persist timer in localStorage ──────────────
    const storageKey = `fe_timer_${task._id}`;

    const startStudyTimer = () => {
        const totalSec = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
        if (totalSec < 60) { setError('Please enter at least 1 minute.'); return; }
        setError('');
        const endTime = Date.now() + totalSec * 1000;
        localStorage.setItem(storageKey, JSON.stringify({ endTime, taskId: task._id }));
        setStudyRemaining(totalSec);
        setPhase(PHASE.STUDY_TIMER);
    };

    // On mount: check if there's a saved timer running
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const { endTime } = JSON.parse(saved);
                const rem = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
                if (rem > 0) {
                    setStudyRemaining(rem);
                    setPhase(PHASE.STUDY_TIMER);
                } else {
                    // Timer already expired — go to beep phase
                    localStorage.removeItem(storageKey);
                    setPhase(PHASE.BEEP_COUNTDOWN);
                }
            } catch { localStorage.removeItem(storageKey); }
        }
    }, []);

    // ────────────── PHASE: Study Timer ──────────────
    useEffect(() => {
        if (phase !== PHASE.STUDY_TIMER) return;
        if (studyRemaining <= 0) {
            localStorage.removeItem(storageKey);
            setBeepRemaining(300);
            setPhase(PHASE.BEEP_COUNTDOWN);
            return;
        }
        const t = setTimeout(() => setStudyRemaining((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [studyRemaining, phase]);

    // ────────────── PHASE: 5-min Beep Countdown ──────────────
    useEffect(() => {
        if (phase !== PHASE.BEEP_COUNTDOWN) return;

        // Beep every second for last 5 minutes
        beepIntervalRef.current = setInterval(() => {
            setBeepRemaining((b) => {
                if (b <= 1) {
                    clearInterval(beepIntervalRef.current);
                    startQuiz();
                    return 0;
                }
                // Beep: every 30s for first 4 min, every 5s for last minute, every 1s for last 10s
                if (b <= 10 || b % 5 === 0 && b <= 60 || b % 30 === 0) {
                    playBeep(b <= 10 ? 1200 : b <= 60 ? 1000 : 880, b <= 10 ? 300 : 200);
                }
                return b - 1;
            });
        }, 1000);

        return () => clearInterval(beepIntervalRef.current);
    }, [phase]);

    // ────────────── Start Quiz ──────────────
    const startQuiz = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await quizAPI.start(task._id);
            const data = res.data.data || res.data;
            setMcqs(data.mcqs || []);
            setCurrentQ(0);
            setSelected(null);
            setAnswered(false);
            setFeedback(null);
            setQTimer(Q_TIME);
            setPhase(PHASE.QUIZ);
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to start quiz';
            if (msg.includes('already')) {
                await fetchResults();
            } else {
                setError(msg);
                setPhase(PHASE.INPUT_TIME);
            }
        } finally {
            setLoading(false);
        }
    };

    // ────────────── PHASE: Quiz Per-Question Timer ──────────────
    useEffect(() => {
        if (phase !== PHASE.QUIZ || mcqs.length === 0) return;
        setQTimer(Q_TIME);
        setSelected(null);
        setAnswered(false);
        setFeedback(null);

        timerRef.current = setInterval(() => {
            setQTimer((t) => {
                if (t <= 1) {
                    clearInterval(timerRef.current);
                    submitAnswer(null);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [currentQ, phase]);

    const submitAnswer = useCallback(async (answerIndex) => {
        if (answered) return;
        clearInterval(timerRef.current);
        setAnswered(true);

        try {
            const res = await quizAPI.answer(task._id, {
                questionIndex: currentQ,
                selectedAnswer: answerIndex,
            });
            const data = res.data.data || res.data;
            setFeedback(data);

            setTimeout(() => {
                if (data.remaining > 0) {
                    setCurrentQ((q) => q + 1);
                } else {
                    fetchResults();
                }
            }, 1500);
        } catch {
            setTimeout(() => {
                if (currentQ + 1 < mcqs.length) setCurrentQ((q) => q + 1);
                else fetchResults();
            }, 1000);
        }
    }, [answered, currentQ, mcqs.length, task._id]);

    const handleOptionClick = (i) => { if (!answered) { setSelected(i); submitAnswer(i); } };

    // ────────────── Results ──────────────
    const fetchResults = async () => {
        try {
            const res = await quizAPI.getMCQResult(task._id);
            setResults(res.data.data || res.data);
            setPhase(PHASE.RESULTS);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to get results');
            setPhase(PHASE.RESULTS);
        }
    };

    // ────────────── Theory ──────────────
    const loadTheory = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await quizAPI.getTheory(task._id);
            setTheoryQs((res.data.data || res.data).questions || []);
            setPhase(PHASE.THEORY);
        } catch (err) { setError(err.response?.data?.message || 'Cannot load theory'); }
        finally { setLoading(false); }
    };

    const uploadPDF = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) return;
        setUploading(true);
        const fd = new FormData();
        fd.append('solutions', file);
        try { await theoryAPI.submit(task._id, fd); onDone(); }
        catch (err) { setError(err.response?.data?.message || 'Upload failed'); }
        finally { setUploading(false); }
    };

    // ────────────── Helpers ──────────────
    const fmt = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const currentMCQ = mcqs[currentQ];

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content">
                <div className="modal-header">
                    <h3>{task.title}</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {error && <div className="error-msg">{error}</div>}

                    {/* ═══════ INPUT TIME ═══════ */}
                    {phase === PHASE.INPUT_TIME && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ marginBottom: 16 }}>
                                {task.topic && <span className="badge badge-accent" style={{ marginRight: 8 }}>{task.topic}</span>}
                                <span className={`badge ${task.difficulty === 'HARD' || task.difficulty === 'hard' ? 'badge-hard' :
                                        task.difficulty === 'MEDIUM' || task.difficulty === 'medium' ? 'badge-medium' : 'badge-easy'
                                    }`}>{task.difficulty}</span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
                                {task.description}
                            </p>

                            <h4 style={{ fontWeight: 700, marginBottom: 16 }}>⏰ How much time do you need?</h4>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <div className="input-group" style={{ width: 80, gap: 4 }}>
                                    <label style={{ textAlign: 'center' }}>Hours</label>
                                    <input type="number" min="0" max="12" value={hours}
                                        onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                                        style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, padding: '8px' }} />
                                </div>
                                <span style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 16 }}>:</span>
                                <div className="input-group" style={{ width: 80, gap: 4 }}>
                                    <label style={{ textAlign: 'center' }}>Minutes</label>
                                    <input type="number" min="0" max="59" value={minutes}
                                        onChange={(e) => setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                        style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, padding: '8px' }} />
                                </div>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: 20 }}>
                                After this time, a 5-minute alert will sound, followed by the MCQ quiz.
                            </p>

                            <button className="btn btn-primary btn-lg" onClick={startStudyTimer}>
                                🚀 Start Study Timer
                            </button>
                            <p style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                                🪙 Stake: {task.tokenStake || 10} tokens &nbsp;|&nbsp; 6 MCQs &nbsp;|&nbsp; {Q_TIME}s each
                            </p>
                        </div>
                    )}

                    {/* ═══════ STUDY TIMER ═══════ */}
                    {phase === PHASE.STUDY_TIMER && (
                        <div className="countdown-display">
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                📖 Study Time Remaining
                            </div>
                            <div className="countdown-time">{fmt(studyRemaining)}</div>
                            <div className="countdown-label" style={{ marginTop: 12 }}>
                                Focus on: <strong>{task.topic || task.title}</strong>
                            </div>
                            <div style={{
                                width: '100%', height: 6, background: 'var(--bg-tertiary)',
                                borderRadius: 999, marginTop: 24, overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%', borderRadius: 999,
                                    background: 'var(--accent-gradient)',
                                    width: `${Math.max(0, 100 - (studyRemaining / ((Number(hours) || 0) * 3600 + (Number(minutes) || 1) * 60)) * 100)}%`,
                                    transition: 'width 1s linear',
                                }} />
                            </div>
                            <p style={{ marginTop: 20, fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                                You can close this popup. The timer persists even if you navigate away.
                            </p>
                        </div>
                    )}

                    {/* ═══════ BEEP COUNTDOWN (5 min) ═══════ */}
                    {phase === PHASE.BEEP_COUNTDOWN && (
                        <div className="countdown-display">
                            <div style={{
                                fontSize: '1rem', fontWeight: 700,
                                color: beepRemaining <= 60 ? 'var(--danger)' : 'var(--warning)',
                                marginBottom: 8, animation: beepRemaining <= 10 ? 'fadeIn 0.5s ease infinite alternate' : 'none',
                            }}>
                                🔔 Study time is up! Quiz starting soon...
                            </div>
                            <div className="countdown-time" style={{
                                color: beepRemaining <= 10 ? 'var(--danger)' : undefined,
                                fontSize: beepRemaining <= 60 ? '4rem' : '3.5rem',
                            }}>
                                {fmt(beepRemaining)}
                            </div>
                            <div className="countdown-label" style={{ marginTop: 12 }}>
                                Get ready for the MCQ quiz!
                            </div>
                            {loading && <div className="spinner" style={{ marginTop: 16 }} />}
                        </div>
                    )}

                    {/* ═══════ QUIZ ═══════ */}
                    {phase === PHASE.QUIZ && currentMCQ && (
                        <div>
                            <div className="quiz-progress">
                                <div className="quiz-progress-bar"
                                    style={{ width: `${((currentQ + 1) / mcqs.length) * 100}%` }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                                    Question {currentQ + 1} of {mcqs.length}
                                </span>
                                <span style={{
                                    fontSize: '1.4rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                                    color: qTimer <= 5 ? 'var(--danger)' : qTimer <= 10 ? 'var(--warning)' : 'var(--text-primary)',
                                }}>
                                    ⏱ {qTimer}s
                                </span>
                            </div>
                            <div className="quiz-question">{currentMCQ.question}</div>
                            {(currentMCQ.options || []).map((opt, i) => {
                                let cls = 'quiz-option';
                                if (answered && feedback) {
                                    if (selected === i && feedback.isCorrect) cls += ' correct';
                                    else if (selected === i && feedback.isCorrect === false) cls += ' wrong';
                                } else if (selected === i) cls += ' selected';
                                return (
                                    <button key={i} className={cls} onClick={() => handleOptionClick(i)} disabled={answered}>
                                        <strong style={{ marginRight: 8 }}>{String.fromCharCode(65 + i)}.</strong> {opt}
                                    </button>
                                );
                            })}
                            {answered && feedback && (
                                <div style={{
                                    textAlign: 'center', marginTop: 12, fontSize: '0.85rem',
                                    color: feedback.isCorrect ? 'var(--success)' : feedback.isCorrect === false ? 'var(--danger)' : 'var(--text-tertiary)'
                                }}>
                                    {feedback.isCorrect === true && `✅ Correct! +${feedback.points} pts`}
                                    {feedback.isCorrect === false && `❌ Wrong. ${feedback.points} pts`}
                                    {feedback.isCorrect === null && `⏰ Time's up. ${feedback.points} pts`}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══════ RESULTS ═══════ */}
                    {phase === PHASE.RESULTS && (
                        <div>
                            <div className="result-card">
                                <div className={`result-score ${results?.passed ? 'pass' : 'fail'}`}>
                                    {results?.score ?? '?'}/{results?.maxScore ?? 12}
                                </div>
                                <div className="result-label" style={{ fontSize: '1rem', marginTop: 8 }}>
                                    {results?.passed ? '🎉 You Passed!' : '😞 Not enough this time.'}
                                </div>
                                <div style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                                    Pass threshold: {results?.threshold ?? 8} points
                                </div>
                                {results?.tokensAwarded != null && (
                                    <div style={{
                                        marginTop: 8, fontSize: '1.1rem', fontWeight: 700,
                                        color: results.tokensAwarded > 0 ? 'var(--success)' : 'var(--danger)'
                                    }}>
                                        {results.tokensAwarded > 0 ? '+' : ''}{results.tokensAwarded} 🪙
                                    </div>
                                )}
                            </div>
                            {results?.breakdown?.length > 0 && (
                                <div style={{ marginTop: 20 }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>
                                        Score Breakdown
                                    </h4>
                                    {results.breakdown.map((b, i) => (
                                        <div key={i} style={{
                                            display: 'flex', gap: 8, padding: '8px 0',
                                            borderBottom: '1px solid var(--border-light)', fontSize: '0.82rem'
                                        }}>
                                            <span style={{ fontWeight: 600, width: 24 }}>Q{i + 1}</span>
                                            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{b.question}</span>
                                            <span style={{
                                                fontWeight: 700, minWidth: 40, textAlign: 'right',
                                                color: b.points > 0 ? 'var(--success)' : b.points < 0 ? 'var(--danger)' : 'var(--text-tertiary)'
                                            }}>
                                                {b.points > 0 ? '+' : ''}{b.points}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
                                {results?.passed && (
                                    <button className="btn btn-primary" onClick={loadTheory} disabled={loading}>
                                        {loading ? 'Loading...' : '📝 View Theory Questions'}
                                    </button>
                                )}
                                <button className="btn btn-secondary" onClick={onDone}>Done</button>
                            </div>
                        </div>
                    )}

                    {/* ═══════ THEORY ═══════ */}
                    {phase === PHASE.THEORY && (
                        <div>
                            <h4 style={{ fontWeight: 700, marginBottom: 16 }}>📝 Theory Questions</h4>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>
                                Write handwritten answers and upload a scanned PDF.
                            </p>
                            <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {theoryQs.map((q, i) => (
                                    <li key={i} style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                                        {typeof q === 'string' ? q : q.question || q.text || JSON.stringify(q)}
                                    </li>
                                ))}
                            </ol>
                            <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 8 }}>📤 Upload handwritten PDF</label>
                                <input type="file" accept=".pdf" ref={fileRef} style={{ fontSize: '0.85rem' }} />
                                <button className="btn btn-primary btn-sm" onClick={uploadPDF} disabled={uploading} style={{ marginTop: 12 }}>
                                    {uploading ? 'Uploading...' : 'Submit Solutions'}
                                </button>
                            </div>
                            <button className="btn btn-ghost" onClick={onDone} style={{ width: '100%', marginTop: 16 }}>I'll submit later</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
