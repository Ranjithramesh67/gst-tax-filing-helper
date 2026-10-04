import { NativeModules, Platform } from 'react-native';

/**
 * Typed JS wrapper over the Android `EmailAccounts` native module, with a
 * non-Android no-op fallback so callers never guard on platform.
 *
 * Security: the IMAP password is sent to the native layer only. It is never
 * returned; `list()` yields non-secret metadata (no `secretRef`/OAuth tokens).
 */

export type EmailProviderName = 'IMAP' | 'GMAIL' | 'GRAPH';

export interface EmailAccountMetadata {
  id: string;
  provider: EmailProviderName;
  address: string;
  imapHost?: string | null;
  imapPort?: number | null;
  cursor?: string | null;
  enabled: boolean;
  lastPolledAt?: number | null;
  lastError?: string | null;
}

export interface EmailMutationResult {
  ok: boolean;
}

interface EmailAccountsNativeModule {
  addImapAccount(
    address: string,
    password: string,
    host: string,
    port: number,
  ): Promise<EmailMutationResult>;
  listAccounts(): Promise<EmailAccountMetadata[]>;
  removeAccount(id: string): Promise<EmailMutationResult>;
  setEnabled(id: string, enabled: boolean): Promise<EmailMutationResult>;
  setConsent(enabled: boolean): Promise<boolean>;
  linkGmail(): Promise<EmailMutationResult>;
  linkGraph(): Promise<EmailMutationResult>;
}

const nativeModule: EmailAccountsNativeModule | null =
  Platform.OS === 'android' && NativeModules.EmailAccounts
    ? (NativeModules.EmailAccounts as EmailAccountsNativeModule)
    : null;

const FAILED: EmailMutationResult = { ok: false };

export const EmailAccounts = {
  isAvailable: nativeModule != null,

  /**
   * Links an IMAP mailbox. The password is persisted by the native encrypted
   * store and never echoed back. Defaults to port 993 (imaps).
   */
  addImapAccount(
    address: string,
    password: string,
    host: string,
    port = 993,
  ): Promise<EmailMutationResult> {
    return nativeModule
      ? nativeModule.addImapAccount(address, password, host, port)
      : Promise.resolve(FAILED);
  },

  /** Lists linked accounts as non-secret metadata for the settings screen. */
  list(): Promise<EmailAccountMetadata[]> {
    return nativeModule ? nativeModule.listAccounts() : Promise.resolve([]);
  },

  remove(id: string): Promise<EmailMutationResult> {
    return nativeModule ? nativeModule.removeAccount(id) : Promise.resolve(FAILED);
  },

  setEnabled(id: string, enabled: boolean): Promise<EmailMutationResult> {
    return nativeModule ? nativeModule.setEnabled(id, enabled) : Promise.resolve(FAILED);
  },

  /**
   * Persists the email-reading consent flag natively so the poller/retry job
   * honour it with no JS running. Email capture stays off until this is `true`.
   */
  setConsent(enabled: boolean): Promise<boolean> {
    return nativeModule ? nativeModule.setConsent(enabled) : Promise.resolve(false);
  },

  /** Links a Gmail mailbox via Google Sign-In (gmail.readonly). */
  linkGmail(): Promise<EmailMutationResult> {
    return nativeModule ? nativeModule.linkGmail() : Promise.resolve(FAILED);
  },

  /** Task 16: Microsoft Graph OAuth link. Rejects as not implemented for now. */
  linkGraph(): Promise<EmailMutationResult> {
    return nativeModule ? nativeModule.linkGraph() : Promise.resolve(FAILED);
  },
};
