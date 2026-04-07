/**
 * lib/routes.ts
 *
 * Centralised route paths — eliminates magic strings and `as any` casts
 * scattered across auth screens.
 *
 * Usage:
 *   import { ROUTES } from '../../lib/routes'
 *   router.replace(ROUTES.TABS)
 */

export const ROUTES = {
  TABS:              '/(tabs)'                   as const,
  LOGIN:             '/(auth)/login'             as const,
  SIGNUP:            '/(auth)/signup'            as const,
  FORGOT_PASSWORD:   '/(auth)/forgot-password'   as const,
  COLLEGE_SELECTION: '/(auth)/college-selection' as const,
  RESET_PASSWORD:    '/(auth)/reset-password'    as const,
  ONBOARDING:        '/(auth)/onboarding'        as const,
  STUDENT_FORUM:     '/student-forum'            as const,
  ADMIN_DASHBOARD:   '/admin-dashboard'          as const,
} as const

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES]
