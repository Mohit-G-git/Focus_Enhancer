import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Signup() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await register(form);
            navigate('/profile');
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <form className="auth-form" onSubmit={handleSubmit}>
                <h2>Create account</h2>
                <p className="subtitle">Join Focus Enhancer and start your journey</p>

                {error && <div className="error-msg">{error}</div>}

                <div className="input-group">
                    <label>Full Name</label>
                    <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
                        placeholder="John Doe" required />
                </div>
                <div className="input-group">
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)}
                        placeholder="you@university.edu" required />
                </div>
                <div className="input-group">
                    <label>Password</label>
                    <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)}
                        placeholder="Min 6 characters" required minLength={6} />
                </div>
                <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Account'}
                </button>
                <p className="auth-link">
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </form>
        </div>
    );
}
