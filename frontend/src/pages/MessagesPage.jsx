import { useState, useEffect, useRef } from 'react';
import { Search, Send, UserPlus, Check, X, Clock, MessageSquare, ArrowLeft, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function MessagesPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [view, setView] = useState('list'); // list | chat | search | requests
    const [conversations, setConversations] = useState([]);
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [activeConvo, setActiveConvo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const endRef = useRef(null);
    const pollRef = useRef(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    // Load conversations
    const loadConversations = async () => {
        try {
            const res = await api.get('/direct-chat');
            setConversations(res.data.conversations || []);
        } catch { /* silent */ }
    };

    const loadRequests = async () => {
        try {
            const [inc, out] = await Promise.all([
                api.get('/direct-chat/requests/incoming'),
                api.get('/direct-chat/requests/outgoing'),
            ]);
            setIncoming(inc.data.requests || []);
            setOutgoing(out.data.requests || []);
        } catch { /* silent */ }
    };

    useEffect(() => { loadConversations(); loadRequests(); }, []);

    // Open a conversation
    const openConvo = async (convo) => {
        setActiveConvo(convo);
        setView('chat');
        try {
            const res = await api.get(`/direct-chat/${convo._id}`);
            setMessages(res.data.conversation?.messages || []);
        } catch { setMessages([]); }

        // Poll for new messages every 4s
        clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await api.get(`/direct-chat/${convo._id}`);
                setMessages(res.data.conversation?.messages || []);
            } catch { /* silent */ }
        }, 4000);
    };

    useEffect(() => () => clearInterval(pollRef.current), []);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || !activeConvo || loading) return;
        setInput('');
        setLoading(true);
        try {
            const res = await api.post(`/direct-chat/${activeConvo._id}/message`, { content: text });
            setMessages((prev) => [...prev, res.data.message]);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send');
        } finally {
            setLoading(false);
        }
    };

    // Search users
    const searchUsers = async () => {
        if (searchQuery.trim().length < 2) return;
        try {
            const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
            setSearchResults(res.data.users || []);
        } catch { /* silent */ }
    };

    const sendRequest = async (targetUserId) => {
        try {
            await api.post('/direct-chat/request', { targetUserId });
            toast.success('Chat request sent!');
            loadRequests();
            setView('requests');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send request');
        }
    };

    const acceptReq = async (id) => {
        try {
            await api.put(`/direct-chat/${id}/accept`);
            toast.success('Request accepted!');
            loadConversations(); loadRequests();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    };

    const rejectReq = async (id) => {
        try {
            await api.put(`/direct-chat/${id}/reject`);
            toast.success('Request rejected');
            loadRequests();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    };

    const endConvo = async () => {
        if (!activeConvo) return;
        try {
            await api.put(`/direct-chat/${activeConvo._id}/end`);
            toast.success('Conversation ended');
            clearInterval(pollRef.current);
            setView('list');
            loadConversations();
        } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
    };

    const getPeer = (convo) => convo.participants?.find((p) => p._id !== user?._id) || {};
    const requestCount = incoming.length;

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <MessageSquare size={26} className="text-sky-400" />
                    <span className="gradient-text">Messages</span>
                </h1>
                <div className="flex gap-2">
                    <button onClick={() => setView('search')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl btn-primary text-sm cursor-pointer">
                        <UserPlus size={16} /> New Chat
                    </button>
                    <button onClick={() => { loadRequests(); setView('requests'); }}
                        className="relative flex items-center gap-2 px-4 py-2 rounded-xl surface text-sm text-slate-300 hover:text-white cursor-pointer transition-colors">
                        <Clock size={16} /> Requests
                        {requestCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-pink-500 text-[10px] font-bold text-white flex items-center justify-center">
                                {requestCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="surface rounded-2xl overflow-hidden" style={{ minHeight: '65vh' }}>
                {/* SEARCH VIEW */}
                {view === 'search' && (
                    <div className="p-6">
                        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 mb-4 cursor-pointer">
                            <ArrowLeft size={16} /> Back to conversations
                        </button>
                        <div className="flex gap-2 mb-6">
                            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                                placeholder="Search users by name or email..."
                                className="flex-1 input-dark rounded-xl px-4 py-2.5 text-sm" />
                            <button onClick={searchUsers}
                                className="px-4 py-2.5 rounded-xl btn-primary cursor-pointer">
                                <Search size={18} />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {searchResults.map((u) => (
                                <div key={u._id} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/[0.03] transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-pink-500/20 flex items-center justify-center text-sm font-bold text-sky-400">
                                            {u.name?.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{u.name}</p>
                                            <p className="text-xs text-slate-500">{u.department || u.email}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => sendRequest(u._id)}
                                        className="px-4 py-1.5 rounded-lg btn-pink text-xs cursor-pointer">
                                        <UserPlus size={14} className="inline mr-1" /> Request
                                    </button>
                                </div>
                            ))}
                            {searchResults.length === 0 && searchQuery.length >= 2 && (
                                <p className="text-center text-sm text-slate-500 py-8">No users found</p>
                            )}
                        </div>
                    </div>
                )}

                {/* REQUESTS VIEW */}
                {view === 'requests' && (
                    <div className="p-6">
                        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 mb-4 cursor-pointer">
                            <ArrowLeft size={16} /> Back
                        </button>
                        <h3 className="text-sm font-semibold text-pink-400 uppercase tracking-wider mb-3">Incoming Requests</h3>
                        {incoming.length === 0 ? (
                            <p className="text-sm text-slate-500 mb-6">No pending requests</p>
                        ) : (
                            <div className="space-y-2 mb-6">
                                {incoming.map((r) => (
                                    <div key={r._id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02]">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-sky-500/20 flex items-center justify-center text-sm font-bold text-pink-400">
                                                {r.initiator?.name?.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{r.initiator?.name}</p>
                                                <p className="text-xs text-slate-500">{r.initiator?.department || r.initiator?.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => acceptReq(r._id)}
                                                className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer transition-colors">
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => rejectReq(r._id)}
                                                className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer transition-colors">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <h3 className="text-sm font-semibold text-sky-400 uppercase tracking-wider mb-3">Sent Requests</h3>
                        {outgoing.length === 0 ? (
                            <p className="text-sm text-slate-500">No outgoing requests</p>
                        ) : (
                            <div className="space-y-2">
                                {outgoing.map((r) => {
                                    const peer = r.participants?.find((p) => p._id !== user?._id) || {};
                                    return (
                                        <div key={r._id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02]">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sm font-bold text-sky-400">
                                                    {peer.name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-white">{peer.name || 'User'}</p>
                                                    <p className="text-xs text-yellow-400/70">Pending…</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* CONVERSATION LIST */}
                {view === 'list' && (
                    <div className="divide-y divide-white/[0.04]">
                        {conversations.length === 0 ? (
                            <div className="text-center py-20">
                                <MessageSquare size={40} className="mx-auto text-slate-600 mb-3" />
                                <p className="text-sm text-slate-400">No conversations yet</p>
                                <p className="text-xs text-slate-500 mt-1">Search for users to start chatting</p>
                            </div>
                        ) : conversations.map((c) => {
                            const peer = getPeer(c);
                            const isActive = c.status === 'active';
                            return (
                                <button key={c._id} onClick={() => isActive ? openConvo(c) : null}
                                    className={`w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors ${isActive ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-pink-500/20 flex items-center justify-center text-sm font-bold text-sky-400">
                                            {peer.name?.charAt(0) || '?'}
                                        </div>
                                        {isActive && <Circle size={10} fill="#22c55e" className="text-emerald-500 absolute -bottom-0.5 -right-0.5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white truncate">{peer.name || 'User'}</p>
                                        <p className="text-xs text-slate-500 truncate">{peer.department || peer.email || ''}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                        c.status === 'active' ? 'bg-emerald-500/20 text-emerald-400'
                                            : c.status === 'requested' ? 'bg-yellow-500/20 text-yellow-400'
                                                : 'bg-slate-500/20 text-slate-400'
                                    }`}>
                                        {c.status}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* CHAT VIEW */}
                {view === 'chat' && activeConvo && (
                    <div className="flex flex-col h-[65vh]">
                        {/* Chat header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                            <div className="flex items-center gap-3">
                                <button onClick={() => { clearInterval(pollRef.current); setView('list'); }}
                                    className="p-1.5 hover:bg-white/10 rounded-lg cursor-pointer">
                                    <ArrowLeft size={18} className="text-sky-400" />
                                </button>
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500/20 to-pink-500/20 flex items-center justify-center text-sm font-bold text-sky-400">
                                    {getPeer(activeConvo).name?.charAt(0) || '?'}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">{getPeer(activeConvo).name}</p>
                                    <p className="text-[10px] text-emerald-400">Active</p>
                                </div>
                            </div>
                            <button onClick={endConvo}
                                className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors">
                                End Chat
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.map((m, i) => {
                                const isMe = m.sender?.toString() === user?._id || m.sender === user?._id;
                                return (
                                    <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                        <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                            isMe
                                                ? 'bg-gradient-to-br from-sky-600 to-sky-500 text-white rounded-br-md'
                                                : 'bg-white/[0.06] text-slate-200 rounded-bl-md border border-white/[0.06]'
                                        }`}>
                                            {m.content}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={endRef} />
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t border-white/[0.06]">
                            <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-1"
                                style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                <input value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 py-2 outline-none" />
                                <button onClick={sendMessage} disabled={!input.trim() || loading}
                                    className="p-2 rounded-lg bg-gradient-to-r from-sky-500 to-pink-500 text-white disabled:opacity-30 hover:shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer">
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
