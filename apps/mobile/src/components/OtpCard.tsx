import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { InboxItem } from '@gstflow/types';
import { colors, fontSize, radius, spacing } from '@/theme';

type OtpItem = Extract<InboxItem, { kind: 'OTP' }>;

/**
 * Compact card for a grouped OTP entry: the code plus one badge per channel the
 * code arrived on (SMS/Email) and an aggregate count when the same code was seen
 * more than once. Mirrors the firm-web `OtpCard`.
 */
export function OtpCard({ item }: { item: OtpItem }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.code}>{item.code}</Text>
      <View style={styles.badges}>
        {item.sources.map((source) => (
          <View
            key={source}
            style={[styles.badge, source === 'EMAIL' ? styles.badgeEmail : styles.badgeSms]}
          >
            <Text style={styles.badgeText}>{source === 'EMAIL' ? 'Email' : 'SMS'}</Text>
          </View>
        ))}
        {item.eventCount > 1 ? <Text style={styles.count}>x{item.eventCount}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  code: {
    marginRight: spacing.sm,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.text,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    marginRight: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeEmail: {
    backgroundColor: colors.accent,
  },
  badgeSms: {
    backgroundColor: colors.textMuted,
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.surface,
  },
  count: {
    marginLeft: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});

export default OtpCard;
