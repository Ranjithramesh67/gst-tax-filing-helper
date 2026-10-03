import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Client, OtpVerifyResponse } from '@gstflow/types';
import { api, setUnauthorizedHandler } from './api';
import { setSessionChecker, syncNow } from './smsSync';
import { getOrCreateAndroidId } from './device';
import { SmsReader } from '@/native/SmsReader';
import {
  clearReadingEnabled,
  clearStoredConsent,
  clearStoredSession,
  getReadingEnabled,
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

  // Mirror the session credentials into native storage so the Android SMS
  // uploader can forward captured messages while the app/JS is not running.
  useEffect(() => {
    if (loading) return;
    void (async () => {
      try {
        if (session) {
          const deviceId = await getOrCreateAndroidId();
          await SmsReader.setSyncCredentials(session.accessToken, deviceId);
        } else {
          await SmsReader.setSyncCredentials(null);
        }
      } catch {
        void 0;
      }
    })();
  }, [session, loading]);

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
      // Mirror consent to the native layer so the SMS receiver honours it even
      // before the user toggles background reading.
      try {
        const readingEnabled = await getReadingEnabled();
        await SmsReader.setConsent(readingEnabled);
        if (readingEnabled) {
          await SmsReader.startListening();
        }
      } catch {
        void 0;
      }
    }
    setSession(next);
    // Drain anything captured while signed out (or before auto-sync started).
    void syncNow();
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
    await clearReadingEnabled();
    try {
      await SmsReader.setConsent(false);
      await SmsReader.stopListening();
    } catch {
      void 0;
    }
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
