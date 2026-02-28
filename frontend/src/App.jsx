import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ChatBot from './components/ChatBot';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import WelcomePage from './pages/WelcomePage';
import CourseRegistration from './pages/CourseRegistration';
import HomePage from './pages/HomePage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import CRComplaintPage from './pages/CRComplaintPage';
import MessagesPage from './pages/MessagesPage';
import NotFound from './pages/NotFound';

export default function App() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#050507' }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-pink-500 animate-pulse" />
                    <div className="w-40 h-1 rounded-full overflow-hidden bg-white/10">
                        <div className="h-full bg-gradient-to-r from-sky-500 to-pink-500 animate-shimmer"
                            style={{ backgroundSize: '200% 100%' }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen noise" style={{ background: '#050507', fontFamily: "'Inter', system-ui, sans-serif" }}>
            {user && <Navbar />}
            <Routes>
                <Route path="/" element={user ? <Navigate to="/home" replace /> : <LandingPage />} />
                <Route path="/auth" element={user ? <Navigate to="/home" replace /> : <AuthPage />} />
                <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
                <Route path="/register-courses" element={<ProtectedRoute><CourseRegistration /></ProtectedRoute>} />
                <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/profile/:userId" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                <Route path="/complaint" element={<ProtectedRoute><CRComplaintPage /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
            </Routes>
            {user && <ChatBot />}
        </div>
    );
}
