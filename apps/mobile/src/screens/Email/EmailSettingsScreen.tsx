import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EmailAccounts, type EmailAccountMetadata } from '@/native/EmailAccounts';
import { useAuth } from '@/lib/auth';
import { ProviderChips } from '@/components/ProviderChips';
import { presetFor, type EmailProviderId } from '@/lib/emailProviders';
import { colors, fontSize, radius, spacing } from '@/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  address?: string;
  password?: string;
  host?: string;
  port?: string;
}

function formatDateTime(value: number | null | undefined): string {
  if (value == null) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function isValidPort(raw: string): boolean {
  if (!/^\d+$/.test(raw.trim())) return false;
  const port = Number(raw);
  return port >= 1 && port <= 65535;
}

function oauthErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | undefined)?.code;
  switch (code) {
    case 'LINK_CANCELLED':
      return 'Sign-in was cancelled.';
    case 'IN_PROGRESS':
      return 'A sign-in is already in progress.';
    case 'NO_ACTIVITY':
      return 'Could not start sign-in. Please try again.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'Could not link the account.';
  }
}

export function EmailSettingsScreen(): React.ReactElement {
  const { emailConsent, setEmailConsent } = useAuth();

  const [accounts, setAccounts] = useState<EmailAccountMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('993');
  const [errors, setErrors] = useState<FormErrors>({});
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<EmailProviderId>('other');
  const [linking, setLinking] = useState<EmailProviderId | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await EmailAccounts.list();
      setAccounts(rows);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load email accounts.');
    }
  }, []);

  const selectedPreset = presetFor(provider);
  const isOauth = selectedPreset.action === 'oauth';

  const applyPreset = useCallback((id: EmailProviderId) => {
    const preset = presetFor(id);
    setHost(preset.host ?? '');
    setPort(preset.port ? String(preset.port) : '993');
  }, []);

  const onSelectProvider = useCallback(
    (id: EmailProviderId) => {
      setProvider(id);
      setErrors({});
      setNotice(null);
      setPassword('');
      applyPreset(id);
    },
    [applyPreset],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          await load();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onToggleConsent = useCallback(
    async (enabled: boolean) => {
      setConsentBusy(true);
      setNotice(null);
      try {
        // `setEmailConsent` only updates JS state after the native call
        // succeeds, so the switch never flips optimistically on failure.
        await setEmailConsent(enabled);
        setNotice(enabled ? 'Email reading is on.' : 'Email reading is off.');
      } catch {
        setNotice('Could not update email consent. Please try again.');
      } finally {
        setConsentBusy(false);
      }
    },
    [setEmailConsent],
  );

  const validate = useCallback((): FormErrors => {
    const next: FormErrors = {};
    if (!address.trim()) next.address = 'Email address is required.';
    else if (!EMAIL_PATTERN.test(address.trim())) next.address = 'Enter a valid email address.';
    if (!isOauth) {
      if (!password) next.password = 'Password is required.';
      if (!host.trim()) next.host = 'IMAP host is required.';
      if (!isValidPort(port)) next.port = 'Port must be between 1 and 65535.';
    }
    return next;
  }, [address, host, isOauth, password, port]);

  const onAddAccount = useCallback(async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    setNotice(null);
    if (Object.keys(nextErrors).length > 0) return;

    if (!EmailAccounts.isAvailable) {
      setNotice('Email accounts are only available on Android.');
      return;
    }

    setAdding(true);
    try {
      const result = await EmailAccounts.addImapAccount(
        address.trim(),
        password,
        host.trim(),
        Number(port),
      );
      if (!result.ok) {
        setNotice('Could not add the account. Check the details and try again.');
        return;
      }
      setAddress('');
      setErrors({});
      applyPreset(provider);
      await load();
      setNotice('IMAP account added.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not add the account.');
    } finally {
      // Never retain the password in state after a submit attempt, even on
      // failure, while leaving the other fields so the user can retry.
      setPassword('');
      setAdding(false);
    }
  }, [address, applyPreset, host, load, password, port, provider, validate]);

  const onLinkOauth = useCallback(async () => {
    if (!EmailAccounts.isAvailable) {
      setNotice('Email accounts are only available on Android.');
      return;
    }
    const id = provider;
    setLinking(id);
    setNotice(null);
    try {
      const result = id === 'gmail' ? await EmailAccounts.linkGmail() : await EmailAccounts.linkGraph();
      if (result.ok) {
        await load();
        setNotice(id === 'gmail' ? 'Gmail account linked.' : 'Outlook account linked.');
      } else {
        setNotice('Could not link the account. Please try again.');
      }
    } catch (error) {
      setNotice(oauthErrorMessage(error));
    } finally {
      setLinking(null);
    }
  }, [load, provider]);

  const runSetEnabled = useCallback(
    async (account: EmailAccountMetadata, enabled: boolean) => {
      setBusyId(account.id);
      setNotice(null);
      try {
        const result = await EmailAccounts.setEnabled(account.id, enabled);
        if (!result.ok) {
          setNotice('Could not update the account. Please try again.');
          return;
        }
        await load();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not update the account.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const runRemove = useCallback(
    async (account: EmailAccountMetadata) => {
      setBusyId(account.id);
      setNotice(null);
      try {
        const result = await EmailAccounts.remove(account.id);
        if (!result.ok) {
          setNotice('Could not remove the account. Please try again.');
          return;
        }
        await load();
        setNotice('Account removed.');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not remove the account.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const confirmRemove = useCallback(
    (account: EmailAccountMetadata) => {
      Alert.alert(
        'Remove account',
        `Stop reading email from ${account.address}? This deletes the stored credentials from this device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void runRemove(account);
            },
          },
        ],
      );
    },
    [runRemove],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!EmailAccounts.isAvailable ? (
          <Text style={styles.notice}>Email accounts are only available on Android devices.</Text>
        ) : null}

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.cardTitle}>Email reading</Text>
              <Text style={styles.helper}>
                When on, GSTFlow reads only OTP-related emails from the accounts you link below. It
                never sends your email or password to the server.
              </Text>
            </View>
            <Switch
              value={emailConsent}
              disabled={consentBusy}
              onValueChange={(value) => {
                void onToggleConsent(value);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add email account</Text>
          <Text style={styles.helper}>
            Pick your provider, or choose Other to enter IMAP details manually. Credentials stay
            encrypted on this device.
          </Text>

          <ProviderChips
            selected={provider}
            onSelect={onSelectProvider}
            disabled={adding || linking != null}
          />

          <Text style={styles.helper}>{selectedPreset.helper}</Text>

          {isOauth ? (
            <Pressable
              accessibilityRole="button"
              disabled={linking != null}
              onPress={() => {
                void onLinkOauth();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                linking != null && styles.buttonDisabled,
              ]}
            >
              {linking != null ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {provider === 'gmail' ? 'Sign in with Google' : 'Sign in with Microsoft'}
                </Text>
              )}
            </Pressable>
          ) : (
            <>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!adding}
                style={[styles.input, errors.address ? styles.inputError : undefined]}
              />
              {errors.address ? <Text style={styles.fieldError}>{errors.address}</Text> : null}

              <Text style={styles.label}>{selectedPreset.passwordLabel ?? 'Password'}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={selectedPreset.passwordLabel ?? 'Password'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                editable={!adding}
                style={[styles.input, errors.password ? styles.inputError : undefined]}
              />
              {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}

              <Text style={styles.label}>IMAP host</Text>
              <TextInput
                value={host}
                onChangeText={setHost}
                placeholder="imap.example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!adding}
                style={[styles.input, errors.host ? styles.inputError : undefined]}
              />
              {errors.host ? <Text style={styles.fieldError}>{errors.host}</Text> : null}

              <Text style={styles.label}>Port</Text>
              <TextInput
                value={port}
                onChangeText={setPort}
                placeholder="993"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={5}
                editable={!adding}
                style={[styles.input, errors.port ? styles.inputError : undefined]}
              />
              {errors.port ? <Text style={styles.fieldError}>{errors.port}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={adding}
                onPress={() => {
                  void onAddAccount();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                  adding && styles.buttonDisabled,
                ]}
              >
                {adding ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.primaryButtonText}>Add account</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Linked accounts</Text>

        {loadError ? <Text style={styles.notice}>{loadError}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {accounts.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>No email accounts linked</Text>
            <Text style={styles.emptyBody}>
              Add an IMAP account above to let GSTFlow pick up OTP emails from it.
            </Text>
          </View>
        ) : (
          accounts.map((account) => {
            const busy = busyId === account.id;
            return (
              <View key={account.id} style={styles.card}>
                <View style={styles.accountHeader}>
                  <Text style={styles.provider}>{account.provider}</Text>
                  <Text
                    style={[styles.state, account.enabled ? styles.stateOn : styles.stateOff]}
                  >
                    {account.enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
                <Text style={styles.address}>{account.address}</Text>
                {account.imapHost ? (
                  <Text style={styles.meta}>
                    {account.imapHost}
                    {account.imapPort ? `:${account.imapPort}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  Last polled: {formatDateTime(account.lastPolledAt)}
                </Text>
                {account.lastError ? (
                  <Text style={styles.accountError}>Last error: {account.lastError}</Text>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      void runSetEnabled(account, !account.enabled);
                    }}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.secondaryButtonText}>
                        {account.enabled ? 'Disable' : 'Enable'}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => confirmRemove(account)}
                    style={({ pressed }) => [
                      styles.dangerButton,
                      pressed && styles.dangerButtonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.dangerButtonText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  helper: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: colors.textMuted,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  label: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  primaryButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: colors.background,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  dangerButton: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dangerButtonPressed: {
    opacity: 0.85,
  },
  dangerButtonText: {
    color: colors.surface,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  notice: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  provider: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  state: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  stateOn: {
    color: colors.success,
  },
  stateOff: {
    color: colors.textMuted,
  },
  address: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  accountError: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  emptyBody: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMuted,
  },
});

export default EmailSettingsScreen;
