import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as smsQueue from '@/lib/smsQueue';
import { syncNow } from '@/lib/smsSync';
import { SmsReader } from '@/native/SmsReader';
import { colors, fontSize, radius, spacing } from '@/theme';

type SyncState = 'queued' | 'sent';

interface LogItem {
  id: string;
  sender: string;
  receivedAt: string;
  body: string;
  hash: string;
  state: SyncState;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toLogItem(item: smsQueue.QueuedSms, state: SyncState): LogItem {
  return {
    id: item.id,
    sender: item.sender,
    receivedAt: item.receivedAt,
    body: item.body,
    hash: item.hash,
    state,
  };
}

export function SmsLogScreen(): React.ReactElement {
  const [queued, setQueued] = useState<LogItem[]>([]);
  const [sent, setSent] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const items = await smsQueue.list();
    setQueued(items.map((item) => toLogItem(item, 'queued')));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const unsubscribe = SmsReader.onSmsReceived((sms) => {
      void (async () => {
        await smsQueue.enqueue({
          sender: sms.sender,
          body: sms.body,
          receivedAt: sms.receivedAt,
          hash: sms.hash,
        });
        await load();
      })();
    });
    return unsubscribe;
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onSyncNow = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const before = await smsQueue.list();
      const result = await syncNow();
      const after = await smsQueue.list();
      const afterIds = new Set(after.map((item) => item.id));
      const newlySent = before
        .filter((item) => !afterIds.has(item.id))
        .map((item) => toLogItem(item, 'sent'));

      if (newlySent.length) {
        setSent((current) => {
          const sentIds = new Set(newlySent.map((item) => item.id));
          return [...newlySent, ...current.filter((item) => !sentIds.has(item.id))].slice(0, 100);
        });
      }
      setQueued(after.map((item) => toLogItem(item, 'queued')));

      if (result.ok) {
        setNotice(result.sent > 0 ? `Sent ${result.sent} message(s).` : 'Nothing new to sync.');
      } else if (result.skipped === 'no-consent') {
        setNotice('Consent is required before messages can be sent.');
      } else if (result.skipped === 'no-session') {
        setNotice('You need to be signed in to sync.');
      } else if (result.skipped === 'in-progress') {
        setNotice('A sync is already running.');
      } else {
        setNotice(result.error ?? 'Sync failed. It will retry automatically.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }, []);

  const data = [...sent, ...queued];

  const renderItem = ({ item }: { item: LogItem }) => (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.sender} numberOfLines={1}>
          {item.sender || 'Unknown sender'}
        </Text>
        <View style={[styles.pill, item.state === 'sent' ? styles.pillSent : styles.pillQueued]}>
          <Text style={[styles.pillText, item.state === 'sent' ? styles.pillTextSent : styles.pillTextQueued]}>
            {item.state === 'sent' ? 'Sent' : 'Queued'}
          </Text>
        </View>
      </View>
      <Text style={styles.receivedAt}>{formatDateTime(item.receivedAt)}</Text>
      <Text style={styles.body} numberOfLines={3}>
        {item.body}
      </Text>
      <Text style={styles.hash}>hash {item.hash.slice(0, 16)}</Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Queued: {queued.length}</Text>
        <Text style={styles.summaryText}>Sent this session: {sent.length}</Text>
      </View>
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
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No GST SMS captured yet</Text>
        <Text style={styles.emptyText}>
          Turn on background reading on the Home screen. Matched messages appear here before they
          are sent to your firm.
        </Text>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
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
  header: {
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  primaryButton: {
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
  buttonDisabled: {
    opacity: 0.6,
  },
  notice: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  item: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sender: {
    flex: 1,
    marginRight: spacing.sm,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  receivedAt: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  body: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.text,
  },
  hash: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  pillSent: {
    backgroundColor: colors.success,
  },
  pillQueued: {
    backgroundColor: colors.warning,
  },
  pillText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  pillTextSent: {
    color: colors.surface,
  },
  pillTextQueued: {
    color: colors.surface,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.textMuted,
  },
});

export default SmsLogScreen;
