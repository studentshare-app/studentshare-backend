/**
 * lib/authErrors.ts
 *
 * Sanitises raw Supabase / OAuth error messages before showing them to users.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Raw Supabase errors like "User already registered" or "Invalid login
 * credentials" enable account-enumeration attacks — an attacker can probe
 * which emails are registered by watching which error fires.
 *
 * This file maps internal error strings to safe, user-friendly messages
 * that reveal nothing about account existence.
 *
 * Rule: NEVER call setError(authError.message) directly. Always call
 *       setError(sanitiseAuthError(authError)) instead.
 */

interface AuthErrorLike {
  message: string
  status?: number
}

export function sanitiseAuthError(error: AuthErrorLike): string {
  const msg    = error.message?.toLowerCase() ?? ''
  const status = error.status

  // ── Rate limiting ─────────────────────────────────────────────
  if (msg.includes('rate limit') || msg.includes('too many request') || status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }

  // ── Invalid credentials (intentionally vague — prevents enumeration) ──
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('wrong password') ||
    msg.includes('invalid password')
  ) {
    return 'Incorrect email or password.'
  }

  // ── Email not confirmed ───────────────────────────────────────
  if (msg.includes('email not confirmed') || msg.includes('not verified')) {
    return 'Please verify your email address before signing in. Check your inbox.'
  }

  // ── Account already exists ────────────────────────────────────
  // Keep this somewhat specific so UX is still good on signup
  if (
    msg.includes('user already registered') ||
    msg.includes('already exists') ||
    msg.includes('already been registered')
  ) {
    return 'An account with this email already exists. Try signing in instead.'
  }

  // ── Password too short / weak (Supabase server-side rule) ────
  if (msg.includes('password should be') || msg.includes('password must be')) {
    return 'Password is too weak. Use at least 8 characters with a mix of letters and numbers.'
  }

  // ── Network / connectivity ────────────────────────────────────
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    status === 0
  ) {
    return 'Connection error. Please check your internet and try again.'
  }

  // ── Token / session errors ────────────────────────────────────
  if (
    msg.includes('refresh token') ||
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('session')
  ) {
    return 'Your session has expired. Please sign in again.'
  }

  // ── OAuth / provider errors ───────────────────────────────────
  if (msg.includes('provider') || msg.includes('oauth') || msg.includes('callback')) {
    return 'Sign-in with this provider failed. Please try again or use email.'
  }

  // ── Default safe fallback — never expose raw internals ───────
  if (__DEV__) {
    // Show the real error only in development so you can debug it
    console.warn('[authErrors] Unmapped error:', error.message, 'status:', status)
  }
  return 'Something went wrong. Please try again.'
}