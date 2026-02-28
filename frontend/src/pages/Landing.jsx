import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Landing() {
    const { isAuthenticated } = useAuth();

    return (
        <div className="landing-hero">
            <div className="landing-title">Focus Enhancer</div>
            <p className="landing-subtitle">
                Redesigning campus attention through gamified learning. Stake tokens, ace quizzes,
                earn reputation, and climb leaderboards — all powered by AI.
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
                {isAuthenticated ? (
                    <Link to="/home" className="btn btn-primary btn-lg">Go to Dashboard →</Link>
                ) : (
                    <>
                        <Link to="/signup" className="btn btn-primary btn-lg">Get Started →</Link>
                        <Link to="/login" className="btn btn-secondary btn-lg">Login</Link>
                    </>
                )}
            </div>

            <div className="landing-cards">
                <div className="card landing-card">
                    <div className="landing-card-icon">🎯</div>
                    <h4>AI-Generated Tasks</h4>
                    <p>Daily study tasks tailored to your syllabus with MCQs and theory questions.</p>
                </div>
                <div className="card landing-card">
                    <div className="landing-card-icon">🪙</div>
                    <h4>Token Staking</h4>
                    <p>Stake tokens on tasks. Pass the quiz to earn rewards. Fail and lose your stake.</p>
                </div>
                <div className="card landing-card">
                    <div className="landing-card-icon">🏆</div>
                    <h4>Leaderboard</h4>
                    <p>Compete with classmates. Build reputation through consistency and peer reviews.</p>
                </div>
            </div>
        </div>
    );
}
