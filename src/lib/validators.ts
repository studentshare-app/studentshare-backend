/**
 * lib/validators.ts
 *
 * Centralised validation helpers used across all auth screens.
 * Previously each screen had its own inline check — now one source of truth.
 */

// ── Email ─────────────────────────────────────────────────────
/**
 * Validates an email address with a proper RFC-5322-ish regex.
 * Rejects:  "a@b.", "@.com", "plaintext", "a@b" (no TLD)
 * Accepts:  "user@example.com", "user+tag@college.edu.sl"
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

// ── Password strength ─────────────────────────────────────────
export type StrengthResult = {
  level:  0 | 1 | 2 | 3 | 4
  label:  string
  color:  string
  width:  string
}

const COMMON_PASSWORDS = [
  'password', 'password1', '123456', '12345678', 'qwerty',
  'abc123', 'letmein', '111111', '123123', 'admin',
  'iloveyou', 'welcome', 'monkey', 'sunshine', 'master',
]

export function getPasswordStrength(pw: string): StrengthResult {
  if (pw.length === 0) return { level: 0, label: '',        color: '#E5E7EB', width: '0%'   }

  // Block trivially guessable passwords first
  if (COMMON_PASSWORDS.includes(pw.toLowerCase())) {
    return { level: 1, label: 'Too common', color: '#EF4444', width: '15%' }
  }

  // Length is the biggest factor
  if (pw.length < 8) return { level: 1, label: 'Too short', color: '#EF4444', width: '20%' }

  let score = 0
  if (pw.length >= 8)   score++
  if (pw.length >= 12)  score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++  // special char

  if (score <= 2) return { level: 2, label: 'Weak',   color: '#F97316', width: '35%' }
  if (score <= 3) return { level: 3, label: 'Good',   color: '#F59E0B', width: '65%' }
  return               { level: 4, label: 'Strong', color: '#10B981', width: '100%' }
}

/**
 * Returns true if password meets the minimum bar for submission.
 * Used in canSubmit checks on signup and reset-password screens.
 */
export function isPasswordAcceptable(pw: string): boolean {
  return getPasswordStrength(pw).level >= 2
}

// ── Full name ─────────────────────────────────────────────────
export function isValidFullName(name: string): boolean {
  return name.trim().length >= 2
}
