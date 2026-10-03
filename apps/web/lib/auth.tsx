'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@gstflow/types';
import { api, tokenStore } from './api';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, firmSlug?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.getAccess()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.auth.me();
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, firmSlug?: string) => {
    const res = await api.auth.login({ email, password, firmSlug });
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    const refresh = tokenStore.getRefresh();
    if (refresh) void api.auth.logout(refresh).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
    if (typeof window !== 'undefined') {
      const segment = window.location.pathname.split('/').filter(Boolean)[0];
      const reserved = new Set(['login', 'api', 'admin', '_next']);
      window.location.href = segment && !reserved.has(segment) ? `/${segment}/login` : '/login';
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
