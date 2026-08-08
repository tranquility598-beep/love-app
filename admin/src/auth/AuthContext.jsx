import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, storeCsrf } from '../api/client.js';
import { AuthContext } from './useAuth.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshPromiseRef = useRef(null);

  const refreshSession = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const request = (async () => {
      try {
        const [{ data: me }, { data: csrf }] = await Promise.all([
          api.get('/auth/me'),
          api.get('/auth/csrf')
        ]);
        storeCsrf(csrf.csrfToken);
        setUser(me.user);
        return me.user;
      } catch {
        storeCsrf(null);
        setUser(null);
        return null;
      } finally {
        setLoading(false);
      }
    })();
    refreshPromiseRef.current = request;
    try {
      return await request;
    } finally {
      if (refreshPromiseRef.current === request) refreshPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      response => response,
      error => {
        if (error?.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
          storeCsrf(null);
          setUser(null);
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  const completeLogin = useCallback(data => {
    storeCsrf(data.csrfToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      storeCsrf(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, completeLogin, logout, refreshSession }), [user, loading, completeLogin, logout, refreshSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
