import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('fe_token'));
    const [loading, setLoading] = useState(true);

    // Fetch full profile on mount / token change
    useEffect(() => {
        if (token) {
            api.get('/auth/me')
                .then((res) => setUser(res.data.data))
                .catch(() => {
                    localStorage.removeItem('fe_token');
                    setToken(null);
                    setUser(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [token]);

    const login = async (email, password) => {
        const res = await api.post('/auth/login', { email, password });
        const { token: jwt, user: u } = res.data.data;
        localStorage.setItem('fe_token', jwt);
        setToken(jwt);
        // Immediately fetch full profile (with enrolledCourses populated)
        const me = await api.get('/auth/me', { headers: { Authorization: `Bearer ${jwt}` } });
        setUser(me.data.data);
        return me.data.data;
    };

    const register = async (data) => {
        const res = await api.post('/auth/register', data);
        const { token: jwt } = res.data.data;
        localStorage.setItem('fe_token', jwt);
        setToken(jwt);
        const me = await api.get('/auth/me', { headers: { Authorization: `Bearer ${jwt}` } });
        setUser(me.data.data);
        return me.data.data;
    };

    const logout = () => {
        localStorage.removeItem('fe_token');
        setToken(null);
        setUser(null);
    };

    const refreshUser = useCallback(async () => {
        const res = await api.get('/auth/me');
        setUser(res.data.data);
        return res.data.data;
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
