import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Client, OtpVerifyResponse } from '@gstflow/types';
import { api, setUnauthorizedHandler } from './api';
import { setSessionChecker, syncNow } from './smsSync';
import { getOrCreateAndroidId } from './device';
import { EmailAccounts } from '@/native/EmailAccounts';
import { SmsReader } from '@/native/SmsReader';
import {
  clearEmailConsent,
  clearReadingEnabled,
  clearStoredConsent,
  clearStoredSession,
  getEmailConsent,
  getReadingEnabled,
  getStoredSession,
  setEmailConsent as persistEmailConsent,
  setStoredConsent,
  setStoredSession,
  type StoredSession,
} from './storage';

export interface AuthContextValue {
  session: StoredSession | null;
  client: Client | null;
  loading: boolean;
  /** Email-reading consent. Off by default; mirrors to the native poller. */
  emailConsent: boolean;
  setEmailConsent: (enabled: boolean) => Promise<void>;
  signIn: (result: OtpVerifyResponse) => Promise<void>;
  signOut: () => Promise<void>;
  revokeConsent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailConsent, setEmailConsentState] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [stored, email] = await Promise.all([getStoredSession(), getEmailConsent()]);
      if (!active) return;
      setSession(stored);
      setEmailConsentState(email);
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
          await SmsReader.setSyncCredentials(session.accessToken, session.refreshToken, deviceId);
        } else {
          await SmsReader.setSyncCredentials(null);
        }
      } catch {
        void 0;
      }
    })();
  }, [session, loading]);

  // Mirror email-reading consent into native sync prefs so EmailPoller and the
  // retry job gate on it even when no JS is running.
  useEffect(() => {
    if (loading) return;
    void (async () => {
      try {
        await EmailAccounts.setConsent(emailConsent);
      } catch {
        void 0;
      }
    })();
  }, [emailConsent, loading]);

  const setEmailConsent = useCallback(async (enabled: boolean) => {
    await persistEmailConsent(enabled);
    try {
      await EmailAccounts.setConsent(enabled);
    } catch {
      void 0;
    }
    setEmailConsentState(enabled);
  }, []);

  const signIn = useCallback(async (result: OtpVerifyResponse) => {
    const next: StoredSession = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      client: result.client ?? null,
    };
    await setStoredSession(next);
    api.setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
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
    api.clearTokens();
    await clearStoredSession();
    await clearStoredConsent();
    await clearReadingEnabled();
    await clearEmailConsent();
    try {
      await SmsReader.setConsent(false);
      await SmsReader.stopListening();
      await EmailAccounts.setConsent(false);
    } catch {
      void 0;
    }
    setEmailConsentState(false);
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
      emailConsent,
      setEmailConsent,
      signIn,
      signOut,
      revokeConsent,
    }),
    [session, loading, emailConsent, setEmailConsent, signIn, signOut, revokeConsent],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
