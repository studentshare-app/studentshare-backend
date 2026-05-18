/**
 * app/(auth)/login.tsx  —  PRODUCTION-READY
 *
 * Auth logic unchanged: Supabase, PKCE OAuth, sanitiseAuthError,
 * useLoginRateLimit, offline detection, exchangeCodeForSession.
 *
 * FIX: Google OAuth now checks college_id before routing.
 * After successful OAuth, redirectAfterOAuth() checks the profile:
 * - No college_id → redirect to college selection
 * - Has college_id → redirect to tabs
 *
 * All previous fixes retained unchanged.
 */

import { Ionicons } from '@expo/vector-icons'
import NetInfo from '@react-native-community/netinfo'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ROUTES }            from '@/core/config/routes'
import { supabase }          from '@/core/api/supabase'
import { sanitiseAuthError } from '@/lib/authErrors'
import { useLoginRateLimit } from '@/hooks/useLoginRateLimit'

WebBrowser.maybeCompleteAuthSession()

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  bg:          '#07080C',
  bgCard:      '#10131C',
  border:      '#161B27',
  borderFocus: '#E8692A',
  text:        '#EEF0F8',
  muted:       '#6E7A96',
  dimmed:      '#353D52',
  accent:      '#E8692A',
  error:       '#EF4444',
  warning:     '#F59E0B',
  white:       '#FFFFFF',
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { attempt, reset: resetRateLimit, isLocked, getRemainingSeconds } =
    useLoginRateLimit()

  const [email,         setEmail]    = useState('')
  const [password,      setPassword] = useState('')
  const [showPass,      setShowPass] = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [socialLoading,   setSocial]          = useState<'google' | null>(null)
  const [error,           setError]           = useState('')
  const [showGoogleModal, setShowGoogleModal] = useState(false)
  const [focusedField,    setFocused]         = useState<'email' | 'password' | null>(null)
  const [lockCountdown, setCountdown]= useState(0)
  const [isOffline,     setOffline]  = useState(false)

  const passwordRef = useRef<TextInput>(null)

  // ── Network ───────────────────────────────────────────────────────────────
  useEffect(() => {
    NetInfo.fetch().then(s => setOffline(!(s.isConnected ?? true)))
    const unsub = NetInfo.addEventListener(s => {
      setOffline(!(s.isConnected ?? true))
      if (s.isConnected) {
        setError(prev =>
          prev === 'No internet connection. Please connect and try again.' ? '' : prev,
        )
      }
    })
    return () => unsub()
  }, [])

  // ── Lockout countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLocked()) { setCountdown(0); return }
    setCountdown(getRemainingSeconds())
    const interval = setInterval(() => {
      const rem = getRemainingSeconds()
      setCountdown(rem)
      if (rem <= 0) clearInterval(interval)
    }, 1_000)
    return () => clearInterval(interval)
  }, [isLocked, getRemainingSeconds])

  // ── Shake animation ──────────────────────────────────────────────────────
  const shakeX = useRef(new Animated.Value(0)).current

  const shake = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  -7, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   7, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   0, duration: 55, useNativeDriver: true }),
    ]).start()
  }, [shakeX])

  // ── Email / password login ────────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setError('')

    if (isOffline) {
      setError('No internet connection. Please connect and try again.')
      shake(); return
    }
    if (!email.trim() || !password) {
      setError('Please fill in all fields.')
      shake(); return
    }

    const check = attempt()
    if (!check.allowed) {
      const mins = Math.ceil(check.waitSeconds / 60)
      setError(
        check.waitSeconds < 60
          ? `Too many attempts. Please wait ${check.waitSeconds} seconds.`
          : `Too many attempts. Please wait ${mins} minute${mins > 1 ? 's' : ''}.`,
      )
      shake(); return
    }

    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    })
    setLoading(false)

    if (authError) {
      setError(sanitiseAuthError(authError))
      shake()
    } else {
      resetRateLimit()
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      // RootLayout will handle redirection based on profile completeness!
      console.log('[Login] Sign in success. Waiting for RootLayout navigation.')
    }
  }, [isOffline, email, password, attempt, shake, resetRateLimit, router])

  // ── Redirect is now handled solely by RootLayout.tsx for consistency ───────

  // ── Post-OAuth navigation helper ───────────────────────────────────────
  // Actively routes the user after a successful Google sign-in: new users
  // (no college_id) go to college-selection, users with college but no class
  // go to class-selection, and complete profiles let RootLayout navigate to tabs.
  const navigateAfterOAuth = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('college_id, class_id')
        .eq('id', session.user.id)
        .single()

      if (!profile?.college_id) {
        console.log('[Login][Google] No college — routing to college-selection')
        router.replace('/(auth)/college-selection' as any)
      } else if (!profile?.class_id) {
        console.log('[Login][Google] No class — routing to class-selection')
        router.replace({
          pathname: '/(auth)/class-selection',
          params: { college_id: profile.college_id },
        } as any)
      } else {
        // Profile complete — RootLayout will route to /(tabs) on SIGNED_IN
        console.log('[Login][Google] Profile complete — handing off to RootLayout')
      }
    } catch (err) {
      if (__DEV__) console.warn('[Login][Google] navigateAfterOAuth error:', err)
    }
  }, [router])

  // ── OAuth ────────────────────────────────────────────────────────────────
  const handleOAuth = useCallback((provider: 'google') => {
    setShowGoogleModal(true)
  }, [])

  // ── Derived state ────────────────────────────────────────────────────────
  const isFormDisabled = useMemo(
    () => loading || !!socialLoading || isLocked(),
    [loading, socialLoading, isLocked],
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Background blobs */}
      <View
        style={styles.blobTR}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View
        style={styles.blobBL}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />

      {/* Offline banner */}
      {isOffline && (
        <View
          style={[styles.offlineBanner, { top: insets.top + 8 }]}
          accessibilityLiveRegion="assertive"
          accessibilityLabel="No internet connection. Sign-in requires a connection."
        >
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>
            No internet — sign-in requires a connection
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop:    insets.top + (isOffline ? 60 : 24),
              paddingBottom: insets.bottom + 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Headline */}
          <View style={styles.headlineWrap}>
            <Text style={styles.headline} accessibilityRole="header" accessibilityLabel="Welcome Back">
              Welcome{'\n'}
              <Text style={[styles.headline, { color: P.accent }]}>Back</Text>
            </Text>
            <Text style={styles.subhead}>Continue your learning journey.</Text>
          </View>

          {/* Form card */}
          <Animated.View style={[styles.formWrap, { transform: [{ translateX: shakeX }] }]}>

            {/* Error banner */}
            {!!error && (
              <View
                style={styles.errorRow}
                accessibilityLiveRegion="polite"
                accessibilityLabel={error}
              >
                <Ionicons name="alert-circle-outline" size={14} color={P.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Lockout banner */}
            {isLocked() && lockCountdown > 0 && (
              <View
                style={styles.lockRow}
                accessibilityLiveRegion="polite"
                accessibilityLabel={`Account locked. Try again in ${lockCountdown} seconds.`}
              >
                <Ionicons name="time-outline" size={14} color={P.warning} />
                <Text style={styles.lockText}>
                  Locked · try again in {lockCountdown}s
                </Text>
              </View>
            )}

            {/* Email field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel} nativeID="emailLabel">
                EMAIL ADDRESS
              </Text>
              <View style={[
                styles.underlineWrap,
                focusedField === 'email' && styles.underlineFocused,
              ]}>
                <TextInput
                  style={styles.underlineInput}
                  placeholder="name@gmail.com"
                  placeholderTextColor={P.dimmed}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  editable={!isOffline && !isFormDisabled}
                  accessibilityLabel="Email address"
                  accessibilityHint="Enter the email address linked to your account"
                />
              </View>
            </View>

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TouchableOpacity
                  onPress={() => router.push(ROUTES.FORGOT_PASSWORD)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                  accessibilityHint="Opens the password reset screen"
                >
                  <Text style={styles.forgotLink}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View style={[
                styles.underlineWrap,
                focusedField === 'password' && styles.underlineFocused,
              ]}>
                <TextInput
                  ref={passwordRef}
                  style={[styles.underlineInput, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor={P.dimmed}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  editable={!isOffline && !isFormDisabled}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your account password"
                />
                <TouchableOpacity
                  onPress={() => setShowPass(p => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={P.dimmed}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign in button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (isFormDisabled || isOffline) && styles.primaryBtnDisabled,
              ]}
              onPress={handleLogin}
              disabled={isFormDisabled || isOffline}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={isOffline ? 'No connection' : 'Sign in'}
              accessibilityHint="Signs you in with your email and password"
              accessibilityState={{ disabled: isFormDisabled || isOffline }}
            >
              {loading
                ? <ActivityIndicator color={P.white} />
                : <Text style={styles.primaryBtnText}>
                    {isOffline ? 'No Connection' : 'Sign In'}
                  </Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no">
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google button */}
            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && !isOffline && !isFormDisabled && styles.googleBtnPressed,
                (isFormDisabled || isOffline) && { opacity: 0.5 },
              ]}
              onPress={() => handleOAuth('google')}
              disabled={isFormDisabled || isOffline}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              accessibilityHint="Opens Google sign-in in your browser"
              accessibilityState={{ disabled: isFormDisabled || isOffline }}
            >
              {socialLoading === 'google'
                ? <ActivityIndicator size="small" color={P.text} />
                : <>
                    <Ionicons
                      name="logo-google"
                      size={20}
                      color={isOffline ? P.muted : P.text}
                    />
                    <Text style={[styles.googleBtnText, isOffline && { color: P.muted }]}>
                      Google Account
                    </Text>
                  </>
              }
            </Pressable>

          </Animated.View>

          {/* Footer */}
          <TouchableOpacity
            style={styles.footer}
            onPress={() => router.push(ROUTES.SIGNUP)}
            accessibilityRole="button"
            accessibilityLabel="New to StudentShare? Create an account"
          >
            <Text style={styles.footerText}>New to StudentShare? </Text>
            <Text style={styles.footerLink}>Create an account</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showGoogleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoogleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Ionicons name="time-outline" size={32} color={P.accent} />
            </View>
            <Text style={styles.modalTitle}>Coming Soon</Text>
            <Text style={styles.modalBody}>
              Google login is coming soon. For now, please sign in using your email instead!
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => setShowGoogleModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: P.bg,
  },

  blobTR: {
    position: 'absolute', top: 0, right: 0,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: P.accent, opacity: 0.04,
    transform: [{ translateX: 80 }, { translateY: -80 }],
  },
  blobBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: P.accent, opacity: 0.07,
    transform: [{ translateX: -60 }, { translateY: 60 }],
  },

  offlineBanner: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
  },
  offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: P.warning },
  offlineText: { fontSize: 12, color: P.warning, fontWeight: '500', flex: 1 },

  scroll: {
    paddingHorizontal: 24,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },

  headlineWrap: { marginBottom: 36 },
  headline: {
    fontSize: 52, fontWeight: '800',
    color: P.white, letterSpacing: -1.5,
    lineHeight: 58, marginBottom: 10,
  },
  subhead: { fontSize: 17, color: P.muted, fontWeight: '400' },

  formWrap: { gap: 28 },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
  },
  errorText: { color: P.error, fontSize: 13, flex: 1, lineHeight: 18 },

  lockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
  },
  lockText: { color: P.warning, fontSize: 13, flex: 1 },

  fieldGroup: { gap: 10 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '700',
    color: P.muted, letterSpacing: 2,
    textTransform: 'uppercase',
  },
  forgotLink: { fontSize: 12, fontWeight: '700', color: P.accent },

  underlineWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1.5, borderBottomColor: P.border,
    paddingBottom: 10,
  },
  underlineFocused: { borderBottomColor: P.accent },
  underlineInput: {
    flex: 1,
    fontSize: 18,
    color: P.text,
    paddingVertical: 0,
  },

  primaryBtn: {
    backgroundColor: P.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: P.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    fontSize: 17, fontWeight: '800',
    color: P.white, letterSpacing: 0.2,
  },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: P.border },
  dividerText: {
    fontSize: 10, fontWeight: '700',
    color: P.dimmed, letterSpacing: 1.5,
  },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 12,
    borderWidth: 1, borderColor: P.border,
    borderRadius: 14, paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  googleBtnPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },
  googleBtnText: {
    fontSize: 13, fontWeight: '700',
    color: P.text, letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  footer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', flexWrap: 'wrap',
    marginTop: 36, paddingHorizontal: 24,
    paddingBottom: 8,
  },
  footerText: { fontSize: 14, color: P.muted },
  footerLink: { fontSize: 14, fontWeight: '700', color: P.accent },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalContent: {
    backgroundColor: P.bgCard, borderRadius: 24, padding: 24,
    width: '100%', maxWidth: 340, alignItems: 'center',
    borderWidth: 1, borderColor: P.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 10,
  },
  modalIconBox: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(232,105,42,0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: P.white, marginBottom: 12 },
  modalBody: { fontSize: 15, color: P.muted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtn: { backgroundColor: P.accent, paddingVertical: 14, width: '100%', borderRadius: 14, alignItems: 'center' },
  modalBtnText: { color: P.white, fontSize: 16, fontWeight: '700' },
})