import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Trash2, Plus, ChevronLeft, Bot, Sparkles } from 'lucide-react';
import api from '../api/axios';

export default function ChatBot() {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState('chat'); // chat | history
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [title, setTitle] = useState('New Chat');
    const endRef = useRef(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const loadHistory = async () => {
        try {
            const res = await api.get('/chat/conversations');
            setConversations(res.data.data || []);
        } catch { /* silent */ }
    };

    const loadConversation = async (id) => {
        try {
            const res = await api.get(`/chat/conversations/${id}`);
            const d = res.data.data;
            setMessages(d.messages.map((m) => ({ role: m.role, content: m.content })));
            setConversationId(d._id);
            setTitle(d.title || 'Chat');
            setView('chat');
        } catch { /* silent */ }
    };

    const startNew = () => {
        setMessages([]);
        setConversationId(null);
        setTitle('New Chat');
        setView('chat');
    };

    const deleteConvo = async (id) => {
        try {
            await api.delete(`/chat/conversations/${id}`);
            setConversations((prev) => prev.filter((c) => c._id !== id));
            if (conversationId === id) startNew();
        } catch { /* silent */ }
    };

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setLoading(true);
        try {
            const res = await api.post('/chat/message', {
                message: text,
                conversationId,
            });
            const d = res.data.data;
            setMessages((prev) => [...prev, { role: 'assistant', content: d.response }]);
            if (d.conversationId) setConversationId(d.conversationId);
            if (d.title) setTitle(d.title);
        } catch {
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Try again!' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Floating button */}
            {!open && (
                <button onClick={() => setOpen(true)}
                    className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 hover:scale-105 transition-all cursor-pointer">
                    <MessageCircle size={24} />
                </button>
            )}

            {/* Chat panel */}
            {open && (
                <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[560px] flex flex-col rounded-2xl overflow-hidden glass-strong shadow-2xl shadow-black/50 animate-slide-up"
                    style={{ border: '1px solid rgba(56,189,248,0.15)' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
                        style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.1), rgba(244,114,182,0.1))' }}>
                        <div className="flex items-center gap-2">
                            {view === 'history' && (
                                <button onClick={() => setView('chat')} className="p-1 hover:bg-white/10 rounded-lg cursor-pointer">
                                    <ChevronLeft size={18} className="text-sky-400" />
                                </button>
                            )}
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-pink-500 flex items-center justify-center">
                                <Bot size={16} className="text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-white">Focus Buddy</p>
                                <p className="text-[10px] text-sky-400">{view === 'history' ? 'Chat History' : title}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => { loadHistory(); setView('history'); }}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-sky-400 cursor-pointer transition-colors"
                                title="History">
                                <Sparkles size={16} />
                            </button>
                            <button onClick={startNew}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-pink-400 cursor-pointer transition-colors"
                                title="New Chat">
                                <Plus size={16} />
                            </button>
                            <button onClick={() => setOpen(false)}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-red-400 cursor-pointer transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    {view === 'history' ? (
                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                            {conversations.length === 0 ? (
                                <p className="text-center text-sm text-slate-500 mt-8">No conversations yet</p>
                            ) : conversations.map((c) => (
                                <div key={c._id}
                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.04] transition-colors group cursor-pointer"
                                    onClick={() => loadConversation(c._id)}>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-200 truncate">{c.title || 'Untitled'}</p>
                                        <p className="text-[10px] text-slate-500">{c.messageCount || 0} messages · {c.category || 'general'}</p>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteConvo(c._id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 cursor-pointer transition-all">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.length === 0 && (
                                <div className="text-center mt-12 space-y-3">
                                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-sky-500/20 to-pink-500/20 flex items-center justify-center">
                                        <Bot size={28} className="text-sky-400" />
                                    </div>
                                    <p className="text-sm text-slate-400">Hey! I'm <strong className="text-sky-400">Focus Buddy</strong>.</p>
                                    <p className="text-xs text-slate-500">Ask me anything about your studies, tasks, or just chat!</p>
                                </div>
                            )}
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                        m.role === 'user'
                                            ? 'bg-gradient-to-br from-sky-600 to-sky-500 text-white rounded-br-md'
                                            : 'bg-white/[0.06] text-slate-200 rounded-bl-md border border-white/[0.06]'
                                    }`}>
                                        {m.content}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start animate-fade-in">
                                    <div className="bg-white/[0.06] border border-white/[0.06] px-4 py-3 rounded-2xl rounded-bl-md">
                                        <div className="flex gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={endRef} />
                        </div>
                    )}

                    {/* Input */}
                    {view === 'chat' && (
                        <div className="p-3 border-t border-white/[0.06]">
                            <div className="flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-1"
                                style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                <input value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                                    placeholder="Type a message..."
                                    className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 py-2 outline-none" />
                                <button onClick={send} disabled={!input.trim() || loading}
                                    className="p-2 rounded-lg bg-gradient-to-r from-sky-500 to-pink-500 text-white disabled:opacity-30 hover:shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer">
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
