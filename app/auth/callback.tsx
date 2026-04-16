/**
 * app/auth/callback.tsx  —  OAuth deep-link handler
 *
 * Matches: studentshare://auth/callback
 *
 * This is a LITERAL path — the (auth) group is transparent in URLs,
 * so app/(auth)/callback.tsx would map to /callback, not /auth/callback.
 *
 * Why useURL() instead of Linking.addEventListener / getInitialURL():
 *   - getInitialURL() only works for cold opens (app launched from dead)
 *   - addEventListener fires BEFORE this component mounts on warm opens
 *   - useURL() is reactive: it works for BOTH cold and warm opens,
 *     and updates whenever a new deep link arrives, with no timing races.
 *
 * Flow:
 *   1. maybeCompleteAuthSession() — signals any openAuthSessionAsync in
 *      LoginScreen / SignupScreen to resolve immediately.
 *   2. onAuthStateChange — fires SIGNED_IN as soon as any exchange completes
 *      (either from this screen or the login/signup handler).
 *   3. useURL() exchange — when the callback URL is available, exchange the
 *      code directly (handles cases where login/signup screen is gone).
 *   4. 8s safety net — last resort check then fall back to login.
 */

import * as WebBrowser from 'expo-web-browser'
import { useURL } from 'expo-linking'
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { supabase } from '@/core/api/supabase'
import { ROUTES } from '@/core/config/routes'

// ── Must be called at module level ─────────────────────────────────────────
// Signals any in-flight WebBrowser.openAuthSessionAsync (in LoginScreen /
// SignupScreen) to resolve so that handler can finish the exchange.
WebBrowser.maybeCompleteAuthSession()

// Routing delegated to RootLayout.tsx for robustness on OAuth deep links

// ── Screen ──────────────────────────────────────────────────────────────────
export default function OAuthCallbackScreen() {
  const router = useRouter()
  const callbackUrl = useURL()
  const doneRef = useRef(false)

  const finish = useRef(async (userId: string) => {
    if (doneRef.current) return
    doneRef.current = true

    console.log('[callback] finish started for userId:', userId)
    
    // We signal success here. RootLayout.tsx has a listener for
    // SIGNED_IN events and its own navigate() logic that handles 
    // profile completeness checks. By marking ourselves as done, 
    // we stop our own safety timers and let the layout take over.
    console.log('[callback] Handing over to RootLayout for final routing.')
  }).current

  useEffect(() => {
    console.log('[callback] Mounting...')
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[callback] onAuthStateChange event:', event, !!session?.user)
        if (event === 'SIGNED_IN' && session?.user) {
          finish(session.user.id)
        }
      }
    )

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[callback] getSession current user:', !!session?.user)
      if (session?.user) finish(session.user.id)
    })

    return () => {
      console.log('[callback] Unmounting...')
      subscription.unsubscribe()
    }
  }, [finish])

  useEffect(() => {
    if (!callbackUrl || doneRef.current) return
    console.log('[callback] Processing callbackUrl:', callbackUrl)
    if (!callbackUrl.includes('code=') && !callbackUrl.includes('access_token=')) {
      console.log('[callback] URL doesn\'t look like an auth callback')
      return
    }

    ;(async () => {
      if (doneRef.current) return
      
      try {
        const match = callbackUrl.match(/code=([^&#]+)/)
        const code = match ? match[1] : null

        if (code) {
          console.log('[callback] Exchanging code for session...')
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.error('[callback] Code exchange error:', error.message)
          }
          if (data?.session?.user) {
            console.log('[callback] Code exchange success!')
            await finish(data.session.user.id)
            return
          }
        } else {
          console.log('[callback] Falling back to direct URL exchange...')
          const { data } = await supabase.auth.exchangeCodeForSession(callbackUrl)
           if (data?.session?.user) {
             console.log('[callback] URL exchange success!')
             await finish(data.session.user.id)
             return
           }
        }
      } catch (err) {
        console.error('[callback] Exception during exchange:', err)
      }

      if (!doneRef.current) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          console.log('[callback] Post-exchange session found')
          await finish(session.user.id)
        }
      }
    })()
  }, [callbackUrl, finish])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (doneRef.current) return
      console.log('[callback] 8s Safety net triggered')
      doneRef.current = true
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          console.log('[callback] No session in safety net, going to LOGIN')
          if (router.canGoBack()) router.back()
          else router.replace(ROUTES.LOGIN)
        } else {
          console.log('[callback] Session found in safety net')
          finish(session.user.id)
        }
      } catch (e) {
        console.log('[callback] Exception in safety net, heading to LOGIN')
        if (router.canGoBack()) router.back()
        else router.replace(ROUTES.LOGIN)
      }
    }, 8_000)
    return () => clearTimeout(timer)
  }, [router, finish])

  return (
    <View style={s.root}>
      <View style={s.card}>
        <ActivityIndicator size="large" color="#E8692A" />
        <Text style={s.title}>One moment…</Text>
        <Text style={s.sub}>Securely completing sign in</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07080C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#10131C',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 44,
    paddingVertical: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EEF0F8',
    letterSpacing: -0.3,
    marginTop: 8,
  },
  sub: {
    fontSize: 14,
    color: '#6E7A96',
    fontWeight: '500',
  },
})
