import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { ClientLink } from '@gstflow/types';
import { api } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/theme';

type ActionKind = 'confirm' | 'reject' | 'revoke';

const STATUS_LABEL: Record<ClientLink['status'], string> = {
  ACTIVE: 'Linked',
  PENDING: 'Awaiting your confirmation',
  REJECTED: 'Rejected',
  REVOKED: 'Revoked',
};

const STATUS_COLOR: Record<ClientLink['status'], string> = {
  ACTIVE: colors.success,
  PENDING: colors.warning,
  REJECTED: colors.danger,
  REVOKED: colors.textMuted,
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function LinksScreen(): React.ReactElement {
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.links.list();
      setLinks(rows);
      setNotice(null);
    } catch (error) {
      setNotice(messageOf(error));
    }
  }, []);

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

  const runAction = useCallback(
    async (link: ClientLink, action: ActionKind) => {
      setBusyId(link.id);
      setNotice(null);
      try {
        if (action === 'confirm') await api.links.confirm(link.id);
        else if (action === 'reject') await api.links.reject(link.id);
        else await api.links.revoke(link.id);
        await load();
      } catch (error) {
        setNotice(messageOf(error));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const confirmAction = useCallback(
    (link: ClientLink, action: ActionKind) => {
      const copy: Record<ActionKind, { title: string; body: string; cta: string }> = {
        confirm: {
          title: 'Confirm link',
          body: `Allow ${link.firm.name} to receive your GST-related SMS from this device?`,
          cta: 'Confirm',
        },
        reject: {
          title: 'Reject link',
          body: `Decline the link request from ${link.firm.name}? No SMS will be shared.`,
          cta: 'Reject',
        },
        revoke: {
          title: 'Unlink firm',
          body: `Stop sharing SMS with ${link.firm.name}? This takes effect immediately.`,
          cta: 'Unlink',
        },
      };
      const text = copy[action];
      Alert.alert(text.title, text.body, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: text.cta,
          style: action === 'confirm' ? 'default' : 'destructive',
          onPress: () => {
            void runAction(link, action);
          },
        },
      ]);
    },
    [runAction],
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text style={styles.intro}>
        Firms that added your mobile number must be confirmed by you before any GST SMS is shared.
        Review each request below.
      </Text>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {links.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No firm requests yet</Text>
          <Text style={styles.emptyBody}>
            When a CA firm adds your number, their request will appear here for you to confirm.
          </Text>
        </View>
      ) : (
        links.map((link) => {
          const busy = busyId === link.id;
          const isPending = link.status === 'PENDING';
          const isActive = link.status === 'ACTIVE';
          return (
            <View key={link.id} style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.firmName}>{link.firm.name}</Text>
                <Text style={[styles.status, { color: STATUS_COLOR[link.status] }]}>
                  {STATUS_LABEL[link.status]}
                </Text>
              </View>
              <Text style={styles.meta}>Requested {formatDate(link.requestedAt)}</Text>
              {link.gstin ? <Text style={styles.meta}>GSTIN {link.gstin}</Text> : null}
              {link.note ? <Text style={styles.note}>“{link.note}”</Text> : null}

              {isPending ? (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => confirmAction(link, 'confirm')}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Confirm</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => confirmAction(link, 'reject')}
                    style={({ pressed }) => [
                      styles.dangerButton,
                      pressed && styles.dangerButtonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.dangerButtonText}>Reject</Text>
                  </Pressable>
                </View>
              ) : isActive ? (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => confirmAction(link, 'revoke')}
                    style={({ pressed }) => [
                      styles.dangerButton,
                      pressed && styles.dangerButtonPressed,
                      busy && styles.buttonDisabled,
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.dangerButtonText}>Unlink &amp; stop sharing</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.meta}>
                  {link.status === 'REJECTED'
                    ? 'You declined this request. The firm cannot see your SMS.'
                    : 'This link was revoked. The firm cannot see your SMS.'}
                </Text>
              )}
            </View>
          );
        })
      )}
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
  intro: {
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  firmName: {
    flexShrink: 1,
    marginRight: spacing.sm,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  status: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  meta: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  note: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
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
  dangerButton: {
    flex: 1,
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
    color: colors.danger,
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

export default LinksScreen;
