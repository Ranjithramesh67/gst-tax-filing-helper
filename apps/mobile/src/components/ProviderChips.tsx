import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { EMAIL_PROVIDER_PRESETS, type EmailProviderId } from '@/lib/emailProviders';
import { colors, fontSize, radius, spacing } from '@/theme';

interface ProviderChipsProps {
  selected: EmailProviderId;
  onSelect: (id: EmailProviderId) => void;
  disabled?: boolean;
}

/** Horizontal selector for the email provider catalog. Presentational only. */
export function ProviderChips({
  selected,
  onSelect,
  disabled,
}: ProviderChipsProps): React.ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {EMAIL_PROVIDER_PRESETS.map((preset) => {
        const isSelected = preset.id === selected;
        return (
          <Pressable
            key={preset.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={() => onSelect(preset.id)}
            style={({ pressed }) => [
              styles.chip,
              isSelected && styles.chipSelected,
              pressed && !isSelected && styles.chipPressed,
              disabled && styles.chipDisabled,
            ]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {preset.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipPressed: {
    backgroundColor: colors.background,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.surface,
  },
});

export default ProviderChips;
