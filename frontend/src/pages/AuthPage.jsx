import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { login, register } = useAuth();
    const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        name: '', email: '', password: '',
        studentId: '', department: '', semester: '', year: '', university: '',
    });

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === 'login') {
                const user = await login(form.email, form.password);
                if (!user.enrolledCourses?.length) navigate('/register-courses');
                else navigate('/home');
            } else {
                // Strip empty optional fields & coerce types
                const payload = { name: form.name, email: form.email, password: form.password };
                if (form.studentId.trim()) payload.studentId = form.studentId.trim();
                if (form.department.trim()) payload.department = form.department.trim();
                if (form.semester) payload.semester = Number(form.semester);
                if (form.year) payload.year = Number(form.year);
                if (form.university.trim()) payload.university = form.university.trim();
                await register(payload);
                navigate('/welcome');
            }
        } catch (err) {
            const data = err.response?.data;
            if (data?.errors?.length) {
                data.errors.forEach((e) => toast.error(`${e.field}: ${e.message}`));
            } else {
                toast.error(data?.message || 'Something went wrong');
            }
        } finally { setLoading(false); }
    };

    const inputCls = 'w-full input-dark rounded-xl px-4 py-2.5 text-sm';

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#050507' }}>
            <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-sky-500/[0.04] blur-[120px]" />
            <div className="fixed bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-pink-500/[0.04] blur-[120px]" />

            <div className="relative w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-sky-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg shadow-sky-500/20">
                        <Sparkles size={24} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
                    <p className="text-sm text-slate-500 mt-1">{mode === 'login' ? 'Sign in to continue your journey' : 'Start your focus journey today'}</p>
                </div>

                <div className="flex rounded-xl p-1 mb-6" style={{ background: '#111118' }}>
                    {['login', 'register'].map((m) => (
                        <button key={m} onClick={() => setMode(m)}
                            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                                mode === m ? 'bg-gradient-to-r from-sky-500/20 to-pink-500/20 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
                            }`} style={mode === m ? { border: '1px solid rgba(56,189,248,0.15)' } : {}}>
                            {m === 'login' ? 'Sign In' : 'Sign Up'}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="surface rounded-2xl p-6 space-y-4">
                    {mode === 'register' && (
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name *</label>
                            <input value={form.name} onChange={set('name')} required className={inputCls} placeholder="John Doe" />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Email *</label>
                        <input type="email" value={form.email} onChange={set('email')} required className={inputCls} placeholder="you@iitj.ac.in" />
                    </div>
                    <div className="relative">
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Password *</label>
                        <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} required
                            minLength={6} className={`${inputCls} pr-10`} placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPw(!showPw)}
                            className="absolute right-3 top-8 text-slate-500 hover:text-sky-400 cursor-pointer transition-colors">
                            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    {mode === 'register' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Student ID</label>
                                    <input value={form.studentId} onChange={set('studentId')} className={inputCls} placeholder="STU001" /></div>
                                <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Department</label>
                                    <input value={form.department} onChange={set('department')} className={inputCls} placeholder="CS" /></div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Semester</label>
                                    <input type="number" min={1} max={8} value={form.semester} onChange={set('semester')} className={inputCls} placeholder="4" /></div>
                                <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Year</label>
                                    <input type="number" value={form.year} onChange={set('year')} className={inputCls} placeholder="2026" /></div>
                                <div><label className="block text-xs font-medium text-slate-400 mb-1.5">University</label>
                                    <input value={form.university} onChange={set('university')} className={inputCls} placeholder="MIT" /></div>
                            </div>
                        </>
                    )}
                    <button type="submit" disabled={loading}
                        className="w-full py-3 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} /></>}
                    </button>
                </form>
            </div>
        </div>
    );
}
