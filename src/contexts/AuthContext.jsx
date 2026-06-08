import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('auth_token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verifySession = async () => {
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                // Set token for API
                const response = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const userData = await response.json();
                    setUser(userData);
                } else {
                    // Invalid token
                    logout();
                }
            } catch (error) {
                console.error('Session verification failed:', error);
                logout();
            } finally {
                setLoading(false);
            }
        };

        verifySession();
    }, [token]);

    const login = async (username, pin_code) => {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin_code })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('auth_token', data.token);
                setToken(data.token);
                setUser(data.user);
                return { success: true };
            } else {
                return { success: false, error: data.error || 'Erreur de connexion' };
            }
        } catch (error) {
            return { success: false, error: 'Serveur injoignable' };
        }
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
    };

    const isAdmin = () => {
        return user?.role === 'admin';
    };

    // Auto-logout timer (Security Feature)
    useEffect(() => {
        if (!user) return;

        let inactivityTimer;
        
        const resetTimer = () => {
            clearTimeout(inactivityTimer);
            // 15 minutes of inactivity logs out automatically
            inactivityTimer = setTimeout(() => {
                logout();
                window.location.href = '/login';
            }, 15 * 60 * 1000); 
        };

        // Listen for activity
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keypress', resetTimer);
        window.addEventListener('click', resetTimer);
        window.addEventListener('scroll', resetTimer);

        resetTimer();

        return () => {
            clearTimeout(inactivityTimer);
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('keypress', resetTimer);
            window.removeEventListener('click', resetTimer);
            window.removeEventListener('scroll', resetTimer);
        };
    }, [user]);

    const value = {
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
