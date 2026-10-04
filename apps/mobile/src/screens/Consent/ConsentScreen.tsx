import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CONSENT_VERSION } from '@/config';
import { api } from '@/lib/api';
import { getStoredConsent, setStoredConsent } from '@/lib/storage';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors, fontSize, radius, spacing } from '@/theme';

type ConsentNavigation = NativeStackNavigationProp<RootStackParamList, 'Consent'>;

interface RetentionInfo {
  enabled: boolean;
  archiveAfterDays: number;
  purgeBackupAfterDays: number;
}

export function ConsentScreen(): React.ReactElement {
  const navigation = useNavigation<ConsentNavigation>();
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retention, setRetention] = useState<RetentionInfo | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await getStoredConsent();
      if (active && stored?.version === CONSENT_VERSION) setAlreadyAccepted(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const policy = await api.public.retention();
        if (active) setRetention(policy);
      } catch {
        // Consent does not depend on the policy; fall back to generic wording.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onAccept = useCallback(async () => {
    setSubmitting(true);
    await setStoredConsent({
      version: CONSENT_VERSION,
      acceptedAt: new Date().toISOString(),
      accepted: true,
      otpVerified: false,
    });
    setSubmitting(false);
    navigation.navigate('Otp');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Consent to read GST-related SMS</Text>
        <Text style={styles.version}>Consent version {CONSENT_VERSION}</Text>

        <Text style={styles.heading}>What we read</Text>
        <Text style={styles.body}>
          After you accept, GSTFlow reads incoming SMS on this device only to find GST messages. A
          message is kept only when it comes from a sender containing GST (such as AD-GSTN,
          VM-GSTIN) or its text contains GST (including GSTIN, GSTR and GSTN). All other messages,
          including personal and bank messages, are ignored and never read, stored, or sent.
        </Text>

        <Text style={styles.heading}>Why we read them</Text>
        <Text style={styles.body}>
          Your chartered accountant firm files your GST returns. Forwarding these messages lets the
          firm review invoices, e-way bills, payment confirmations, and notices so your returns can
          be prepared on time without repeated calls or messages to you.
        </Text>

        <Text style={styles.heading}>What is sent and where</Text>
        <Text style={styles.body}>
          Only the matched GST messages are sent securely to GSTFlow servers and then to your
          registered CA firm&apos;s account. The raw message content is encrypted, and every read
          and forward action is audited. No GST portal login or filing is performed from this app.
        </Text>

        <Text style={styles.heading}>What we do not do</Text>
        <Text style={styles.body}>
          We do not read personal chats or bank balance messages. We do not send SMS on your behalf.
          We do not share your messages with anyone other than your registered firm.
        </Text>

        <Text style={styles.heading}>How long we keep messages</Text>
        <Text style={styles.body}>
          {retention
            ? `GST messages are available to your firm for ${retention.archiveAfterDays} days, after which they are removed from the firm portal and this app. A protected copy is kept for up to ${retention.purgeBackupAfterDays} days before permanent deletion, and only a platform administrator can access it.`
            : 'GST messages are available to your firm for a limited period, after which they are removed from the firm portal and this app. A protected copy is kept for a further period before permanent deletion, and only a platform administrator can access it.'}
        </Text>

        <Text style={styles.heading}>How to revoke</Text>
        <Text style={styles.body}>
          Open Settings and tap Revoke consent at any time to stop all SMS collection immediately.
          You may also ask your CA firm to revoke this device. Revoking stops ingestion right away,
          and existing data remains available only to your firm for the filings it is responsible
          for.
        </Text>

        <Text style={styles.note}>
          Collection starts only after you accept this consent, verify your phone number by OTP, and
          grant the Android SMS permission. Until then no SMS is accessed.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            submitting && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {alreadyAccepted ? 'Continue to OTP verification' : 'I accept and grant consent'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  version: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.text,
  },
  note: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

export default ConsentScreen;
