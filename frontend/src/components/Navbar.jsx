import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, Trophy, User, AlertTriangle, LogOut, Menu, X, Coins, MessageSquare } from 'lucide-react';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const handleLogout = () => { logout(); navigate('/'); };

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
                    <button onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 w-full cursor-pointer">
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}
        </nav>
    );
}
