import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Brain, Trophy, Shield, Users, BookOpen, Sparkles } from 'lucide-react';
import api from '../api/axios';

export default function LandingPage() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ users: 0, tasks: 0, quizzes: 0 });

    useEffect(() => {
        api.get('/stats').then((r) => setStats(r.data.data)).catch(() => {});
    }, []);

    const features = [
        { icon: Brain, title: 'AI Study Plans', desc: 'Gemini-powered tasks tailored to your syllabus and pace', color: 'from-sky-500 to-cyan-400' },
        { icon: Zap, title: 'Token Economy', desc: 'Stake tokens on tasks — earn rewards or face consequences', color: 'from-pink-500 to-rose-400' },
        { icon: Trophy, title: 'Leaderboards', desc: 'Compete globally and per-course with reputation rankings', color: 'from-violet-500 to-purple-400' },
        { icon: Shield, title: 'Peer Review', desc: 'Upvote or challenge submissions with wager-based reviews', color: 'from-emerald-500 to-teal-400' },
        { icon: Users, title: 'Direct Chat', desc: 'Message peers, discuss tasks, and collaborate in real-time', color: 'from-amber-500 to-orange-400' },
        { icon: BookOpen, title: 'Smart Quizzes', desc: 'MCQ + theory flow with timed questions and AI grading', color: 'from-sky-400 to-indigo-500' },
    ];

    return (
        <div className="min-h-screen" style={{ background: '#050507' }}>
            {/* Hero */}
            <div className="hero-gradient relative overflow-hidden">
                <div className="absolute top-20 left-[10%] w-72 h-72 rounded-full bg-sky-500/5 blur-[100px]" />
                <div className="absolute bottom-20 right-[10%] w-80 h-80 rounded-full bg-pink-500/5 blur-[100px]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/[0.03]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/[0.03]" />

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-28">
                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 animate-fade-in"
                            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
                            <Sparkles size={14} className="text-sky-400" />
                            <span className="text-xs font-medium text-sky-400">AI-Powered Academic Platform</span>
                        </div>

                        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-6 animate-slide-up">
                            <span className="text-white">Study Smarter.</span><br />
                            <span className="gradient-text">Compete Harder.</span>
                        </h1>

                        <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '100ms' }}>
                            AI-generated tasks, token stakes, peer reviews, and competitive leaderboards —
                            all designed to make you unstoppable.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
                            <button onClick={() => navigate('/auth?mode=register')}
                                className="px-8 py-3.5 rounded-xl btn-primary text-base flex items-center gap-2 cursor-pointer animate-pulse-blue">
                                Get Started <ArrowRight size={18} />
                            </button>
                            <button onClick={() => navigate('/auth')}
                                className="px-8 py-3.5 rounded-xl text-base font-semibold text-slate-300 cursor-pointer hover:text-white transition-colors"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                Sign In
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-16 animate-fade-in" style={{ animationDelay: '400ms' }}>
                        {[
                            { label: 'Students', value: stats.users, icon: '👤' },
                            { label: 'Tasks', value: stats.tasks, icon: '📋' },
                            { label: 'Quizzes', value: stats.quizzes, icon: '🧠' },
                        ].map(({ label, value, icon }) => (
                            <div key={label} className="text-center p-4 rounded-2xl glass">
                                <p className="text-2xl mb-1">{icon}</p>
                                <p className="text-2xl font-black text-white">{value}</p>
                                <p className="text-xs text-slate-500 font-medium">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Features */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-white mb-3">Everything You Need to <span className="gradient-text">Excel</span></h2>
                    <p className="text-slate-400 max-w-lg mx-auto">Built for students who take their academics seriously.</p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map(({ icon: Icon, title, desc, color }, i) => (
                        <div key={title} className="group surface rounded-2xl p-6 card-hover animate-fade-in"
                            style={{ animationDelay: `${i * 80}ms` }}>
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                                <Icon size={22} className="text-white" />
                            </div>
                            <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* CTA */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
                <div className="relative rounded-3xl overflow-hidden p-12 text-center"
                    style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.1), rgba(244,114,182,0.1))', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="absolute top-0 left-1/4 w-60 h-60 rounded-full bg-sky-500/10 blur-[80px]" />
                    <div className="absolute bottom-0 right-1/4 w-60 h-60 rounded-full bg-pink-500/10 blur-[80px]" />
                    <div className="relative">
                        <h2 className="text-3xl font-bold text-white mb-4">Ready to Level Up?</h2>
                        <p className="text-slate-400 mb-8 max-w-md mx-auto">Join thousands of students already crushing their goals.</p>
                        <button onClick={() => navigate('/auth?mode=register')}
                            className="px-8 py-3.5 rounded-xl btn-pink text-base flex items-center gap-2 mx-auto cursor-pointer">
                            Create Free Account <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <footer className="border-t border-white/[0.04] py-8 text-center">
                <p className="text-xs text-slate-600">© 2026 Focus Enhancer. Built with 🧠 AI & ❤️</p>
            </footer>
        </div>
    );
}
