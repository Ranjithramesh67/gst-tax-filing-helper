import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { AppNotification } from '@gstflow/types';
import { api } from '@/lib/api';
import { colors, fontSize, radius, spacing } from '@/theme';

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function NotificationsScreen(): React.ReactElement {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await api.notifications.list({ pageSize: 100 });
      setItems(page.items);
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

  const markRead = useCallback(
    async (item: AppNotification) => {
      if (item.readAt) return;
      setBusyId(item.id);
      try {
        await api.notifications.markRead(item.id);
        await load();
      } catch (error) {
        setNotice(messageOf(error));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const markAll = useCallback(async () => {
    try {
      await api.notifications.markAllRead();
      await load();
    } catch (error) {
      setNotice(messageOf(error));
    }
  }, [load]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const unread = items.filter((item) => !item.readAt).length;

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
      <View style={styles.topRow}>
        <Text style={styles.intro}>
          {unread > 0 ? `${unread} unread` : 'You are all caught up.'}
        </Text>
        {unread > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => void markAll()}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptyBody}>
            Deadline reminders and updates about your linked firms will appear here.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => void markRead(item)}
            disabled={busyId === item.id}
            style={({ pressed }) => [
              styles.card,
              !item.readAt && styles.cardUnread,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.headerRow}>
              <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
              {!item.readAt ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.meta}>{formatDate(item.createdAt)}</Text>
            {busyId === item.id ? (
              <ActivityIndicator style={styles.busy} color={colors.primary} />
            ) : null}
          </Pressable>
        ))
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  intro: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  markAll: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardUnread: {
    borderColor: colors.primary,
  },
  cardPressed: {
    opacity: 0.9,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
    marginRight: spacing.sm,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  titleUnread: {
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  body: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMuted,
  },
  meta: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.disabled,
  },
  busy: {
    marginTop: spacing.sm,
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

export default NotificationsScreen;
