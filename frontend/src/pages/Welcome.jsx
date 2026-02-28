import { useNavigate } from 'react-router-dom';

const steps = [
    { icon: '📝', title: 'Daily Tasks', desc: 'AI generates study tasks based on your syllabus and upcoming events.' },
    { icon: '🪙', title: 'Stake Tokens', desc: 'Put tokens on the line. Score well to earn. Miss the mark to lose.' },
    { icon: '🧠', title: 'MCQ Quizzes', desc: '6 questions per task. Pass the quiz to unlock theory questions.' },
    { icon: '✍️', title: 'Handwritten Answers', desc: 'Write theory answers by hand, scan, and upload as PDF.' },
    { icon: '👥', title: 'Peer Reviews', desc: 'Review classmates\' submissions. Earn reputation through upvotes.' },
    { icon: '🏆', title: 'Climb the Board', desc: 'Build streaks, earn reputation, and top the leaderboard.' },
];

export default function Welcome() {
    const navigate = useNavigate();

    return (
        <div className="welcome-page">
            <h2>🚀 Welcome to Focus Enhancer!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Here's how the platform works. Follow these steps to maximize your learning.
            </p>

            <div className="tour-cards">
                {steps.map((s, i) => (
                    <div className="card tour-card" key={i}>
                        <div className="tour-card-num">{i + 1}</div>
                        <div>
                            <h4>{s.icon} {s.title}</h4>
                            <p>{s.desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            <button className="btn btn-primary btn-lg" onClick={() => navigate('/home')}>
                Start Learning →
            </button>
        </div>
    );
}
