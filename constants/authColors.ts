/**
 * app/(auth)/constants/colors.ts
 *
 * Single source of truth for all auth-screen colour tokens.
 * Previously copy-pasted across login, signup, forgot-password,
 * reset-password — now imported from here.
 */

export const C = {
  bgDeep:     '#050D1A',
  bgMid:      '#0A1628',
  bgCard:     '#0F2040',
  navy:       '#1A3A8F',
  blue:       '#2563EB',
  sky:        '#38BDF8',
  skyLight:   '#7DD3FC',
  white:      '#FFFFFF',
  offWhite:   '#E2EAF4',
  muted:      '#6B8CAE',
  border:     '#1E3A5F',
  error:      '#F87171',
  success:    '#34D399',
  warning:    '#F59E0B',
  warnBg:     'rgba(245,158,11,0.10)',
  warnBorder: 'rgba(245,158,11,0.30)',
} as const

export type ColorTokens = typeof C