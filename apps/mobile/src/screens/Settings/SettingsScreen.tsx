import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getStoredConsent, getStoredDeviceId, type StoredConsent } from '@/lib/storage';
import { SmsReader } from '@/native/SmsReader';
import { colors, fontSize, radius, spacing } from '@/theme';

function formatDateTime(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function SettingsScreen(): React.ReactElement {
  const { client, signOut, revokeConsent } = useAuth();
  const [consent, setConsent] = useState<StoredConsent | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [storedConsent, storedDeviceId] = await Promise.all([
        getStoredConsent(),
        getStoredDeviceId(),
      ]);
      if (!active) return;
      setConsent(storedConsent);
      setDeviceId(storedDeviceId);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const runRevoke = useCallback(async () => {
    setRevoking(true);
    try {
      try {
        await SmsReader.stopListening();
        await SmsReader.setConsent(false);
      } catch {
        void 0;
      }

      try {
        await revokeConsent();
      } catch {
        void 0;
      }

      const id = deviceId ?? (await getStoredDeviceId());
      if (id) {
        try {
          await api.devices.revoke(id);
        } catch {
          void 0;
        }
      }
    } finally {
      setRevoking(false);
    }
    await signOut();
  }, [deviceId, revokeConsent, signOut]);

  const onRevokeConsent = useCallback(() => {
    Alert.alert(
      'Revoke consent',
      'This immediately stops all SMS reading and sending on this device, revokes the device, and signs you out. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            void runRevoke();
          },
        },
      ],
    );
  }, [runRevoke]);

  const onSignOut = useCallback(() => {
    Alert.alert('Sign out', 'You can sign back in with OTP at any time. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            await signOut();
          })();
        },
      },
    ]);
  }, [signOut]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Client</Text>
        <InfoRow label="Name" value={client?.name ?? '—'} />
        <InfoRow label="Phone" value={client?.phone ?? '—'} />
        <InfoRow label="GSTIN" value={client?.gstin ?? '—'} />
        <InfoRow label="Device ID" value={deviceId ?? '—'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Consent</Text>
        <InfoRow label="Version" value={consent?.version ?? 'Not recorded'} />
        <InfoRow
          label="Accepted"
          value={consent ? formatDateTime(consent.acceptedAt) : 'Not recorded'}
        />
        <InfoRow label="OTP verified" value={consent?.otpVerified ? 'Yes' : 'No'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revoke consent</Text>
        <Text style={styles.body}>
          Revoking consent stops SMS reading immediately on this device, clears the stored consent
          flag, revokes this device on the server, and signs you out. After revocation no further SMS
          is read, queued, or sent to your firm. Existing messages already shared with your firm
          remain with them for the filings they are responsible for.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={revoking || signingOut}
          onPress={onRevokeConsent}
          style={({ pressed }) => [
            styles.dangerButton,
            pressed && styles.dangerButtonPressed,
            (revoking || signingOut) && styles.buttonDisabled,
          ]}
        >
          {revoking ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.dangerButtonText}>Revoke consent &amp; stop reading</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={signingOut || revoking}
        onPress={onSignOut}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.secondaryButtonPressed,
          (signingOut || revoking) && styles.buttonDisabled,
        ]}
      >
        {signingOut ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        )}
      </Pressable>
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
  infoValue: {
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'right',
  },
  body: {
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.text,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerButtonPressed: {
    opacity: 0.85,
  },
  dangerButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: colors.background,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default SettingsScreen;
