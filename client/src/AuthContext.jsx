import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, setToken, clearToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  // api 层检测到 401（token 失效/被吊销）时同步重置登录态，避免"假登录"UI
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('ph:auth-expired', onExpired);
    return () => window.removeEventListener('ph:auth-expired', onExpired);
  }, []);

  const login = useCallback(async (username, password, from) => {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(d.token);
    setUser(d.user);
    navigate(from || '/');
  }, [navigate]);

  const register = useCallback(async (username, email, password, inviteCode, from) => {
    const d = await api('/auth/register', {
      method: 'POST',
      body: { username, email, password, inviteCode }
    });
    setToken(d.token);
    setUser(d.user);
    navigate(from || '/');
  }, [navigate]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    navigate('/');
  }, [navigate]);

  const updateUser = useCallback((u) => setUser(u), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
