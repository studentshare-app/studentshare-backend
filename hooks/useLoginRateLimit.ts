/**
 * hooks/useLoginRateLimit.ts
 *
 * Client-side login attempt counter with exponential back-off and lockout.
 *
 * WHY CLIENT-SIDE RATE LIMITING?
 * ───────────────────────────────
 * Supabase has its own server-side limits, but they are coarse.
 * A client-side gate:
 *  1. Instantly blocks brute-force loops without waiting for a server round-trip
 *  2. Shows a clear countdown timer so the user knows how long to wait
 *  3. Provides a better UX than a mysterious "rate limit exceeded" error
 *
 * NOTE: This is a UX layer, not a security guarantee — a determined attacker
 * can bypass it by reinstalling the app. Real protection lives in:
 *  - Supabase auth rate limits (Dashboard → Auth → Rate Limits)
 *  - Supabase Captcha integration (Dashboard → Auth → Enable Captcha)
 *
 * LOCKOUT SCHEDULE
 * ────────────────
 * 1st–3rd attempt : no lockout
 * 4th attempt     : 30-second wait
 * 5th attempt     : 5-minute wait
 * 6th+ attempt    : 15-minute wait
 */

import { useCallback, useRef, useState } from 'react'

const LOCKOUT_SCHEDULE: Record<number, number> = {
  4: 30,          //  30 seconds
  5: 5 * 60,      //   5 minutes
}
const DEFAULT_LOCKOUT = 15 * 60   // 15 minutes for attempt 6+
const MAX_FREE_ATTEMPTS = 3       // attempts before any lockout kicks in

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; waitSeconds: number }

export function useLoginRateLimit() {
  const attempts  = useRef(0)
  const lockedAt  = useRef<number | null>(null)
  const lockDur   = useRef<number>(0)

  const [lockedUntil, setLockedUntil] = useState<number | null>(null)

  const getRemainingSeconds = useCallback((): number => {
    if (!lockedUntil) return 0
    return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
  }, [lockedUntil])

  const isCurrentlyLocked = useCallback((): boolean => {
    if (!lockedUntil) return false
    if (Date.now() >= lockedUntil) {
      setLockedUntil(null)
      return false
    }
    return true
  }, [lockedUntil])

  /** Call this before every login attempt. */
  const attempt = useCallback((): RateLimitResult => {
    // Already locked?
    if (isCurrentlyLocked()) {
      return { allowed: false, waitSeconds: getRemainingSeconds() }
    }

    attempts.current += 1
    const n = attempts.current

    if (n > MAX_FREE_ATTEMPTS) {
      const waitSecs = LOCKOUT_SCHEDULE[n] ?? DEFAULT_LOCKOUT
      const until = Date.now() + waitSecs * 1000
      setLockedUntil(until)
      return { allowed: false, waitSeconds: waitSecs }
    }

    return { allowed: true }
  }, [isCurrentlyLocked, getRemainingSeconds])

  /** Call on successful login to reset the counter. */
  const reset = useCallback(() => {
    attempts.current = 0
    lockedAt.current = null
    lockDur.current  = 0
    setLockedUntil(null)
  }, [])

  return {
    attempt,
    reset,
    isLocked: isCurrentlyLocked,
    getRemainingSeconds,
    attemptsUsed: attempts.current,
  }
}