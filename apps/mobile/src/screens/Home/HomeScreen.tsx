import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '@gstflow/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  getReadingEnabled,
  getStoredConsent,
  setReadingEnabled,
  type StoredConsent,
} from '@/lib/storage';
import { size as queueSize, subscribe as subscribeQueue } from '@/lib/smsQueue';
import { isAutoSyncActive, LAST_SYNC_STORAGE_KEY, subscribeSync, syncNow } from '@/lib/smsSync';
import { SmsReader } from '@/native/SmsReader';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors, fontSize, radius, spacing } from '@/theme';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>{value}</View>
    </View>
  );
}

export function HomeScreen(): React.ReactElement {
  const navigation = useNavigation<HomeNavigation>();
  const { client } = useAuth();

  const [me, setMe] = useState<AuthUser | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [consent, setConsent] = useState<StoredConsent | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [listening, setListening] = useState(true);
  const [queued, setQueued] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [storedConsent, permission, count, lastSync, readingEnabled] = await Promise.all([
      getStoredConsent(),
      SmsReader.hasSmsPermission(),
      queueSize(),
      AsyncStorage.getItem(LAST_SYNC_STORAGE_KEY),
      getReadingEnabled(),
    ]);
    setConsent(storedConsent);
    setHasPermission(permission);
    setQueued(count);
    setLastSyncAt(lastSync);
    setListening(readingEnabled);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const user = await api.auth.me();
        if (active) setMe(user);
      } catch (error) {
        if (active) setMeError(messageOf(error));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          await refresh();
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [refresh]),
  );

  // Reflect background activity: the app-lifetime auto-sync loop drains the
  // queue and stamps a last-sync time without any user interaction, so subscribe
  // to those events rather than only refreshing on focus/tap.
  useEffect(() => {
    const unsubscribeQueue = subscribeQueue((items) => {
      setQueued(items.length);
    });
    const unsubscribeSync = subscribeSync((event) => {
      setLastSyncAt(event.at);
    });
    return () => {
      unsubscribeQueue();
      unsubscribeSync();
    };
  }, []);

  const onGrantPermission = useCallback(async () => {
    setGranting(true);
    setNotice(null);
    try {
      const granted = await SmsReader.requestSmsPermission();
      setHasPermission(granted);
      setNotice(granted ? 'SMS permission granted.' : 'SMS permission was not granted.');
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setGranting(false);
    }
  }, []);

  const onToggleReading = useCallback(
    async (value: boolean) => {
      setToggling(true);
      setNotice(null);
      try {
        if (value) {
          let granted = hasPermission;
          if (!granted) {
            granted = await SmsReader.requestSmsPermission();
            setHasPermission(granted);
          }
          if (!granted) {
            setNotice('SMS permission is required before reading can start.');
            return;
          }
          await setReadingEnabled(true);
          await SmsReader.setConsent(true);
          await SmsReader.startListening();
          setListening(true);
          setNotice('Background reading is on.');
          void syncNow();
        } else {
          await setReadingEnabled(false);
          await SmsReader.setConsent(false);
          setListening(false);
          setNotice('Background reading is off.');
        }
      } catch (error) {
        setNotice(messageOf(error));
      } finally {
        setToggling(false);
        setQueued(await queueSize());
      }
    },
    [hasPermission],
  );

  const onSyncNow = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await syncNow();
      if (result.ok) {
        setNotice(result.sent > 0 ? `Synced ${result.sent} message(s).` : 'Everything is up to date.');
      } else if (result.skipped === 'no-consent') {
        setNotice('Consent is required before messages can be synced.');
      } else if (result.skipped === 'no-session') {
        setNotice('You need to be signed in to sync.');
      } else if (result.skipped === 'in-progress') {
        setNotice('A sync is already running.');
      } else {
        setNotice(result.error ?? 'Sync failed. It will retry automatically.');
      }
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setQueued(await queueSize());
      setSyncing(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayName = me?.name ?? client?.name ?? 'Client';
  const firmLabel = client?.firmId ?? me?.firmId ?? 'Not available';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Namaste, {displayName}</Text>
      <Text style={styles.subtitle}>
        GSTFlow forwards only GST-related SMS from this device to your CA firm.
      </Text>

      <Card title="Account">
        <InfoRow label="Name" value={<Text style={styles.infoValue}>{me?.name ?? client?.name ?? '—'}</Text>} />
        <InfoRow label="Email" value={<Text style={styles.infoValue}>{me?.email ?? '—'}</Text>} />
        <InfoRow label="Client" value={<Text style={styles.infoValue}>{client?.name ?? '—'}</Text>} />
        <InfoRow label="Phone" value={<Text style={styles.infoValue}>{client?.phone ?? '—'}</Text>} />
        <InfoRow label="Firm" value={<Text style={styles.infoValue}>{firmLabel}</Text>} />
        {meError ? <Text style={styles.error}>{meError}</Text> : null}
      </Card>

      <Card title="Consent">
        <InfoRow
          label="Status"
          value={
            <Text style={[styles.infoValue, consent ? styles.valueSuccess : styles.valueDanger]}>
              {consent ? 'Accepted' : 'Not accepted'}
            </Text>
          }
        />
        <InfoRow label="Version" value={<Text style={styles.infoValue}>{consent?.version ?? '—'}</Text>} />
        <InfoRow
          label="Accepted"
          value={<Text style={styles.infoValue}>{consent ? formatDateTime(consent.acceptedAt) : '—'}</Text>}
        />
      </Card>

      <Card title="SMS permission">
        <InfoRow
          label="Status"
          value={
            <Text style={[styles.infoValue, hasPermission ? styles.valueSuccess : styles.valueDanger]}>
              {hasPermission ? 'Granted' : 'Not granted'}
            </Text>
          }
        />
        {!hasPermission ? (
          <Pressable
            accessibilityRole="button"
            disabled={granting}
            onPress={onGrantPermission}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
              granting && styles.buttonDisabled,
            ]}
          >
            {granting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Grant SMS permission</Text>
            )}
          </Pressable>
        ) : null}
      </Card>

      <Card title="Background reading">
        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchLabel}>
              {listening ? 'Reading in background' : 'Background reading is off'}
            </Text>
            <Text style={styles.helper}>
              Only GST/tax keyword-matched messages are captured. Others are ignored.
            </Text>
          </View>
          <Switch
            value={listening}
            disabled={toggling}
            onValueChange={(value) => {
              void onToggleReading(value);
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
          />
        </View>
      </Card>

      <Card title="Sync">
        <InfoRow
          label="Auto-sync"
          value={
            <Text style={[styles.infoValue, isAutoSyncActive() ? styles.valueSuccess : styles.valueDanger]}>
              {isAutoSyncActive() ? 'On' : 'Off'}
            </Text>
          }
        />
        <InfoRow label="Last sync" value={<Text style={styles.infoValue}>{formatDateTime(lastSyncAt)}</Text>} />
        <InfoRow label="Queued" value={<Text style={styles.infoValue}>{queued}</Text>} />
        <Pressable
          accessibilityRole="button"
          disabled={syncing}
          onPress={onSyncNow}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            syncing && styles.buttonDisabled,
          ]}
        >
          {syncing ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>Sync now</Text>
          )}
        </Pressable>
      </Card>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.links}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('SmsLog')}
          style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
        >
          <Text style={styles.linkButtonText}>View SMS log</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Settings')}
          style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
        >
          <Text style={styles.linkButtonText}>Settings</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  greeting: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMuted,
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
    marginBottom: spacing.sm,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    marginRight: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  infoValueWrap: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
  },
  valueSuccess: {
    color: colors.success,
  },
  valueDanger: {
    color: colors.danger,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.danger,
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
  switchLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  helper: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: colors.textMuted,
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
    marginTop: spacing.md,
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
  links: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  linkButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  linkButtonPressed: {
    backgroundColor: colors.background,
  },
  linkButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});

export default HomeScreen;
