import { useState, useEffect, useRef } from 'react';
import { chatAPI, courseAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function Chatbot() {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [courseId, setCourseId] = useState('');
    const [courses, setCourses] = useState([]);
    const [conversationId, setConversationId] = useState(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        if (user?.enrolledCourses?.length) {
            courseAPI.getAll().then((res) => {
                const all = res.data.data || res.data || [];
                const ids = user.enrolledCourses.map((c) => c._id || c);
                setCourses(all.filter((c) => ids.includes(c._id)));
            }).catch(() => { });
        }
    }, [user]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = async () => {
        if (!input.trim() || sending) return;
        const userMsg = input.trim();
        setInput('');
        setMessages((m) => [...m, { role: 'user', content: userMsg }]);
        setSending(true);

        try {
            const res = await chatAPI.send({
                message: userMsg,
                courseId: courseId || undefined,
                conversationId: conversationId || undefined,
                userId: user?._id,
            });
            const data = res.data.data || res.data;
            setConversationId(data.conversationId || conversationId);
            setMessages((m) => [...m, { role: 'ai', content: data.reply || data.message || data.response || '' }]);
        } catch (err) {
            setMessages((m) => [...m, { role: 'ai', content: '⚠️ ' + (err.response?.data?.message || 'Failed to get response') }]);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="chat-container">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <h3 style={{ fontWeight: 700, flex: 1 }}>💬 AI Study Assistant</h3>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
                    style={{
                        padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                        background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.82rem'
                    }}>
                    <option value="">General</option>
                    {courses.map((c) => <option key={c._id} value={c._id}>{c.courseCode} — {c.title}</option>)}
                </select>
            </div>

            <div className="chat-messages">
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', margin: 'auto', fontSize: '0.9rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🤖</div>
                        Ask me anything about your courses, study tips, or concepts!
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`chat-msg ${m.role}`}>
                        {m.content}
                    </div>
                ))}
                {sending && <div className="chat-msg ai" style={{ opacity: 0.6 }}>Thinking...</div>}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-bar">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                    placeholder="Ask a question..." disabled={sending} />
                <button className="btn btn-primary" onClick={send} disabled={sending || !input.trim()}>
                    Send
                </button>
            </div>
        </div>
    );
}
