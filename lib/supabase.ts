/**
 * lib/supabase.ts
 *
 * SECURITY FIXES APPLIED
 * ──────────────────────
 * A  flowType: 'pkce'  — enables PKCE for all OAuth flows.
 *    Prevents auth-code interception attacks on mobile.
 *    Required companion change: use supabase.auth.exchangeCodeForSession(url)
 *    in the OAuth callback instead of manually parsing tokens from the hash.
 *
 * B  detectSessionInUrl: false — correct for React Native; Supabase's default
 *    browser-based URL detection causes spurious console warnings in Metro.
 *
 * C  autoRefreshToken / persistSession both true — Supabase manages token
 *    rotation automatically; no manual refresh needed in application code.
 *
 * D  AsyncStorage adapter — session survives app restarts on device.
 *
 * IMPORTANT: EXPO_PUBLIC_GROQ_API_KEY must NOT be stored here or anywhere
 * on the client. All Groq/AI calls must go through a Supabase Edge Function.
 * See: supabase/functions/ai-proxy/index.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// These are intentionally public (anon key is safe to expose — RLS is the
// security layer). The Supabase URL and anon key are embedded in the app
// bundle by design. They are NOT equivalent to secret/service-role keys.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

if (__DEV__) {
  if (!SUPABASE_URL)      console.error('[supabase] EXPO_PUBLIC_SUPABASE_URL is not set')
  if (!SUPABASE_ANON_KEY) console.error('[supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY is not set')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
    // PKCE is the secure OAuth flow for mobile apps.
    // It generates a code verifier/challenge pair so the auth code cannot
    // be exchanged for tokens by anyone who intercepts the redirect URL.
    flowType: 'pkce',
  },
})

/**
 * initAuthListener
 *
 * Wire up a global auth-state listener at app startup (_layout.tsx).
 * Returns the unsubscribe function — call it in your useEffect cleanup.
 *
 * Events handled:
 *  SIGNED_IN        → session established (initial load or sign-in)
 *  TOKEN_REFRESHED  → new tokens stored; no UI action needed
 *  SIGNED_OUT       → navigate to sign-in
 *  USER_UPDATED     → profile changed
 */
export function initAuthListener(
  onSignIn:  (userId: string) => void,
  onSignOut: () => void,
) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) onSignIn(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        onSignOut()
      }
    },
  )
  return () => subscription.unsubscribe()
}