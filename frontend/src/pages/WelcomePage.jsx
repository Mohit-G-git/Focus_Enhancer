import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Coins, Brain, Trophy } from 'lucide-react';

export default function WelcomePage() {
    const navigate = useNavigate();
    const highlights = [
        { icon: Brain, title: 'AI Study Plans', desc: 'Personalized tasks from your textbooks', color: 'from-sky-500 to-cyan-400' },
        { icon: Coins, title: 'Token Stakes', desc: 'Risk tokens to stay committed', color: 'from-pink-500 to-rose-400' },
        { icon: Trophy, title: 'Compete & Review', desc: 'Leaderboards and peer reviews', color: 'from-violet-500 to-purple-400' },
    ];

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#050507' }}>
            <div className="fixed top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-sky-500/[0.05] blur-[120px]" />
            <div className="fixed bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-pink-500/[0.05] blur-[120px]" />
            <div className="relative text-center max-w-lg animate-slide-up">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-sky-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg shadow-sky-500/20 animate-float">
                    <Sparkles size={32} className="text-white" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-3">Welcome to Focus Enhancer!</h1>
                <p className="text-slate-400 mb-4">You're about to transform how you study.</p>
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl mb-8 animate-pulse-blue"
                    style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
                    <Coins size={18} className="text-sky-400" />
                    <span className="text-sm font-bold text-sky-300">🎁 100 tokens gifted to start!</span>
                </div>
                <div className="grid gap-3 mb-8">
                    {highlights.map(({ icon: Icon, title, desc, color }) => (
                        <div key={title} className="surface rounded-xl p-4 flex items-center gap-4 text-left card-hover">
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                                <Icon size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">{title}</p>
                                <p className="text-xs text-slate-500">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <button onClick={() => navigate('/register-courses')}
                    className="px-8 py-3.5 rounded-xl btn-primary text-base flex items-center gap-2 mx-auto cursor-pointer">
                    Let's Pick Your Courses <ArrowRight size={18} />
                </button>
            </div>
        </div>
    );
}
