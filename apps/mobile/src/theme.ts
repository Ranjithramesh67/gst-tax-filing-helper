export const colors = {
  background: '#f8fafc',
  surface: '#ffffff',
  primary: '#0f766e',
  primaryPressed: '#115e59',
  accent: '#0ea5e9',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  disabled: '#cbd5e1',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const fontSize = {
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  xxl: 30,
} as const;

export const theme = { colors, spacing, radius, fontSize } as const;

export type Theme = typeof theme;
