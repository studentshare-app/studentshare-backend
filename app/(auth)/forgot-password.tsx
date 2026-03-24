/**
 * app/(auth)/forgot-password.tsx  — FIXED
 *
 * CHANGES FROM ORIGINAL
 * ─────────────────────
 * 1. sanitiseAuthError()  — raw Supabase errors no longer shown to users
 * 2. isValidEmail()       — shared validator (was duplicated inline regex)
 * 3. AuthBackground       — shared component replaces copy-pasted blobs/dots
 * 4. C imported           — shared colour tokens (no more copy-paste)
 * 5. ROUTES constants     — no more magic strings
 * 6. Rate limiting on resend — prevents using the resend button for spam
 */

import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { supabase }           from '../../lib/supabase'
import { sanitiseAuthError }  from '../../lib/authErrors'
import { ROUTES }             from '../../lib/routes'
import { isValidEmail }       from '../../lib/validators'
import { C } from '../../src/auth-constants/colors'
import { AuthBackground } from '../../src/auth-components/AuthBackground'

type Step = 'request' | 'sent'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [step,    setStep]    = useState<Step>('request')
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [focused, setFocused] = useState(false)

  // Resend cooldown — prevents abuse of the resend button
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const shakeX = useRef(new Animated.Value(0)).current
  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start()
  }

  const fadeIn = useRef(new Animated.Value(0)).current

  function startResendCooldown(seconds = 60) {
    setResendCooldown(seconds)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleSendReset() {
    setError('')
    if (!email.trim()) {
      setError('Please enter your email address.')
      shake(); return
    }
    // FIX: use shared validator
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.')
      shake(); return
    }
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: 'studentshare://reset-password' }
    )
    setLoading(false)

    if (resetError) {
      // FIX: sanitise — never expose raw Supabase errors
      setError(sanitiseAuthError(resetError))
      shake()
    } else {
      setStep('sent')
      startResendCooldown(60)
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setStep('request')
    setError('')
  }

  return (
    <View style={styles.root}>
      <AuthBackground />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={C.sky} />
            <Text style={styles.backText}>Back to login</Text>
          </TouchableOpacity>

          {/* STEP 1: request */}
          {step === 'request' && (
            <>
              <View style={styles.iconWrap}>
                <View style={styles.iconGlow} />
                <View style={styles.iconBox}>
                  <Ionicons name="lock-open-outline" size={34} color={C.sky} />
                </View>
              </View>

              <Text style={styles.headline}>Forgot password?</Text>
              <Text style={styles.subhead}>
                No worries — enter your email and we'll send you a reset link instantly.
              </Text>

              <Animated.View style={[styles.card, { transform: [{ translateX: shakeX }] }]}>
                {!!error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={C.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Email address</Text>
                  <View style={[styles.inputRow, focused && styles.inputFocused]}>
                    <Ionicons name="mail-outline" size={18} color={focused ? C.sky : C.muted} style={{ marginRight: 10 }} />
                    <TextInput
                      style={styles.input}
                      placeholder="you@email.com"
                      placeholderTextColor={C.muted}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      textContentType="emailAddress"
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                    />
                    {/* FIX: use isValidEmail for checkmark */}
                    {isValidEmail(email) && (
                      <Ionicons name="checkmark-circle" size={18} color={C.success} style={{ marginLeft: 6 }} />
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.btn, loading && { opacity: 0.75 }]}
                  onPress={handleSendReset}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color={C.white} />
                    : <>
                        <Ionicons name="paper-plane-outline" size={18} color={C.white} style={{ marginRight: 8 }} />
                        <Text style={styles.btnText}>Send Reset Link</Text>
                      </>
                  }
                </TouchableOpacity>

                <Text style={styles.helperNote}>
                  Check your spam folder if you don't see it within a minute.
                </Text>
              </Animated.View>
            </>
          )}

          {/* STEP 2: sent confirmation */}
          {step === 'sent' && (
            <Animated.View style={[styles.successWrap, { opacity: fadeIn }]}>
              <View style={styles.successIconWrap}>
                <View style={styles.successIconGlow} />
                <View style={styles.successIconBox}>
                  <Ionicons name="mail-unread-outline" size={42} color={C.success} />
                </View>
              </View>

              <Text style={styles.successTitle}>Check your inbox</Text>
              <Text style={styles.successBody}>
                We sent a password reset link to{'\n'}
                <Text style={styles.successEmail}>{email}</Text>
              </Text>

              <View style={styles.successCard}>
                {[
                  { icon: 'time-outline',          text: 'Link expires in 60 minutes' },
                  { icon: 'mail-outline',           text: 'Check your spam folder too' },
                  { icon: 'phone-portrait-outline', text: 'Open the link on this device' },
                ].map((item, i) => (
                  <View key={i} style={[styles.successRow, i < 2 && styles.successRowBorder]}>
                    <View style={styles.successDot}>
                      <Ionicons name={item.icon as any} size={16} color={C.sky} />
                    </View>
                    <Text style={styles.successRowText}>{item.text}</Text>
                  </View>
                ))}
              </View>

              {/* FIX: resend with cooldown to prevent abuse */}
              <TouchableOpacity
                style={[styles.resendBtn, resendCooldown > 0 && { opacity: 0.5 }]}
                onPress={handleResend}
                disabled={resendCooldown > 0}
              >
                <Ionicons name="refresh-outline" size={16} color={resendCooldown > 0 ? C.muted : C.sky} style={{ marginRight: 6 }} />
                <Text style={[styles.resendText, resendCooldown > 0 && { color: C.muted }]}>
                  {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend email'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} onPress={() => router.replace(ROUTES.LOGIN)} activeOpacity={0.85}>
                <Ionicons name="arrow-back" size={18} color={C.white} style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Back to Login</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Text style={styles.brand}>StudentShare</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bgDeep },
  scroll: { alignItems: 'center', paddingHorizontal: 24 },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: 32,
    paddingVertical: 6, paddingHorizontal: 2,
  },
  backText: { fontSize: 14, color: C.sky, fontWeight: '600' },

  iconWrap: { alignItems: 'center', marginBottom: 24, position: 'relative' },
  iconGlow: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: C.sky, opacity: 0.08, top: '50%', marginTop: -55,
  },
  iconBox: {
    width: 84, height: 84, borderRadius: 24,
    backgroundColor: C.bgCard, borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },

  headline: { fontSize: 28, fontWeight: '700', color: C.white, letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  subhead:  { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 30, paddingHorizontal: 8 },

  card: {
    width: '100%', backgroundColor: C.bgCard,
    borderRadius: 24, borderWidth: 1, borderColor: C.border,
    padding: 24, gap: 16,
  },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(248,113,113,0.1)', borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  errorText: { color: C.error, fontSize: 13, flex: 1, lineHeight: 18 },

  fieldWrap: { gap: 8 },
  label:     { fontSize: 13, fontWeight: '600', color: C.offWhite, letterSpacing: 0.2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bgMid, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputFocused: { borderColor: C.sky, backgroundColor: '#0D1E3A' },
  input: { flex: 1, fontSize: 15, color: C.white },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.blue, borderRadius: 14, paddingVertical: 16,
    shadowColor: C.sky, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  btnText: { fontSize: 16, fontWeight: '700', color: C.white, letterSpacing: 0.3 },

  helperNote: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 17, paddingHorizontal: 4 },

  successWrap:    { width: '100%', alignItems: 'center' },
  successIconWrap:{ alignItems: 'center', marginBottom: 24, position: 'relative' },
  successIconGlow: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: C.success, opacity: 0.07, top: '50%', marginTop: -60,
  },
  successIconBox: {
    width: 90, height: 90, borderRadius: 26,
    backgroundColor: C.bgCard, borderWidth: 1.5,
    borderColor: 'rgba(52,211,153,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 26, fontWeight: '700', color: C.white, letterSpacing: -0.3, marginBottom: 10, textAlign: 'center' },
  successBody:  { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  successEmail: { color: C.skyLight, fontWeight: '700' },

  successCard: {
    width: '100%', backgroundColor: C.bgCard,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    marginBottom: 20, overflow: 'hidden',
  },
  successRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
  },
  successRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  successDot: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(56,189,248,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  successRowText: { fontSize: 14, color: C.offWhite, flex: 1 },

  resendBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingVertical: 4 },
  resendText: { fontSize: 14, color: C.sky, fontWeight: '600' },

  brand: { marginTop: 32, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5 },
})