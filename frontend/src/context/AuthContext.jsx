import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) throw new Error('session expired');
      setUser(await res.json());
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    const onUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('rdm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('rdm:unauthorized', onUnauthorized);
  }, [loadUser]);

  const login = async (username, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
