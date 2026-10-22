import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken, clearApiCache, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);
const IDLE_MS = import.meta.env.PROD ? 30 * 60 * 1000 : 8 * 60 * 60 * 1000;
const REFRESH_MS = 15 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutRef = useRef(null);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // ignore
    }
    clearApiCache();
    setToken(null);
    setUser(null);
  }, []);

  logoutRef.current = logout;

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      try {
        const renewed = await api.post('/api/auth/refresh', {});
        if (renewed?.token) setToken(renewed.token);
        if (renewed?.user) {
          setUser(renewed.user);
          return renewed.user;
        }
      } catch {
        // fall through
      }
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearApiCache();
      setToken(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return undefined;
    let timer = setTimeout(() => logoutRef.current?.(), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logoutRef.current?.(), IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const extend = async () => {
      if (!getToken()) return;
      try {
        const data = await api.post('/api/auth/refresh', {});
        if (data?.token) setToken(data.token);
        if (data?.user) setUser(data.user);
      } catch {
        // ignore background refresh errors
      }
    };
    const id = setInterval(extend, REFRESH_MS);
    const onFocus = () => {
      extend();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  const login = async (userId, password) => {
    clearApiCache();
    const data = await api.post('/api/auth/login', { userId, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
