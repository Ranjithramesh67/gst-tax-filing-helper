import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError } from '@gstflow/api-client';
import { phoneSchema } from '@gstflow/validation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getDeviceInfo } from '@/lib/device';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors, fontSize, radius, spacing } from '@/theme';

type OtpNavigation = NativeStackNavigationProp<RootStackParamList, 'Otp'>;

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function OtpScreen(): React.ReactElement {
  const navigation = useNavigation<OtpNavigation>();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSendOtp = useCallback(async () => {
    setError(null);
    setInfo(null);
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError('Enter a valid 10-digit Indian mobile number');
      return;
    }
    setSending(true);
    try {
      const result = await api.auth.requestOtp({
        phone: parsed.data,
        purpose: 'CLIENT_ONBOARDING',
      });
      setRequestId(result.requestId);
      setDevCode(result.devCode ?? null);
      setInfo('OTP sent to your phone number.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  }, [phone]);

  const onVerify = useCallback(async () => {
    setError(null);
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError('Enter a valid 10-digit Indian mobile number');
      return;
    }
    if (!/^[0-9]{4,8}$/.test(code)) {
      setError('Enter the OTP code (4 to 8 digits)');
      return;
    }
    setVerifying(true);
    try {
      const device = await getDeviceInfo();
      const result = await api.auth.verifyOtp({
        phone: parsed.data,
        code,
        purpose: 'CLIENT_ONBOARDING',
        device,
      });
      await signIn(result);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setVerifying(false);
    }
  }, [phone, code, signIn]);

  const busy = sending || verifying;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Verify your phone number</Text>
        <Text style={styles.subtitle}>
          We send a one-time password to the mobile number registered with your CA firm. Verifying
          it grants consent for GST SMS collection on this device.
        </Text>

        <Text style={styles.label}>Mobile number</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="10-digit mobile number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={10}
          editable={!busy}
          style={styles.input}
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onSendOtp}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
            busy && styles.buttonDisabled,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>{requestId ? 'Resend OTP' : 'Send OTP'}</Text>
          )}
        </Pressable>

        <Text style={styles.label}>OTP code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Enter OTP"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={8}
          editable={!busy}
          style={styles.input}
        />

        {devCode ? <Text style={styles.devCode}>Development OTP: {devCode}</Text> : null}

        {info ? <Text style={styles.info}>{info}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onVerify}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            busy && styles.buttonDisabled,
          ]}
        >
          {verifying ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>Verify &amp; Grant Consent</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => navigation.goBack()}
          style={styles.link}
        >
          <Text style={styles.linkText}>Back to consent</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textMuted,
  },
  label: {
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
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  secondaryButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
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
  devCode: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.warning,
  },
  info: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.success,
  },
  error: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  primaryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  link: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
});

export default OtpScreen;
