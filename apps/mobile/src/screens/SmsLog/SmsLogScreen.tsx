import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InboxItem } from '@gstflow/types';
import { api } from '@/lib/api';
import { hashMessage } from '@/lib/gstFilter';
import * as smsQueue from '@/lib/smsQueue';
import { syncNow, subscribeSync } from '@/lib/smsSync';
import { backfillRecentGstSms } from '@/lib/smsCollector';
import { OtpCard } from '@/components/OtpCard';
import { colors, fontSize, radius, spacing } from '@/theme';

const PAGE_SIZE = 20;

type SmsRow = Extract<InboxItem, { kind: 'SMS' }>;
type OtpRow = Extract<InboxItem, { kind: 'OTP' }>;

/** Locally-queued SMS not yet reflected in the server feed. */
interface QueuedRow {
  kind: 'queued';
  id: string;
  sender: string;
  receivedAt: string;
  body: string;
  state: 'Queued';
}

type Row = QueuedRow | InboxItem;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function rowKey(item: Row): string {
  if (item.kind === 'queued') return `queued:${item.id}`;
  return `${item.kind}:${item.id}`;
}

export function SmsLogScreen(): React.ReactElement {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [queued, setQueued] = useState<smsQueue.QueuedSms[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ['inbox', page],
    queryFn: () => api.inbox.list({ page, pageSize: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const loadQueue = useCallback(async () => {
    setQueued(await smsQueue.list());
  }, []);

  // Recover GST SMS delivered while this screen (or the app) was not open, then
  // load the local queue that will be overlaid on the server feed.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await backfillRecentGstSms();
      } catch {
        void 0;
      }
      if (!active) return;
      try {
        setQueued(await smsQueue.list());
      } catch {
        void 0;
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // React to queue mutations from any actor (live capture, backfill, manual or
  // background auto-sync) so the "Queued" overlay stays current.
  useEffect(() => smsQueue.subscribe(setQueued), []);

  // A completed sync makes newly-ingested rows available server-side; refresh
  // both the server feed and the local queue.
  useEffect(
    () =>
      subscribeSync((event) => {
        if (event.sent.length === 0) return;
        void queryClient.invalidateQueries({ queryKey: ['inbox'] });
        void loadQueue();
      }),
    [queryClient, loadQueue],
  );

  const serverItems = inbox.data?.items ?? [];

  // Overlay locally-queued SMS at the top, dropping any the server already has
  // (same canonical content hash). Server rows keep their `kind` and render via
  // OtpCard (OTP groups) or the SMS row.
  const rows = useMemo<Row[]>(() => {
    const serverHashes = new Set(
      serverItems
        .filter((item): item is SmsRow => item.kind === 'SMS')
        .map((item) => hashMessage(item.sender, item.body, item.receivedAt)),
    );
    const overlay: QueuedRow[] = queued
      .filter((item) => !serverHashes.has(item.hash))
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .map((item) => ({
        kind: 'queued',
        id: item.id,
        sender: item.sender,
        receivedAt: item.receivedAt,
        body: item.body,
        state: 'Queued',
      }));
    return [...overlay, ...serverItems];
  }, [queued, serverItems]);

  const queuedCount = rows.reduce((count, item) => (item.kind === 'queued' ? count + 1 : count), 0);
  const total = inbox.data?.total ?? 0;
  const totalPages = inbox.data?.totalPages ?? 1;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([inbox.refetch(), loadQueue()]);
    } finally {
      setRefreshing(false);
    }
  }, [inbox, loadQueue]);

  const onSyncNow = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await syncNow();

      if (result.ok) {
        setNotice(result.sent > 0 ? `Sent ${result.sent} message(s).` : 'Nothing new to sync.');
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['inbox'] }), loadQueue()]);
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
  }, [queryClient, loadQueue]);

  const renderSms = (item: {
    sender: string;
    receivedAt: string;
    body: string;
    state: 'Queued' | 'Synced';
  }) => (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.sender} numberOfLines={1}>
          {item.sender || 'Unknown sender'}
        </Text>
        <View style={[styles.pill, item.state === 'Queued' ? styles.pillQueued : styles.pillSynced]}>
          <Text style={styles.pillText}>{item.state}</Text>
        </View>
      </View>
      <Text style={styles.receivedAt}>{formatDateTime(item.receivedAt)}</Text>
      <Text style={styles.body} numberOfLines={3}>
        {item.body}
      </Text>
    </View>
  );

  const renderOtp = (item: OtpRow) => (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.sender} numberOfLines={1}>
          {item.client.name || 'Unknown client'}
        </Text>
        <Text style={styles.receivedAt}>{formatDateTime(item.receivedAt)}</Text>
      </View>
      <View style={styles.otpCodeRow}>
        <OtpCard item={item} />
      </View>
      {item.from || item.subject ? (
        <Text style={styles.body} numberOfLines={1}>
          {item.from ?? item.subject}
        </Text>
      ) : null}
      {item.snippet ? (
        <Text style={styles.body} numberOfLines={3}>
          {item.snippet}
        </Text>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: Row }) => {
    if (item.kind === 'queued') return renderSms(item);
    if (item.kind === 'OTP') return renderOtp(item);
    return renderSms({ ...item, state: 'Synced' });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>Queued: {queuedCount}</Text>
        <Text style={styles.summaryText}>On server: {total}</Text>
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
      {inbox.isError ? (
        <Text style={styles.error}>
          {inbox.error instanceof Error ? inbox.error.message : 'Failed to load messages.'}
        </Text>
      ) : null}
      {!inbox.isLoading && !inbox.isError && totalPages > 1 ? (
        <View style={styles.pager}>
          <Pressable
            accessibilityRole="button"
            disabled={page <= 1}
            onPress={() => setPage((current) => Math.max(1, current - 1))}
            style={({ pressed }) => [
              styles.pagerButton,
              (pressed || page <= 1) && styles.pagerButtonMuted,
            ]}
          >
            <Text style={styles.pagerButtonText}>Previous</Text>
          </Pressable>
          <Text style={styles.pagerLabel}>
            Page {page} of {totalPages}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={page >= totalPages}
            onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
            style={({ pressed }) => [
              styles.pagerButton,
              (pressed || page >= totalPages) && styles.pagerButtonMuted,
            ]}
          >
            <Text style={styles.pagerButtonText}>Next</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderEmpty = () => {
    if (inbox.isLoading) {
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
      data={rows}
      keyExtractor={rowKey}
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
  error: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  pager: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pagerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pagerButtonMuted: {
    opacity: 0.5,
  },
  pagerButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  pagerLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
  otpCodeRow: {
    marginTop: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  pillQueued: {
    backgroundColor: colors.warning,
  },
  pillSynced: {
    backgroundColor: colors.textMuted,
  },
  pillText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
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
