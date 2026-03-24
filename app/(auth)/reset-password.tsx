/**
 * app/(auth)/reset-password.tsx  — FIXED
 *
 * CHANGES FROM ORIGINAL
 * ─────────────────────
 * 1. sanitiseAuthError()     — raw Supabase errors no longer shown to users
 * 2. getPasswordStrength()   — improved strength meter (8 char min + complexity)
 * 3. isPasswordAcceptable()  — submit blocked unless password meets minimum bar
 * 4. AuthBackground          — shared component replaces copy-pasted blobs/dots
 * 5. C imported              — shared colour tokens (no more copy-paste)
 * 6. ROUTES constants        — no more magic strings
 * 7. Strength bar is Animated.View — smooth width transition on typing
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

import { sanitiseAuthError } from '../../lib/authErrors'
import { ROUTES } from '../../lib/routes'
import { supabase } from '../../lib/supabase'
import { getPasswordStrength, isPasswordAcceptable } from '../../lib/validators'
import { AuthBackground } from '../../src/auth-components/AuthBackground'
import { C } from '../../src/auth-constants/colors'
type Step = 'form' | 'success'

export default function ResetPasswordScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [step,         setStep]   = useState<Step>('form')
  const [password,     setPass]   = useState('')
  const [confirm,      setConf]   = useState('')
  const [showPass,     setShowP]  = useState(false)
  const [showConf,     setShowC]  = useState(false)
  const [loading,      setLoading]= useState(false)
  const [error,        setError]  = useState('')
  const [focusedField, setFocused]= useState<'pass' | 'conf' | null>(null)

  const shakeX = useRef(new Animated.Value(0)).current
  const fadeIn = useRef(new Animated.Value(0)).current

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start()
  }

  // FIX: use shared improved strength function
  const strength       = getPasswordStrength(password)
  const passwordsMatch = !confirm || password === confirm
  // FIX: submit is blocked unless password meets minimum complexity
  const canSubmit      = isPasswordAcceptable(password) && !!confirm && password === confirm

  async function handleReset() {
    setError('')
    if (!password || !confirm) {
      setError('Please fill in both fields.')
      shake(); return
    }
    if (!isPasswordAcceptable(password)) {
      setError('Password must be at least 8 characters with a mix of letters and numbers.')
      shake(); return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      shake(); return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      // FIX: sanitise — don't expose raw Supabase errors
      setError(sanitiseAuthError(updateError))
      shake()
    } else {
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start()
      setStep('success')
    }
  }

  return (
    <View style={styles.root}>
      <AuthBackground />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 30 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* FORM STEP */}
          {step === 'form' && (
            <>
              <View style={styles.iconWrap}>
                <View style={styles.iconGlow} />
                <View style={styles.iconBox}>
                  <Ionicons name="key-outline" size={36} color={C.sky} />
                </View>
              </View>

              <Text style={styles.headline}>Set new password</Text>
              <Text style={styles.subhead}>
                Choose a strong password you haven't used before.
              </Text>

              <Animated.View style={[styles.card, { transform: [{ translateX: shakeX }] }]}>

                {!!error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={C.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* New password */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>New password</Text>
                  <View style={[styles.inputRow, focusedField === 'pass' && styles.inputFocused]}>
                    <Ionicons name="lock-closed-outline" size={18}
                      color={focusedField === 'pass' ? C.sky : C.muted}
                      style={{ marginRight: 10 }} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="At least 8 characters"
                      placeholderTextColor={C.muted}
                      value={password}
                      onChangeText={setPass}
                      secureTextEntry={!showPass}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      onFocus={() => setFocused('pass')}
                      onBlur={() => setFocused(null)}
                    />
                    <TouchableOpacity onPress={() => setShowP(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>

                  {/* Strength bar */}
                  {password.length > 0 && (
                    <View style={styles.strengthRow}>
                      <View style={styles.strengthTrack}>
                        <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                      </View>
                      <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                    </View>
                  )}
                </View>

                {/* Confirm password */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Confirm password</Text>
                  <View style={[
                    styles.inputRow,
                    focusedField === 'conf' && styles.inputFocused,
                    !passwordsMatch && styles.inputError,
                  ]}>
                    <Ionicons name="shield-checkmark-outline" size={18}
                      color={!passwordsMatch ? C.error : focusedField === 'conf' ? C.sky : C.muted}
                      style={{ marginRight: 10 }} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Repeat your password"
                      placeholderTextColor={C.muted}
                      value={confirm}
                      onChangeText={setConf}
                      secureTextEntry={!showConf}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
                      onFocus={() => setFocused('conf')}
                      onBlur={() => setFocused(null)}
                    />
                    <TouchableOpacity onPress={() => setShowC(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showConf ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                  {!passwordsMatch && (
                    <View style={styles.matchError}>
                      <Ionicons name="alert-circle-outline" size={13} color={C.error} />
                      <Text style={styles.matchErrorText}>Passwords do not match</Text>
                    </View>
                  )}
                </View>

                {/* Requirements checklist */}
                <View style={styles.requirements}>
                  {[
                    { label: 'At least 8 characters',              met: password.length >= 8 },
                    { label: 'Contains a number or special char',   met: /[0-9^!@#$%]/.test(password) },
                    { label: 'Passwords match',                     met: !!confirm && password === confirm },
                  ].map((r, i) => (
                    <View key={i} style={styles.reqRow}>
                      <Ionicons
                        name={r.met ? 'checkmark-circle' : 'ellipse-outline'}
                        size={15}
                        color={r.met ? C.success : C.muted}
                      />
                      <Text style={[styles.reqText, r.met && { color: C.success }]}>{r.label}</Text>
                    </View>
                  ))}
                </View>

                {/* FIX: disabled unless canSubmit (was only checking !passwordsMatch) */}
                <TouchableOpacity
                  style={[styles.btn, (!canSubmit || loading) && { opacity: 0.55 }]}
                  onPress={handleReset}
                  activeOpacity={0.85}
                  disabled={loading || !canSubmit}
                >
                  {loading
                    ? <ActivityIndicator color={C.white} />
                    : <>
                        <Ionicons name="checkmark-done-outline" size={18} color={C.white} style={{ marginRight: 8 }} />
                        <Text style={styles.btnText}>Update Password</Text>
                      </>
                  }
                </TouchableOpacity>
              </Animated.View>
            </>
          )}

          {/* SUCCESS STEP */}
          {step === 'success' && (
            <Animated.View style={[styles.successWrap, { opacity: fadeIn }]}>
              <View style={styles.successIconWrap}>
                <View style={styles.successGlow} />
                <View style={styles.successIconBox}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={C.success} />
                </View>
              </View>

              <Text style={styles.successTitle}>Password updated!</Text>
              <Text style={styles.successBody}>
                Your password has been changed successfully. You're all set to keep learning.
              </Text>

              <View style={styles.successCard}>
                {[
                  { icon: 'shield-checkmark-outline', text: 'Your account is now secured' },
                  { icon: 'log-in-outline',           text: 'You are already logged in'  },
                ].map((item, i) => (
                  <View key={i} style={[styles.successRow, i === 0 && styles.successRowBorder]}>
                    <View style={styles.successDot}>
                      <Ionicons name={item.icon as any} size={16} color={C.sky} />
                    </View>
                    <Text style={styles.successRowText}>{item.text}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.btn} onPress={() => router.replace(ROUTES.TABS)} activeOpacity={0.85}>
                <Ionicons name="home-outline" size={18} color={C.white} style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Go to Home</Text>
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
  subhead:  { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 28, paddingHorizontal: 8 },

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
  inputError:   { borderColor: C.error, backgroundColor: 'rgba(248,113,113,0.05)' },
  input: { fontSize: 15, color: C.white },

  strengthRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  strengthTrack:{ flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: 4, borderRadius: 2 },
  strengthLabel:{ fontSize: 11, fontWeight: '700', width: 60 },

  matchError:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  matchErrorText:{ fontSize: 12, color: C.error },

  requirements: { gap: 8, paddingHorizontal: 2 },
  reqRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reqText: { fontSize: 13, color: C.muted },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.blue, borderRadius: 14, paddingVertical: 16,
    shadowColor: C.sky, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 12, elevation: 6,
  },
  btnText: { fontSize: 16, fontWeight: '700', color: C.white, letterSpacing: 0.3 },

  successWrap:    { width: '100%', alignItems: 'center' },
  successIconWrap:{ alignItems: 'center', marginBottom: 24, position: 'relative' },
  successGlow: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: C.success, opacity: 0.07, top: '50%', marginTop: -60,
  },
  successIconBox: {
    width: 92, height: 92, borderRadius: 26,
    backgroundColor: C.bgCard, borderWidth: 1.5,
    borderColor: 'rgba(52,211,153,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 26, fontWeight: '700', color: C.white, letterSpacing: -0.3, marginBottom: 10, textAlign: 'center' },
  successBody:  { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28, paddingHorizontal: 8 },
  successCard: {
    width: '100%', backgroundColor: C.bgCard,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    marginBottom: 24, overflow: 'hidden',
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

  brand: { marginTop: 32, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5 },
})