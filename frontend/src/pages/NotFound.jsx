import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ghost } from 'lucide-react';

export default function NotFound() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#050507' }}>
            <Ghost size={64} className="text-slate-700 mb-4 animate-float" />
            <h1 className="text-6xl font-black gradient-text mb-2">404</h1>
            <p className="text-slate-400 mb-8">This page doesn't exist in this dimension.</p>
            <button onClick={() => navigate('/')}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl btn-primary cursor-pointer">
                <ArrowLeft size={18} /> Go Home
            </button>
        </div>
    );
}
