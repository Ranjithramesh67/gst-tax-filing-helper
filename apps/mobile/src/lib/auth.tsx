import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Client, OtpVerifyResponse } from '@gstflow/types';
import { api, setUnauthorizedHandler } from './api';
import { setSessionChecker } from './smsSync';
import {
  clearStoredConsent,
  clearStoredSession,
  getStoredSession,
  setStoredConsent,
  setStoredSession,
  type StoredSession,
} from './storage';

export interface AuthContextValue {
  session: StoredSession | null;
  client: Client | null;
  loading: boolean;
  signIn: (result: OtpVerifyResponse) => Promise<void>;
  signOut: () => Promise<void>;
  revokeConsent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await getStoredSession();
      if (!active) return;
      setSession(stored);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    setSessionChecker(async () => Boolean(await getStoredSession()));
    return () => setSessionChecker(null);
  }, []);

  const signIn = useCallback(async (result: OtpVerifyResponse) => {
    const next: StoredSession = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      client: result.client ?? null,
    };
    await setStoredSession(next);
    if (result.consent) {
      await setStoredConsent({
        version: result.consent.version,
        acceptedAt: result.consent.acceptedAt,
        accepted: true,
        otpVerified: result.consent.otpVerified,
      });
    }
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    const current = await getStoredSession();
    if (current?.refreshToken) {
      try {
        await api.auth.logout(current.refreshToken);
      } catch {
        void 0;
      }
    }
    await clearStoredSession();
    await clearStoredConsent();
    setSession(null);
  }, []);

  const revokeConsent = useCallback(async () => {
    await clearStoredConsent();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      client: session?.client ?? null,
      loading,
      signIn,
      signOut,
      revokeConsent,
    }),
    [session, loading, signIn, signOut, revokeConsent],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
