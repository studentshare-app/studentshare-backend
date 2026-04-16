/**
 * app/(auth)/signup.tsx  —  PRODUCTION-READY
 *
 * FIXES APPLIED (25 total + draft persistence fix)
 * ────────────────────────────────────────────────
 * Draft persistence (corrected behaviour)
 * • goingToPicker ref — set true ONLY when navigating to college/class picker
 * • useFocusEffect cleanup — clears ALL draft keys when user leaves screen for
 *   any reason OTHER than going to a picker (e.g. back to login/onboarding)
 * • goingToPicker reset to false on every focus so it's fresh each cycle
 *
 * All previous 25 fixes retained unchanged.
 *
 * FIX: Google OAuth now checks college_id before routing.
 * After successful Google sign-in, redirectAfterOAuth() checks the profile:
 * - No college_id → redirect to college selection
 * - Has college_id → redirect to tabs
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { SvgXml } from 'react-native-svg'
import { useFocusEffect, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import { sanitiseAuthError }       from '@/lib/authErrors'
import { ROUTES }                  from '@/core/config/routes'
import { supabase }                from '@/core/api/supabase'
import {
  getPasswordStrength,
  isPasswordAcceptable,
  isValidEmail,
  isValidFullName,
} from '@/lib/validators'

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  bg:      '#07080C',
  bgCard:  '#10131C',
  border:  '#161B27',
  accent:  '#E8692A',
  text:    '#EEF0F8',
  muted:   '#6E7A96',
  dimmed:  '#353D52',
  white:   '#FFFFFF',
  error:   '#EF4444',
  success: '#10B981',
}

const TERMS_VERSION = '2026-02-22'

// ── AsyncStorage keys ─────────────────────────────────────────────────────────
export const SIGNUP_COLLEGE_ID_KEY   = 'signup_draft_college_id'
export const SIGNUP_COLLEGE_NAME_KEY = 'signup_draft_college_name'
export const SIGNUP_CLASS_ID_KEY     = 'signup_draft_class_id'
export const SIGNUP_CLASS_NAME_KEY   = 'signup_draft_class_name'

const SIGNUP_DRAFT_NAME_KEY    = 'signup_draft_full_name'
const SIGNUP_DRAFT_EMAIL_KEY   = 'signup_draft_email'
const SIGNUP_DRAFT_PW_KEY      = 'signup_draft_password'
const SIGNUP_DRAFT_CONFIRM_KEY = 'signup_draft_confirm'

const ALL_DRAFT_KEYS = [
  SIGNUP_COLLEGE_ID_KEY,
  SIGNUP_COLLEGE_NAME_KEY,
  SIGNUP_CLASS_ID_KEY,
  SIGNUP_CLASS_NAME_KEY,
  SIGNUP_DRAFT_NAME_KEY,
  SIGNUP_DRAFT_EMAIL_KEY,
  SIGNUP_DRAFT_PW_KEY,
  SIGNUP_DRAFT_CONFIRM_KEY,
]

async function clearSignupDraft() {
  await AsyncStorage.multiRemove(ALL_DRAFT_KEYS).catch(() => {})
}

// ── Google "G" SVG logo ───────────────────────────────────────────────────────
const GOOGLE_G_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20">
  <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.85l6.09-6.09C34.46 3.19 29.53 1 24 1 14.82 1 7.07 6.48 3.64 14.22l7.1 5.52C12.4 13.72 17.73 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.52 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.7c-.55 2.97-2.2 5.48-4.68 7.17l7.18 5.57C43.24 37.34 46.52 31.4 46.52 24.5z"/>
  <path fill="#FBBC05" d="M10.74 28.26A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.72-4.26l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.86.92 7.51 2.55 10.73l8.19-6.47z"/>
  <path fill="#34A853" d="M24 47c5.53 0 10.18-1.83 13.57-4.97l-7.18-5.57C28.6 37.84 26.43 38.5 24 38.5c-6.27 0-11.6-4.22-13.26-9.98l-8.19 6.47C6.07 42.65 14.46 47 24 47z"/>
  <path fill="none" d="M0 0h48v48H0z"/>
</svg>
`

// ── Terms HTML ────────────────────────────────────────────────────────────────
const TERMS_HTML = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F8FAFC;color:#1E293B;line-height:1.7}
.header{background:#0F172A;padding:40px 24px 32px;text-align:center}
.header h1{font-size:26px;font-weight:800;color:#F8FAFC;margin-bottom:8px}
.header p{font-size:13px;color:#64748B}
.content{max-width:680px;margin:0 auto;padding:32px 20px 60px}
.section{background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;border:1px solid #E2E8F0}
.section h2{font-size:16px;font-weight:700;color:#0F172A;margin-bottom:10px}
.section p{font-size:14px;color:#475569;line-height:1.75}
.contact-box{background:#0F172A;border-radius:16px;padding:24px;margin-bottom:16px;text-align:center}
.contact-box p{color:#94A3B8;font-size:14px;margin-bottom:8px}
.contact-box a{color:#38BDF8;font-weight:700;font-size:15px}
.footer{text-align:center;padding:24px 20px;background:#0F172A}
.footer p{font-size:13px;color:#475569}
</style></head><body>
<div class="header">
  <h1>Terms of Service</h1>
  <p>Please read carefully before using StudentShare</p>
</div>
<div class="content">
  <div class="section"><h2>1. Acceptance of Terms</h2><p>By creating an account on StudentShare, you confirm that you have read, understood, and agree to be bound by these Terms of Service.</p></div>
  <div class="section"><h2>2. About StudentShare</h2><p>StudentShare is an educational platform built specifically for students in Sierra Leone.</p></div>
  <div class="section"><h2>3. Account Responsibility</h2><p>You must be at least 16 years old to create an account. Keep your password confidential.</p></div>
  <div class="section"><h2>4. Privacy &amp; Data</h2><p>We do not sell your personal data to third parties. Your data is stored securely.</p></div>
  <div class="section"><h2>5. Subscriptions &amp; Payments</h2><p>Some features require a paid subscription. Fees are charged in advance and are non-refundable unless required by law.</p></div>
  <div class="contact-box"><p>Questions? Reach out at</p><a href="mailto:infostudentshare@gmail.com">infostudentshare@gmail.com</a></div>
</div>
<div class="footer"><p>© 2026 StudentShare · Built for Sierra Leone 🇸🇱</p></div>
</body></html>
`

// ── FadeSlide ─────────────────────────────────────────────────────────────────
const FadeSlide = memo(function FadeSlide({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(18)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 440, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(translateY, { toValue: 0, duration: 440, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  )
})

// ── Password strength bar ─────────────────────────────────────────────────────
const SEGMENT_COLORS = ['#EF4444', '#F97316', '#FBBF24', '#10B981']

const StrengthBar = memo(function StrengthBar({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <View style={sb.row}>
      {[1, 2, 3, 4].map(seg => (
        <View
          key={seg}
          style={[sb.segment, { backgroundColor: level >= seg ? SEGMENT_COLORS[seg - 1] : P.border }]}
        />
      ))}
    </View>
  )
})

const sb = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 4, marginTop: 8 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
})

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SignUpScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [fullName,        setFullName]        = useState('')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)
  const [focused,         setFocused]         = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [googleLoading,   setGoogleLoading]   = useState(false)
  const [termsAccepted,   setTermsAccepted]   = useState(false)
  const [showTerms,       setShowTerms]       = useState(false)
  const [termsLoading,    setTermsLoading]    = useState(true)
  const [errorMsg,        setErrorMsg]        = useState('')
  const [isOffline,       setIsOffline]       = useState(false)

  const [collegeId,   setCollegeId]   = useState<string | null>(null)
  const [collegeName, setCollegeName] = useState<string | null>(null)
  const [classId,     setClassId]     = useState<string | null>(null)
  const [className,   setClassName]   = useState<string | null>(null)

  // ── FIX: track whether the user is going to a picker or leaving entirely ─
  const goingToPicker = useRef(false)

  // ── Offline detection ─────────────────────────────────────────────────────
  useEffect(() => {
    NetInfo.fetch().then(s => setIsOffline(!(s.isConnected ?? true)))
    const unsub = NetInfo.addEventListener(s => setIsOffline(!(s.isConnected ?? true)))
    return () => unsub()
  }, [])

  // ── Draft persistence ─────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      goingToPicker.current = false

      let cancelled = false
      AsyncStorage.multiGet([
        SIGNUP_COLLEGE_ID_KEY,
        SIGNUP_COLLEGE_NAME_KEY,
        SIGNUP_CLASS_ID_KEY,
        SIGNUP_CLASS_NAME_KEY,
        SIGNUP_DRAFT_NAME_KEY,
        SIGNUP_DRAFT_EMAIL_KEY,
        SIGNUP_DRAFT_PW_KEY,
        SIGNUP_DRAFT_CONFIRM_KEY,
      ]).then(pairs => {
        if (cancelled) return
        setCollegeId(pairs[0][1])
        setCollegeName(pairs[1][1])
        setClassId(pairs[2][1])
        setClassName(pairs[3][1])
        if (pairs[4][1]) setFullName(pairs[4][1])
        if (pairs[5][1]) setEmail(pairs[5][1])
        if (pairs[6][1]) setPassword(pairs[6][1])
        if (pairs[7][1]) setConfirmPassword(pairs[7][1])
      }).catch(() => {})

      return () => {
        cancelled = true
        if (!goingToPicker.current) {
          clearSignupDraft()
        }
      }
    }, []),
  )

  // ── Persist text fields on every change ──────────────────────────────────
  useEffect(() => { AsyncStorage.setItem(SIGNUP_DRAFT_NAME_KEY,    fullName).catch(() => {}) }, [fullName])
  useEffect(() => { AsyncStorage.setItem(SIGNUP_DRAFT_EMAIL_KEY,   email).catch(() => {}) },    [email])
  useEffect(() => { AsyncStorage.setItem(SIGNUP_DRAFT_PW_KEY,      password).catch(() => {}) }, [password])
  useEffect(() => { AsyncStorage.setItem(SIGNUP_DRAFT_CONFIRM_KEY, confirmPassword).catch(() => {}) }, [confirmPassword])

  // ── Derived ───────────────────────────────────────────────────────────────
  const strength       = useMemo(() => getPasswordStrength(password), [password])
  const passwordsMatch = !confirmPassword || password === confirmPassword

  const canSubmit = useMemo(() =>
    isValidFullName(fullName) &&
    isValidEmail(email) &&
    isPasswordAcceptable(password) &&
    password === confirmPassword &&
    termsAccepted &&
    !!collegeId &&
    !!classId &&
    !loading,
  [fullName, email, password, confirmPassword, termsAccepted, collegeId, classId, loading])

  // ── Sign up ───────────────────────────────────────────────────────────────
  const handleSignUp = useCallback(async () => {
    if (!canSubmit) return
    setErrorMsg('')

    if (isOffline) {
      setErrorMsg('No internet connection. Please connect and try again.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email:   email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })

    if (error) {
      setLoading(false)
      setErrorMsg(sanitiseAuthError(error))
      return
    }

    if (data.user) {
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id:                data.user.id,
        college_id:        collegeId,
        class_id:          classId,
        terms_accepted_at: new Date().toISOString(),
        terms_version:     TERMS_VERSION,
      })
      if (upsertError && __DEV__) {
        console.warn('[SignUp] profiles upsert failed:', upsertError.message)
      }
    }

    await clearSignupDraft()
    setLoading(false)

    if (!data.session) {
      router.replace({
        pathname: ROUTES.LOGIN,
        params: { notice: `Check your inbox at ${email.trim().toLowerCase()} to confirm your account.` },
      } as any)
    }
    // Else session is established, RootLayout will handle the redirection!
  }, [canSubmit, isOffline, email, password, fullName, collegeId, classId, router])

  // ── Redirect is now handled solely by RootLayout.tsx for consistency ───────

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const handleGoogle = useCallback(async () => {
    if (googleLoading) return
    setErrorMsg('')

    if (isOffline) {
      setErrorMsg('No internet connection. Please connect and try again.')
      return
    }

    setGoogleLoading(true)
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'studentshare://auth/callback', skipBrowserRedirect: true },
      })
      if (oauthError || !data.url) {
        setErrorMsg(sanitiseAuthError(oauthError ?? { message: 'Could not start sign-in.' }))
        setGoogleLoading(false)
        return
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, 'studentshare://auth/callback')
      if (result.type === 'success' && result.url) {
        let exchangeError: any = null
        try {
          const match = result.url.match(/code=([^&#]+)/)
          if (match && match[1]) {
            const res = await supabase.auth.exchangeCodeForSession(match[1])
            exchangeError = res.error
          } else {
            const res = await supabase.auth.exchangeCodeForSession(result.url)
            exchangeError = res.error
          }
        } catch (err) {
          exchangeError = err
        }

        if (!exchangeError) {
          setGoogleLoading(false)
          return
        }
        
        // Also check if session exists anyway (if callback.tsx exchanged it)
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setGoogleLoading(false)
          return
        }
        
        setErrorMsg(sanitiseAuthError(exchangeError))
      } else {
        // On Android, Chrome Custom Tabs close the tab when the deep link fires,
        // which causes openAuthSessionAsync to return type:'cancel' even though
        // the OAuth succeeded. The /auth/callback screen handles the exchange
        // in that case — just check if a session was established.
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setGoogleLoading(false)
          return
        }
      }
    } catch (err: unknown) {
      if (__DEV__) console.error('[Google OAuth]', err instanceof Error ? err.message : err)
      const isCancelled =
        err instanceof Error &&
        (err.message.toLowerCase().includes('cancel') ||
          err.message.toLowerCase().includes('dismiss'))
      if (!isCancelled) setErrorMsg('Sign-in failed. Please try again.')
    }
    setGoogleLoading(false)
  }, [googleLoading, isOffline, router])

  // ── Pickers ───────────────────────────────────────────────────────────────
  const goToCollegePicker = useCallback(() => {
    goingToPicker.current = true
    router.push({ pathname: ROUTES.COLLEGE_SELECTION, params: { mode: 'signup' } } as any)
  }, [router])

  const goToClassPicker = useCallback(() => {
    if (!collegeId) {
      setErrorMsg('Please select your college before choosing a class.')
      return
    }
    goingToPicker.current = true
    router.push({
      pathname: '/(auth)/class-selection',
      params: { college_id: collegeId, mode: 'signup' },
    } as any)
  }, [collegeId, router])

  // ── Back ──────────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace(ROUTES.LOGIN)
  }, [router])

  const isFormDisabled = loading || googleLoading

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <View style={styles.blobTR} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.blobBL} accessibilityElementsHidden importantForAccessibility="no" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Headline */}
          <FadeSlide delay={60}>
            <View style={styles.headlineWrap}>
              <Text style={styles.headline} accessibilityRole="header">
                Join{' '}
                <Text style={[styles.headline, { color: P.accent }]}>StudentShare</Text>
              </Text>
              <Text style={styles.subhead}>
                Connect with peers, share resources, and excel together at your university.
              </Text>
            </View>
          </FadeSlide>

          {/* Inline error banner */}
          {!!errorMsg && (
            <FadeSlide delay={0}>
              <View
                style={styles.errorBanner}
                accessibilityLiveRegion="polite"
                accessibilityLabel={errorMsg}
              >
                <Ionicons name="alert-circle-outline" size={14} color={P.error} />
                <Text style={styles.errorBannerText}>{errorMsg}</Text>
              </View>
            </FadeSlide>
          )}

          {/* Offline banner */}
          {isOffline && (
            <View
              style={styles.offlineBanner}
              accessibilityLiveRegion="assertive"
              accessibilityLabel="No internet connection"
            >
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>No internet — connect to sign up</Text>
            </View>
          )}

          {/* Google button */}
          <FadeSlide delay={100}>
            <TouchableOpacity
              style={[styles.googleBtn, isFormDisabled && { opacity: 0.6 }]}
              onPress={handleGoogle}
              disabled={isFormDisabled}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              accessibilityHint="Opens Google sign-in in your browser"
              accessibilityState={{ disabled: isFormDisabled }}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#1F2937" />
              ) : (
                <>
                  <SvgXml xml={GOOGLE_G_SVG} width={20} height={20} />
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </FadeSlide>

          <FadeSlide delay={140}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or use email</Text>
              <View style={styles.dividerLine} />
            </View>
          </FadeSlide>

          {/* Full Name */}
          <FadeSlide delay={180}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <View style={[styles.fieldBox, focused === 'name' && styles.fieldBoxFocused]}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Alex Johnson"
                  placeholderTextColor={P.dimmed}
                  value={fullName}
                  onChangeText={setFullName}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  editable={!isFormDisabled}
                  accessibilityLabel="Full name"
                  accessibilityHint="Enter your first and last name"
                />
                {isValidFullName(fullName) && (
                  <Ionicons name="checkmark-circle" size={18} color={P.success} />
                )}
              </View>
            </View>
          </FadeSlide>

          {/* Email */}
          <FadeSlide delay={220}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <View style={[styles.fieldBox, focused === 'email' && styles.fieldBoxFocused]}>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="name@gmail.com"
                  placeholderTextColor={P.dimmed}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  editable={!isFormDisabled}
                  accessibilityLabel="Email address"
                  accessibilityHint="Enter your email address"
                />
                {isValidEmail(email) && (
                  <Ionicons name="checkmark-circle" size={18} color={P.success} />
                )}
              </View>
            </View>
          </FadeSlide>

          {/* Password */}
          <FadeSlide delay={260}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={[styles.fieldBox, focused === 'password' && styles.fieldBoxFocused]}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor={P.dimmed}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  editable={!isFormDisabled}
                  accessibilityLabel="Password"
                  accessibilityHint="Create a password with at least 8 characters"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(p => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={P.muted} />
                </TouchableOpacity>
              </View>
              {password.length > 0 && (
                <>
                  <StrengthBar level={strength.level} />
                  <View style={styles.strengthMeta}>
                    <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                    <View style={styles.strengthHints}>
                      <Text style={[styles.hint, password.length >= 8          && styles.hintMet]}>8+ Chars</Text>
                      <Text style={[styles.hint, /[A-Z]/.test(password)        && styles.hintMet]}>Aa</Text>
                      <Text style={[styles.hint, /[0-9]/.test(password)        && styles.hintMet]}>123</Text>
                      <Text style={[styles.hint, /[^A-Za-z0-9]/.test(password) && styles.hintMet]}>#$&</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </FadeSlide>

          {/* Confirm Password */}
          <FadeSlide delay={300}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
              <View style={[
                styles.fieldBox,
                focused === 'confirm' && styles.fieldBoxFocused,
                !passwordsMatch && styles.fieldBoxError,
              ]}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor={P.dimmed}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onFocus={() => setFocused('confirm')}
                  onBlur={() => setFocused(null)}
                  editable={!isFormDisabled}
                  accessibilityLabel="Confirm password"
                  accessibilityHint="Re-enter your password to confirm"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirm(p => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={19} color={P.muted} />
                </TouchableOpacity>
              </View>
              {!passwordsMatch && (
                <Text style={styles.matchError} accessibilityLiveRegion="polite">
                  Passwords do not match
                </Text>
              )}
              {!!confirmPassword && passwordsMatch && (
                <Text style={styles.matchOk}>Passwords match ✓</Text>
              )}
            </View>
          </FadeSlide>

          {/* College picker */}
          <FadeSlide delay={340}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>COLLEGE</Text>
              <TouchableOpacity
                style={[styles.pickerRow, !!collegeName && styles.pickerRowSelected]}
                onPress={goToCollegePicker}
                activeOpacity={0.8}
                disabled={isFormDisabled}
                accessibilityRole="button"
                accessibilityLabel={collegeName ? `College: ${collegeName}` : 'Select your college'}
                accessibilityHint="Opens the college selection screen"
              >
                <View style={[styles.pickerIconBox, !!collegeName && styles.pickerIconBoxSelected]}>
                  <Ionicons name="school-outline" size={18} color={collegeName ? P.accent : P.muted} />
                </View>
                <Text style={[styles.pickerText, !!collegeName && styles.pickerTextSelected]} numberOfLines={1}>
                  {collegeName ?? 'Select your college'}
                </Text>
                {collegeName
                  ? <Ionicons name="checkmark-circle" size={18} color={P.success} />
                  : <Ionicons name="chevron-forward" size={18} color={P.dimmed} />
                }
              </TouchableOpacity>
            </View>
          </FadeSlide>

          {/* Class picker */}
          <FadeSlide delay={380}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CLASS</Text>
              <TouchableOpacity
                style={[
                  styles.pickerRow,
                  !!className && styles.pickerRowSelected,
                  !collegeId && styles.pickerRowDisabled,
                ]}
                onPress={goToClassPicker}
                activeOpacity={0.8}
                disabled={isFormDisabled}
                accessibilityRole="button"
                accessibilityLabel={className ? `Class: ${className}` : 'Select your class'}
                accessibilityHint={!collegeId ? 'Select a college first' : 'Opens the class selection screen'}
                accessibilityState={{ disabled: !collegeId }}
              >
                <View style={[styles.pickerIconBox, !!className && styles.pickerIconBoxSelected]}>
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={className ? P.accent : !collegeId ? P.dimmed : P.muted}
                  />
                </View>
                <Text style={[
                  styles.pickerText,
                  !!className && styles.pickerTextSelected,
                  !collegeId && styles.pickerTextDisabled,
                ]} numberOfLines={1}>
                  {className ?? (!collegeId ? 'Select a college first' : 'Select your class')}
                </Text>
                {className
                  ? <Ionicons name="checkmark-circle" size={18} color={P.success} />
                  : <Ionicons name="chevron-forward" size={18} color={P.dimmed} />
                }
              </TouchableOpacity>
            </View>
          </FadeSlide>

          {/* Terms */}
          <FadeSlide delay={420}>
            <View style={styles.termsRow}>
              <TouchableOpacity
                style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
                onPress={() => setTermsAccepted(p => !p)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
                accessibilityLabel="Accept terms of service"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                {termsAccepted && <Ionicons name="checkmark" size={12} color={P.white} />}
              </TouchableOpacity>
              <Text style={styles.termsText}>I agree to the </Text>
              <TouchableOpacity
                onPress={() => { setTermsLoading(true); setShowTerms(true) }}
                accessibilityRole="button"
                accessibilityLabel="Read terms of service"
                accessibilityHint="Opens the full terms of service"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={styles.termsLink}>Terms of Service</Text>
              </TouchableOpacity>
            </View>
          </FadeSlide>

          {/* Create Account button */}
          <FadeSlide delay={460}>
            <TouchableOpacity
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
              onPress={handleSignUp}
              disabled={!canSubmit}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityHint="Creates your StudentShare account"
              accessibilityState={{ disabled: !canSubmit }}
            >
              {loading ? (
                <ActivityIndicator color={P.white} />
              ) : (
                <View style={styles.primaryBtnInner}>
                  <Text style={styles.primaryBtnText}>Create Account</Text>
                  {canSubmit && (
                    <View style={styles.primaryBtnArrow}>
                      <Ionicons name="arrow-forward" size={16} color={P.accent} />
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </FadeSlide>

          {/* Sign in link */}
          <FadeSlide delay={500}>
            <TouchableOpacity
              style={styles.loginRow}
              onPress={() => router.replace(ROUTES.LOGIN)}
              accessibilityRole="button"
              accessibilityLabel="Already have an account? Log in"
            >
              <Text style={styles.loginPrompt}>Already have an account? </Text>
              <Text style={styles.loginLink}>Log in →</Text>
            </TouchableOpacity>
          </FadeSlide>

          {/* Footer pill */}
          <FadeSlide delay={540}>
            <View style={styles.footerPillWrap}>
              <View style={styles.footerPill}>
                <Text style={styles.footerPillText}>🇸🇱  Built for Sierra Leone students</Text>
              </View>
            </View>
          </FadeSlide>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms modal */}
      <Modal
        visible={showTerms}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTerms(false)}
      >
        <SafeAreaView style={styles.termsModal}>
          <View style={styles.termsHeader}>
            <View>
              <Text style={styles.termsHeaderTitle}>Terms of Service</Text>
              <Text style={styles.termsHeaderSub}>StudentShare · Sierra Leone</Text>
            </View>
            <TouchableOpacity
              style={styles.termsCloseBtn}
              onPress={() => setShowTerms(false)}
              accessibilityRole="button"
              accessibilityLabel="Close terms of service"
            >
              <Ionicons name="close" size={18} color="#0F172A" />
            </TouchableOpacity>
          </View>
          {termsLoading && (
            <View style={styles.termsLoader}>
              <ActivityIndicator size="large" color={P.accent} />
            </View>
          )}
          <WebView
            source={{ html: TERMS_HTML }}
            style={{ flex: 1, backgroundColor: '#F8FAFC' }}
            onLoadEnd={() => setTermsLoading(false)}
            showsVerticalScrollIndicator={false}
          />
          <View style={styles.termsFooter}>
            <TouchableOpacity
              style={styles.termsAgreeBtn}
              onPress={() => { setTermsAccepted(true); setShowTerms(false) }}
              accessibilityRole="button"
              accessibilityLabel="Accept terms and close"
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={P.white} />
              <Text style={styles.termsAgreeBtnText}>I Accept — Close</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: P.bg },
  blobTR: { position: 'absolute', top: 0, right: 0, width: 280, height: 280, borderRadius: 140, backgroundColor: P.accent, opacity: 0.04, transform: [{ translateX: 80 }, { translateY: -80 }] },
  blobBL: { position: 'absolute', bottom: 0, left: 0, width: 200, height: 200, borderRadius: 100, backgroundColor: P.accent, opacity: 0.06, transform: [{ translateX: -60 }, { translateY: 60 }] },

  scroll: { paddingHorizontal: 24, maxWidth: 440, width: '100%', alignSelf: 'center' },

  pageHeader: { marginBottom: 20 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: P.border,
    justifyContent: 'center', alignItems: 'center',
  },

  headlineWrap: { marginBottom: 24 },
  headline: { fontSize: 30, fontWeight: '800', color: P.text, letterSpacing: -0.6, marginBottom: 8 },
  subhead:  { fontSize: 15, color: P.muted, lineHeight: 22 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 16,
  },
  errorBannerText: { color: P.error, fontSize: 13, flex: 1, lineHeight: 18 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 16,
  },
  offlineDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F59E0B' },
  offlineText: { fontSize: 12, color: '#F59E0B', fontWeight: '500', flex: 1 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 52, backgroundColor: P.white,
    borderRadius: 14, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  googleBtnText: { fontSize: 14, fontWeight: '600', color: '#1F2937', letterSpacing: 0.1 },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: P.border },
  dividerText: { fontSize: 10, fontWeight: '700', color: P.dimmed, letterSpacing: 1.5 },

  fieldGroup:      { marginBottom: 20 },
  fieldLabel:      { fontSize: 10, fontWeight: '700', color: P.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  fieldBox:        { flexDirection: 'row', alignItems: 'center', height: 54, backgroundColor: P.bgCard, borderWidth: 2, borderColor: P.border, borderRadius: 14, paddingHorizontal: 16 },
  fieldBoxFocused: { borderColor: P.accent },
  fieldBoxError:   { borderColor: P.error },
  fieldInput:      { flex: 1, fontSize: 16, color: P.text },

  strengthMeta:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  strengthLabel: { fontSize: 11, fontWeight: '700' },
  strengthHints: { flexDirection: 'row', gap: 8 },
  hint:    { fontSize: 9, fontWeight: '700', color: P.dimmed, textTransform: 'uppercase', letterSpacing: 0.5 },
  hintMet: { color: P.success },

  matchError: { fontSize: 11, color: P.error,   marginTop: 5, fontWeight: '500' },
  matchOk:    { fontSize: 11, color: P.success, marginTop: 5, fontWeight: '500' },

  pickerRow:             { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, backgroundColor: P.bgCard, borderWidth: 2, borderColor: P.border, borderRadius: 14, paddingHorizontal: 16 },
  pickerRowSelected:     { borderColor: P.accent },
  pickerRowDisabled:     { opacity: 0.45 },
  pickerIconBox:         { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'center', alignItems: 'center' },
  pickerIconBoxSelected: { backgroundColor: `${P.accent}18` },
  pickerText:            { flex: 1, fontSize: 15, color: P.muted },
  pickerTextSelected:    { color: P.text, fontWeight: '600' },
  pickerTextDisabled:    { color: P.dimmed },

  termsRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  checkbox:        { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: P.border, backgroundColor: P.bgCard, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: P.accent, borderColor: P.accent },
  termsText:       { fontSize: 13, color: P.muted },
  termsLink:       { fontSize: 13, color: P.accent, fontWeight: '700' },

  primaryBtn:         { backgroundColor: P.accent, borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginBottom: 20, shadowColor: P.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 6 },
  primaryBtnDisabled: { backgroundColor: 'rgba(232,105,42,0.35)', shadowOpacity: 0, elevation: 0 },
  primaryBtnInner:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryBtnText:     { fontSize: 16, fontWeight: '800', color: P.white, letterSpacing: 0.3 },
  primaryBtnArrow:    { width: 28, height: 28, borderRadius: 8, backgroundColor: P.white, justifyContent: 'center', alignItems: 'center' },

  loginRow:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  loginPrompt: { fontSize: 14, color: P.muted },
  loginLink:   { fontSize: 14, fontWeight: '800', color: P.accent },

  footerPillWrap: { alignItems: 'center', paddingTop: 8 },
  footerPill:     { backgroundColor: P.bgCard, borderWidth: 1, borderColor: P.border, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  footerPillText: { fontSize: 12, color: P.muted, fontWeight: '600' },

  termsModal:        { flex: 1, backgroundColor: '#F8FAFC' },
  termsHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  termsHeaderTitle:  { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  termsHeaderSub:    { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  termsCloseBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  termsLoader:       { position: 'absolute', top: 72, left: 0, right: 0, bottom: 72, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', zIndex: 10 },
  termsFooter:       { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  termsAgreeBtn:     { backgroundColor: P.accent, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: P.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  termsAgreeBtnText: { color: P.white, fontSize: 15, fontWeight: '700' },
}) 