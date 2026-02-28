import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, Trophy, User, AlertTriangle, LogOut, Menu, X, Coins, MessageSquare, Shield, ChevronDown, Check, Loader2 } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Navbar() {
    const { user, logout, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    /* ── Become-CR state ──────────────────────────────────────── */
    const [crOpen, setCrOpen] = useState(false);
    const [crCourses, setCrCourses] = useState([]);   // enriched list ready for rendering
    const [crLoading, setCrLoading] = useState(false);
    const [claiming, setClaiming] = useState(null);
    const crRef = useRef(null);

    const handleLogout = () => { logout(); navigate('/'); };

    /* Close CR dropdown on outside click */
    useEffect(() => {
        const handler = (e) => {
            if (crRef.current && !crRef.current.contains(e.target)) setCrOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    /* Fetch all courses + build the enriched list (only when dropdown/mobile opens) */
    const loadCrCourses = useCallback(async () => {
        const enrolled = user?.enrolledCourses || [];
        if (!enrolled.length) { setCrCourses([]); return; }
        setCrLoading(true);
        try {
            const res = await api.get('/courses');
            const allCourses = res.data.data || [];
            const crForIds = new Set((user?.crForCourses || []).map((c) => String(c._id)));
            const list = enrolled.map((ec) => {
                const info = allCourses.find((c) => String(c._id) === String(ec._id));
                return {
                    _id: ec._id,
                    courseCode: ec.courseCode || info?.courseCode || 'N/A',
                    title: ec.title || info?.title || '',
                    hasCR: info ? !!info.hasCR : false,
                    isMeCR: crForIds.has(String(ec._id)),
                };
            });
            setCrCourses(list);
        } catch {
            toast.error('Could not load courses — is the server running?');
            setCrCourses([]);
        } finally { setCrLoading(false); }
    }, [user]);

    /* Re-fetch whenever the dropdown opens or mobile menu opens */
    useEffect(() => {
        if (crOpen || open) loadCrCourses();
    }, [crOpen, open, loadCrCourses]);

    /* Claim CR for a course */
    const handleClaimCR = async (courseId) => {
        setClaiming(courseId);
        try {
            const res = await api.put(`/courses/${courseId}/claim-cr`);
            toast.success(res.data.message);
            await refreshUser();
            // Refresh the dropdown list in-place so status updates immediately
            await loadCrCourses();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to claim CR');
        } finally { setClaiming(null); }
    };

    const enrolledCourses = user?.enrolledCourses || [];
    const showBecomeCR = enrolledCourses.length > 0;

    const tabs = [
        { to: '/home', label: 'Home', icon: Home },
        { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
        { to: '/messages', label: 'Messages', icon: MessageSquare },
        { to: '/profile', label: 'Profile', icon: User },
        { to: '/complaint', label: 'Report', icon: AlertTriangle },
    ];

    const linkCls = (isActive) =>
        `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
            isActive
                ? 'bg-sky-500/10 text-sky-400 shadow-sm shadow-sky-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
        }`;

    return (
        <nav className="glass-strong sticky top-0 z-50" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <button onClick={() => navigate('/home')} className="flex items-center gap-2.5 cursor-pointer group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-pink-500 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-shadow">
                            <span className="text-white font-black text-sm">FE</span>
                        </div>
                        <span className="text-lg font-bold text-white hidden sm:block">
                            Focus<span className="gradient-text">Enhancer</span>
                        </span>
                    </button>

                    {/* Desktop tabs */}
                    <div className="hidden md:flex items-center gap-1">
                        {tabs.map(({ to, label, icon: Icon }) => (
                            <NavLink key={to} to={to} className={({ isActive }) => linkCls(isActive)}>
                                <Icon size={16} />
                                {label}
                            </NavLink>
                        ))}
                    </div>

                    {/* Desktop right */}
                    <div className="hidden md:flex items-center gap-3">
                        {/* ── Become CR dropdown ────────────── */}
                        {showBecomeCR && (
                            <div className="relative" ref={crRef}>
                                <button onClick={() => setCrOpen((p) => !p)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all"
                                    style={{ background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.15)', color: '#f472b6' }}>
                                    <Shield size={14} />
                                    Become CR
                                    <ChevronDown size={12} className={`transition-transform ${crOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {crOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-72 rounded-xl overflow-hidden shadow-xl z-50 animate-fade-in"
                                        style={{ background: '#0d0d12', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Claim CR — First Come First Serve</p>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto py-1">
                                            {crLoading ? (
                                                <div className="flex items-center justify-center py-6 gap-2">
                                                    <Loader2 size={16} className="text-sky-400 animate-spin" />
                                                    <span className="text-xs text-slate-500">Loading courses…</span>
                                                </div>
                                            ) : crCourses.length === 0 ? (
                                                <p className="text-xs text-slate-500 px-3 py-4 text-center">No enrolled courses</p>
                                            ) : (
                                                crCourses.map((c) => {
                                                    const isLoading = claiming === String(c._id);
                                                    return (
                                                        <button key={c._id}
                                                            disabled={c.isMeCR || c.hasCR || isLoading}
                                                            onClick={() => !c.isMeCR && !c.hasCR && handleClaimCR(c._id)}
                                                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-all ${
                                                                (!c.isMeCR && !c.hasCR) ? 'hover:bg-white/[0.04] cursor-pointer' : 'opacity-60 cursor-not-allowed'
                                                            }`}>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-semibold text-white truncate">{c.courseCode}</p>
                                                                <p className="text-[10px] text-slate-500 truncate">{c.title}</p>
                                                            </div>
                                                            <div className="shrink-0 ml-2">
                                                                {isLoading && <Loader2 size={14} className="text-sky-400 animate-spin" />}
                                                                {!isLoading && c.isMeCR && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400"><Check size={12} /> You're CR</span>}
                                                                {!isLoading && !c.isMeCR && c.hasCR && <span className="text-[10px] font-medium text-slate-500">CR Taken</span>}
                                                                {!isLoading && !c.isMeCR && !c.hasCR && <span className="text-[10px] font-medium text-pink-400">Claim →</span>}
                                                            </div>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)' }}>
                            <Coins size={14} className="text-sky-400" />
                            <span className="text-sm font-bold text-sky-300">
                                {user?.tokenBalance ?? 0}
                            </span>
                        </div>
                        <div className="text-sm text-slate-300 font-medium">
                            {user?.name}
                            {user?.role === 'cr' && (
                                <span className="ml-1.5 px-1.5 py-0.5 bg-pink-500/20 text-pink-400 text-[10px] font-bold rounded-md">CR</span>
                            )}
                        </div>
                        <button onClick={handleLogout}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer">
                            <LogOut size={16} />
                        </button>
                    </div>

                    {/* Mobile menu button */}
                    <button className="md:hidden p-2 text-slate-400 cursor-pointer" onClick={() => setOpen(!open)}>
                        {open ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {open && (
                <div className="md:hidden px-4 pb-4 pt-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2 px-3 py-2 mb-2">
                        <Coins size={14} className="text-sky-400" />
                        <span className="text-sm font-bold text-sky-300">{user?.tokenBalance ?? 0} tokens</span>
                        <span className="ml-auto text-sm text-slate-400">{user?.name}</span>
                    </div>
                    {tabs.map(({ to, label, icon: Icon }) => (
                        <NavLink key={to} to={to} onClick={() => setOpen(false)}
                            className={({ isActive }) => linkCls(isActive)}>
                            <Icon size={16} />
                            {label}
                        </NavLink>
                    ))}

                    {/* Mobile Become CR */}
                    {showBecomeCR && (
                        <div className="px-3 py-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                                <Shield size={12} className="inline mr-1 text-pink-400" />Become CR — First Come First Serve
                            </p>
                            {crLoading ? (
                                <div className="flex items-center gap-2 py-3 justify-center">
                                    <Loader2 size={14} className="text-sky-400 animate-spin" />
                                    <span className="text-xs text-slate-500">Loading…</span>
                                </div>
                            ) : crCourses.length === 0 ? (
                                <p className="text-xs text-slate-500 py-2 text-center">No enrolled courses</p>
                            ) : (
                                crCourses.map((c) => {
                                    const isLoading = claiming === String(c._id);
                                    return (
                                        <button key={c._id}
                                            disabled={c.isMeCR || c.hasCR || isLoading}
                                            onClick={() => !c.isMeCR && !c.hasCR && handleClaimCR(c._id)}
                                            className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-left transition-all ${
                                                (!c.isMeCR && !c.hasCR) ? 'hover:bg-white/[0.04] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                                            }`}>
                                            <span className="text-xs text-white font-medium truncate">{c.courseCode} — {c.title}</span>
                                            <span className="shrink-0 ml-2 text-[10px]">
                                                {isLoading && <Loader2 size={12} className="text-sky-400 animate-spin" />}
                                                {!isLoading && c.isMeCR && <span className="text-emerald-400 font-bold">✓ CR</span>}
                                                {!isLoading && !c.isMeCR && c.hasCR && <span className="text-slate-500">Taken</span>}
                                                {!isLoading && !c.isMeCR && !c.hasCR && <span className="text-pink-400 font-medium">Claim</span>}
                                            </span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}

                    <button onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 w-full cursor-pointer">
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}
        </nav>
    );
}
