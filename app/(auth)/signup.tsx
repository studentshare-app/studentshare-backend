/**
 * app/(auth)/signup.tsx
 *
 * College/class selections are stored in AsyncStorage during signup —
 * the user has no Supabase session yet, so touching the profiles table
 * would cause the session check in college-selection to redirect to login.
 *
 * Draft keys (written by college-selection and class-selection in mode=signup):
 *   signup_draft_college_id   / signup_draft_college_name
 *   signup_draft_class_id     / signup_draft_class_name
 *
 * After signUp() succeeds, both IDs are written to profiles in one upsert,
 * then the draft is cleared.
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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

import { sanitiseAuthError }                                                        from '../../lib/authErrors'
import { ROUTES }                                                                   from '../../lib/routes'
import { supabase }                                                                 from '../../lib/supabase'
import { getPasswordStrength, isPasswordAcceptable, isValidEmail, isValidFullName } from '../../lib/validators'

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

// ── AsyncStorage draft keys (exported so selection screens can write them) ───
export const SIGNUP_COLLEGE_ID_KEY   = 'signup_draft_college_id'
export const SIGNUP_COLLEGE_NAME_KEY = 'signup_draft_college_name'
export const SIGNUP_CLASS_ID_KEY     = 'signup_draft_class_id'
export const SIGNUP_CLASS_NAME_KEY   = 'signup_draft_class_name'

async function clearSignupDraft() {
  await AsyncStorage.multiRemove([
    SIGNUP_COLLEGE_ID_KEY,
    SIGNUP_COLLEGE_NAME_KEY,
    SIGNUP_CLASS_ID_KEY,
    SIGNUP_CLASS_NAME_KEY,
  ]).catch(() => {})
}

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

// ── Animated entrance wrapper ─────────────────────────────────────────────────
function FadeSlide({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(18)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 440, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(translateY, { toValue: 0, duration: 440, delay, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>
}

// ── Password strength bar ─────────────────────────────────────────────────────
const SEGMENT_COLORS = ['#EF4444', '#F97316', '#FBBF24', '#10B981']
function StrengthBar({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <View style={sb.row}>
      {[1, 2, 3, 4].map(seg => (
        <View key={seg} style={[sb.segment, { backgroundColor: level >= seg ? SEGMENT_COLORS[seg - 1] : P.border }]} />
      ))}
    </View>
  )
}
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
  const [termsAccepted,   setTermsAccepted]   = useState(false)
  const [showTerms,       setShowTerms]       = useState(false)
  const [termsLoading,    setTermsLoading]    = useState(true)

  // Selections live in AsyncStorage — no session required
  const [collegeId,   setCollegeId]   = useState<string | null>(null)
  const [collegeName, setCollegeName] = useState<string | null>(null)
  const [classId,     setClassId]     = useState<string | null>(null)
  const [className,   setClassName]   = useState<string | null>(null)

  // Read draft every time the screen gains focus (user returns from picker)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      AsyncStorage.multiGet([
        SIGNUP_COLLEGE_ID_KEY,
        SIGNUP_COLLEGE_NAME_KEY,
        SIGNUP_CLASS_ID_KEY,
        SIGNUP_CLASS_NAME_KEY,
      ]).then(pairs => {
        if (cancelled) return
        setCollegeId(pairs[0][1])
        setCollegeName(pairs[1][1])
        setClassId(pairs[2][1])
        setClassName(pairs[3][1])
      }).catch(() => {})
      return () => { cancelled = true }
    }, []),
  )

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

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSignUp() {
    if (!canSubmit) return
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email:   email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })

    if (error) {
      setLoading(false)
      Alert.alert('Sign Up Failed', sanitiseAuthError(error))
      return
    }

    // Write college, class, and terms to profile in one upsert
    if (data.user) {
      try {
        await supabase.from('profiles').upsert({
          id:                data.user.id,
          college_id:        collegeId,
          class_id:          classId,
          terms_accepted_at: new Date().toISOString(),
          terms_version:     TERMS_VERSION,
        })
      } catch { /* non-critical — account is created */ }
    }

    await clearSignupDraft()
    setLoading(false)

    if (!data.session) {
      Alert.alert(
        '📬 Check your inbox!',
        `We've sent a confirmation link to ${email.trim().toLowerCase()}. Click it to activate your account, then come back and log in.`,
        [{ text: 'OK', onPress: () => router.replace(ROUTES.LOGIN) }],
      )
    } else {
      router.replace(ROUTES.TABS)
    }
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────
  async function handleGoogle() {
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'studentshare://auth/callback', skipBrowserRedirect: true },
      })
      if (oauthError || !data.url) {
        Alert.alert('Error', sanitiseAuthError(oauthError ?? { message: 'Could not start sign-in.' }))
        return
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, 'studentshare://auth/callback')
      if (result.type === 'success' && result.url) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url)
        if (!exchangeError) { router.replace(ROUTES.TABS); return }
      }
    } catch (err: unknown) {
      if (__DEV__) console.error('[Google OAuth]', err)
      Alert.alert('Error', 'Sign-in failed. Please try again.')
    }
  }

  // ── Pickers ───────────────────────────────────────────────────────────────
  function goToCollegePicker() {
    router.push({ pathname: ROUTES.COLLEGE_SELECTION, params: { mode: 'signup' } } as any)
  }

  function goToClassPicker() {
    if (!collegeId) {
      Alert.alert('Select college first', 'Please choose your college before selecting a class.')
      return
    }
    router.push({ pathname: '/(auth)/class-selection', params: { college_id: collegeId, mode: 'signup' } } as any)
  }

  return (
    <View style={styles.root}>
      <View style={styles.blobTR} />
      <View style={styles.blobBL} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back → onboarding (no stack history to go back to) */}
          <FadeSlide delay={0}>
            <View style={styles.pageHeader}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.replace(ROUTES.ONBOARDING)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="arrow-back" size={22} color={P.text} />
              </TouchableOpacity>
            </View>
          </FadeSlide>

          <FadeSlide delay={60}>
            <View style={styles.headlineWrap}>
              <Text style={styles.headline}>Join StudentShare</Text>
              <Text style={styles.subhead}>Connect with peers, share resources, and excel together at your university.</Text>
            </View>
          </FadeSlide>

          <FadeSlide delay={100}>
            <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} activeOpacity={0.8}>
              <Ionicons name="logo-google" size={20} color={P.text} />
              <Text style={styles.googleBtnText}>Sign up with Google</Text>
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
                <TextInput style={styles.fieldInput} placeholder="Alex Johnson" placeholderTextColor={P.dimmed} value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" onFocus={() => setFocused('name')} onBlur={() => setFocused(null)} />
                {isValidFullName(fullName) && <Ionicons name="checkmark-circle" size={18} color={P.success} />}
              </View>
            </View>
          </FadeSlide>

          {/* Email */}
          <FadeSlide delay={220}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <View style={[styles.fieldBox, focused === 'email' && styles.fieldBoxFocused]}>
                <TextInput style={styles.fieldInput} placeholder="name@gmail.com" placeholderTextColor={P.dimmed} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} />
                {isValidEmail(email) && <Ionicons name="checkmark-circle" size={18} color={P.success} />}
              </View>
            </View>
          </FadeSlide>

          {/* Password */}
          <FadeSlide delay={260}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={[styles.fieldBox, focused === 'password' && styles.fieldBoxFocused]}>
                <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="••••••••" placeholderTextColor={P.dimmed} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              <View style={[styles.fieldBox, focused === 'confirm' && styles.fieldBoxFocused, !passwordsMatch && styles.fieldBoxError]}>
                <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="••••••••" placeholderTextColor={P.dimmed} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showConfirm} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" onFocus={() => setFocused('confirm')} onBlur={() => setFocused(null)} />
                <TouchableOpacity onPress={() => setShowConfirm(p => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={19} color={P.muted} />
                </TouchableOpacity>
              </View>
              {!passwordsMatch && <Text style={styles.matchError}>Passwords do not match</Text>}
              {!!confirmPassword && passwordsMatch && <Text style={styles.matchOk}>Passwords match</Text>}
            </View>
          </FadeSlide>

          {/* College picker */}
          <FadeSlide delay={340}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>COLLEGE</Text>
              <TouchableOpacity style={[styles.pickerRow, !!collegeName && styles.pickerRowSelected]} onPress={goToCollegePicker} activeOpacity={0.8}>
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
                style={[styles.pickerRow, !!className && styles.pickerRowSelected, !collegeId && styles.pickerRowDisabled]}
                onPress={goToClassPicker}
                activeOpacity={0.8}
              >
                <View style={[styles.pickerIconBox, !!className && styles.pickerIconBoxSelected]}>
                  <Ionicons name="people-outline" size={18} color={className ? P.accent : !collegeId ? P.dimmed : P.muted} />
                </View>
                <Text style={[styles.pickerText, !!className && styles.pickerTextSelected, !collegeId && styles.pickerTextDisabled]} numberOfLines={1}>
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
            <TouchableOpacity style={styles.termsRow} onPress={() => setTermsAccepted(p => !p)} activeOpacity={0.8}>
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Ionicons name="checkmark" size={12} color={P.white} />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink} onPress={() => { setTermsLoading(true); setShowTerms(true) }}>Terms of Service</Text>
              </Text>
            </TouchableOpacity>
          </FadeSlide>

          {/* CTA */}
          <FadeSlide delay={460}>
            <TouchableOpacity style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]} onPress={handleSignUp} disabled={!canSubmit} activeOpacity={0.88}>
              {loading
                ? <ActivityIndicator color={P.white} />
                : (
                  <View style={styles.primaryBtnInner}>
                    <Text style={styles.primaryBtnText}>Create Account</Text>
                    <View style={styles.primaryBtnArrow}>
                      <Ionicons name="arrow-forward" size={16} color={canSubmit ? P.accent : P.muted} />
                    </View>
                  </View>
                )
              }
            </TouchableOpacity>
          </FadeSlide>

          <FadeSlide delay={500}>
            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.replace(ROUTES.LOGIN)}>
                <Text style={styles.loginLink}>Log in →</Text>
              </TouchableOpacity>
            </View>
          </FadeSlide>

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
      <Modal visible={showTerms} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTerms(false)}>
        <SafeAreaView style={styles.termsModal}>
          <View style={styles.termsHeader}>
            <View>
              <Text style={styles.termsHeaderTitle}>Terms of Service</Text>
              <Text style={styles.termsHeaderSub}>StudentShare · Sierra Leone</Text>
            </View>
            <TouchableOpacity style={styles.termsCloseBtn} onPress={() => setShowTerms(false)}>
              <Ionicons name="close" size={18} color="#0F172A" />
            </TouchableOpacity>
          </View>
          {termsLoading && (
            <View style={styles.termsLoader}>
              <ActivityIndicator size="large" color={P.accent} />
            </View>
          )}
          <WebView source={{ html: TERMS_HTML }} style={{ flex: 1, backgroundColor: '#F8FAFC' }} onLoadEnd={() => setTermsLoading(false)} showsVerticalScrollIndicator={false} />
          <View style={styles.termsFooter}>
            <TouchableOpacity style={styles.termsAgreeBtn} onPress={() => { setTermsAccepted(true); setShowTerms(false) }}>
              <Ionicons name="checkmark-circle-outline" size={18} color={P.white} />
              <Text style={styles.termsAgreeBtnText}>I Accept — Close</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  blobTR: { position: 'absolute', top: 0, right: 0, width: 280, height: 280, borderRadius: 140, backgroundColor: P.accent, opacity: 0.04, transform: [{ translateX: 80 }, { translateY: -80 }] },
  blobBL: { position: 'absolute', bottom: 0, left: 0, width: 200, height: 200, borderRadius: 100, backgroundColor: P.accent, opacity: 0.06, transform: [{ translateX: -60 }, { translateY: 60 }] },
  scroll: { paddingHorizontal: 24, maxWidth: 440, width: '100%', alignSelf: 'center' },
  pageHeader: { marginBottom: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: P.border, justifyContent: 'center', alignItems: 'center' },
  headlineWrap: { marginBottom: 28 },
  headline: { fontSize: 36, fontWeight: '800', color: P.text, letterSpacing: -0.8, marginBottom: 8 },
  subhead:  { fontSize: 15, color: P.muted, lineHeight: 22 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, height: 54, backgroundColor: P.bgCard, borderWidth: 1.5, borderColor: P.border, borderRadius: 14, marginBottom: 24 },
  googleBtnText: { fontSize: 13, fontWeight: '700', color: P.text, letterSpacing: 1.5, textTransform: 'uppercase' },
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
  termsRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 20, paddingTop: 4 },
  checkbox:        { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: P.border, backgroundColor: P.bgCard, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: P.accent, borderColor: P.accent },
  termsText:       { flex: 1, fontSize: 13, color: P.muted, lineHeight: 20 },
  termsLink:       { color: P.accent, fontWeight: '700' },
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