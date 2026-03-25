import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Synchronously detect and store impersonation token BEFORE any React render
// This runs once when the module loads, ensuring sessionStorage is set
// before any component or interceptor reads it.
function initImpersonationToken() {
  const params = new URLSearchParams(window.location.search);
  const impersonateToken = params.get('impersonate_token');

  if (impersonateToken) {
    sessionStorage.setItem('access_token', impersonateToken);
    sessionStorage.setItem('impersonating', 'true');
    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname);
  }
}
initImpersonationToken();

// Helper: get token from sessionStorage first (impersonation), then localStorage
function getAccessToken() {
  return sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(
    sessionStorage.getItem('impersonating') === 'true'
  );

  const checkAuth = useCallback(async () => {
    const token = getAccessToken();
    if (token) {
      try {
        const response = await authAPI.me();
        setUser(response.data);
        setLoading(false);
        return response.data;
      } catch (error) {
        // Clear the appropriate storage
        if (sessionStorage.getItem('impersonating') === 'true') {
          sessionStorage.clear();
          setImpersonating(false);
        } else {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
    }
    setLoading(false);
    return null;
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const response = await authAPI.login({ email, password });
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('refresh_token', response.data.refresh_token);
    const userData = await checkAuth();
    return userData;
  };

  const register = async (email, username, password) => {
    await authAPI.register({ email, username, password });
    await login(email, password);
  };

  const logout = () => {
    // Only clear localStorage if this is NOT an impersonation tab
    if (sessionStorage.getItem('impersonating') === 'true') {
      sessionStorage.clear();
    } else {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
    setUser(null);
    setImpersonating(false);
  };

  const exitImpersonation = () => {
    sessionStorage.clear();
    setImpersonating(false);
    // Close this tab — superadmin's original tab is untouched
    window.close();
    // Fallback if window.close() is blocked by browser
    window.location.href = '/superadmin/tenants';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, impersonating, exitImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
};
