import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isFirstVisit, setIsFirstVisit] = useState(false);

    // On mount, try to restore session from localStorage
    useEffect(() => {
        const token = localStorage.getItem('fe_token');
        if (token) {
            authAPI.getMe()
                .then((res) => {
                    setUser(res.data.data || res.data.user || res.data);
                })
                .catch(() => {
                    localStorage.removeItem('fe_token');
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await authAPI.login({ email, password });
        const data = res.data.data || res.data;
        if (!data.token) throw new Error('No token received');
        localStorage.setItem('fe_token', data.token);

        // Fetch full profile with populated enrolledCourses
        try {
            const me = await authAPI.getMe();
            const fullUser = me.data.data || me.data.user || me.data;
            setUser(fullUser);
            return { ...data, user: fullUser };
        } catch {
            // Fallback: use login response user
            setUser(data.user || data);
            return data;
        }
    }, []);

    const register = useCallback(async (userData) => {
        const res = await authAPI.register(userData);
        const data = res.data.data || res.data;
        if (!data.token) throw new Error('No token received');
        localStorage.setItem('fe_token', data.token);

        // fetch full profile
        try {
            const me = await authAPI.getMe();
            setUser(me.data.data || me.data.user || me.data);
        } catch {
            setUser(data.user || data);
        }

        setIsFirstVisit(true);
        localStorage.setItem('fe_first_visit', 'true');
        return data;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('fe_token');
        localStorage.removeItem('fe_first_visit');
        setUser(null);
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const res = await authAPI.getMe();
            const u = res.data.data || res.data.user || res.data;
            setUser(u);
            return u;
        } catch {
            return null;
        }
    }, []);

    const updateProfile = useCallback(async (data) => {
        const res = await authAPI.updateProfile(data);
        // After update, re-fetch to get populated enrolledCourses
        try {
            const me = await authAPI.getMe();
            const fullUser = me.data.data || me.data.user || me.data;
            setUser(fullUser);
            return fullUser;
        } catch {
            const updated = res.data.data || res.data.user || res.data;
            setUser(updated);
            return updated;
        }
    }, []);

    const clearFirstVisit = useCallback(() => {
        setIsFirstVisit(false);
        localStorage.removeItem('fe_first_visit');
    }, []);

    return (
        <AuthContext.Provider value={{
            user, loading, login, register, logout, refreshUser, updateProfile,
            isFirstVisit, clearFirstVisit, isAuthenticated: !!user,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
