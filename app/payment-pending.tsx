import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  AppState,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { usePremium } from '../contexts/PremiumContext'   // ← NEW

const POLL_INTERVAL_MS = 4000   // check every 4 seconds
const MAX_POLLS        = 75     // give up after 5 minutes (75 × 4s)

export default function PaymentPendingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const pollCount  = useRef(0)
  const intervalId = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── CHANGED: pull refresh from context so all screens update instantly ───
  const { refresh: refreshPremium } = usePremium()
  // ────────────────────────────────────────────────────────────────────────

  const iconScale   = useRef(new Animated.Value(0.4)).current
  const iconOpacity = useRef(new Animated.Value(0)).current
  const ring1Scale  = useRef(new Animated.Value(0.6)).current
  const ring1Opacity = useRef(new Animated.Value(0)).current
  const ring2Scale  = useRef(new Animated.Value(0.7)).current
  const ring2Opacity = useRef(new Animated.Value(0)).current
  const titleOpacity = useRef(new Animated.Value(0)).current
  const titleY       = useRef(new Animated.Value(24)).current
  const cardOpacity  = useRef(new Animated.Value(0)).current
  const cardY        = useRef(new Animated.Value(32)).current
  const pulseAnim    = useRef(new Animated.Value(1)).current
  const spinAnim     = useRef(new Animated.Value(0)).current

  const [stepState, setStepState] = useState<'pending' | 'activated'>('pending')

  // ── Entrance animations ──────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(iconScale,   { toValue: 1, tension: 55, friction: 7,  useNativeDriver: true }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 350,             useNativeDriver: true }),
    ]).start()

    Animated.sequence([
      Animated.delay(150),
      Animated.parallel([
        Animated.spring(ring1Scale,   { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(ring1Opacity, { toValue: 1, duration: 400,            useNativeDriver: true }),
      ]),
    ]).start()

    Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.spring(ring2Scale,   { toValue: 1, tension: 45, friction: 9, useNativeDriver: true }),
        Animated.timing(ring2Opacity, { toValue: 1, duration: 400,            useNativeDriver: true }),
      ]),
    ]).start()

    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 500, delay: 400, useNativeDriver: true }),
      Animated.timing(titleY,       { toValue: 0, duration: 500, delay: 400, useNativeDriver: true }),
    ]).start()

    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, delay: 550, useNativeDriver: true }),
      Animated.timing(cardY,       { toValue: 0, duration: 500, delay: 550, useNativeDriver: true }),
    ]).start()

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
      ])
    ).start()

    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 8000, useNativeDriver: true })
    ).start()
  }, [])

  // ── Polling logic ────────────────────────────────────────────
  async function checkPremiumStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', user.id)
        .single()

      if (data?.is_premium === true) {
        stopPolling()
        // ── CHANGED: propagate to all mounted screens before navigating ──
        await refreshPremium()
        // ─────────────────────────────────────────────────────────────────
        router.replace('/payment_success' as any)
      }
    } catch (e) {
      // silently ignore network errors and keep polling
    }
  }

  function startPolling() {
    pollCount.current = 0
    intervalId.current = setInterval(() => {
      pollCount.current += 1
      if (pollCount.current > MAX_POLLS) {
        stopPolling()
        return
      }
      checkPremiumStatus()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (intervalId.current) {
      clearInterval(intervalId.current)
      intervalId.current = null
    }
  }

  useEffect(() => {
    // Start polling immediately when screen mounts
    checkPremiumStatus()
    startPolling()

    // Also re-check when user returns to the app from browser
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPremiumStatus()
      }
    })

    return () => {
      stopPolling()
      sub.remove()
    }
  }, [])

  const spin = spinAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const STEPS = [
    {
      icon:   'checkmark-circle' as const,
      color:  '#34D399',
      label:  'Payment submitted',
      sub:    'We received your payment request',
      done:   true,
      active: false,
    },
    {
      icon:   'time' as const,
      color:  '#FBBF24',
      label:  'Verification in progress',
      sub:    'Monime is confirming the transaction',
      done:   false,
      active: true,
    },
    {
      icon:   'flash' as const,
      color:  '#334155',
      label:  'Account activation',
      sub:    'Access unlocked automatically',
      done:   false,
      active: false,
    },
  ]

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      {/* Background orbs */}
      <View style={[styles.orb, { width: 320, height: 320, top: -130, left: -100, backgroundColor: '#FBBF24' }]} />
      <View style={[styles.orb, { width: 240, height: 240, bottom: -80, right: -80, backgroundColor: '#60A5FA' }]} />
      <View style={[styles.orb, { width: 160, height: 160, top: '40%', left: -60, backgroundColor: '#A78BFA' }]} />

      {/* ── Icon area ── */}
      <View style={styles.iconArea}>
        <Animated.View style={[styles.ring2, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }, { rotate: spin }] }]} />
        <Animated.View style={[styles.ring1, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]} />
        <Animated.View style={[styles.iconCore, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name="time" size={44} color="#FBBF24" />
          </Animated.View>
        </Animated.View>
      </View>

      {/* ── Title block ── */}
      <Animated.View style={[styles.titleBlock, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusPillText}>PROCESSING PAYMENT</Text>
        </View>
        <Text style={styles.title}>Payment Submitted!</Text>
        <Text style={styles.subtitle}>
          Your account will activate automatically once Monime confirms the transaction — usually within minutes.
        </Text>
      </Animated.View>

      {/* ── Steps & info ── */}
      <Animated.View style={[styles.bottomBlock, { opacity: cardOpacity, transform: [{ translateY: cardY }] }]}>
        <View style={styles.stepsCard}>
          {STEPS.map((step, i) => (
            <View key={i} style={[styles.stepRow, i < STEPS.length - 1 && styles.stepRowBorder]}>
              {i < STEPS.length - 1 && (
                <View style={[styles.connector, { backgroundColor: step.done ? '#34D399' : '#1A2640' }]} />
              )}
              <View style={[
                styles.stepIconBox,
                { backgroundColor: step.color + '15', borderColor: step.color + '30' },
                step.active && { borderColor: step.color + '60', backgroundColor: step.color + '20' },
              ]}>
                <Ionicons name={step.icon} size={17} color={step.done || step.active ? step.color : '#334155'} />
              </View>
              <View style={styles.stepTextBlock}>
                <Text style={[styles.stepLabel, !step.done && !step.active && styles.stepLabelMuted, step.active && styles.stepLabelActive]}>
                  {step.label}
                </Text>
                <Text style={[styles.stepSub, !step.done && !step.active && styles.stepSubMuted]}>
                  {step.sub}
                </Text>
              </View>
              {step.done && <Ionicons name="checkmark-circle" size={18} color="#34D399" />}
              {step.active && (
                <View style={styles.activeDot}>
                  <View style={styles.activeDotInner} />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Support card */}
        <TouchableOpacity
          style={styles.supportCard}
          onPress={() => Linking.openURL('https://wa.me/23234821670?text=Hi%2C%20I%20need%20help%20with%20my%20StudentShare%20payment')}
          activeOpacity={0.8}
        >
          <View style={styles.supportIconBox}>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
          </View>
          <Text style={styles.supportText}>
            No access after 1 hour?{' '}
            <Text style={styles.supportLink}>Contact us on WhatsApp</Text>
          </Text>
        </TouchableOpacity>

        {/* CTA */}
        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.88}
        >
          <Ionicons name="home-outline" size={17} color="#0F172A" />
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>Payments verified securely by Monime</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080E1A',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.06,
  },
  iconArea: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
  ring2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: '#FBBF2420',
    borderStyle: 'dashed',
  },
  ring1: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1.5,
    borderColor: '#FBBF2430',
    backgroundColor: '#FBBF2408',
  },
  iconCore: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#FBBF2418',
    borderWidth: 1.5,
    borderColor: '#FBBF2440',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FBBF2415',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FBBF2430',
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FBBF24',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -0.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  bottomBlock: {
    width: '100%',
  },
  stepsCard: {
    backgroundColor: '#0D1526',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1A2640',
    overflow: 'hidden',
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  stepRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A2640',
  },
  connector: {
    position: 'absolute',
    left: 29,
    bottom: -14,
    width: 1.5,
    height: 14,
    zIndex: 1,
  },
  stepIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  stepTextBlock: { flex: 1 },
  stepLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 2,
  },
  stepLabelMuted:   { color: '#334155' },
  stepLabelActive:  { color: '#FBBF24' },
  stepSub:          { fontSize: 12, color: '#475569' },
  stepSubMuted:     { color: '#1E3048' },
  activeDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FBBF2420',
    borderWidth: 1,
    borderColor: '#FBBF2450',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeDotInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FBBF24',
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0A1F0E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#14532D40',
    padding: 14,
    marginBottom: 16,
  },
  supportIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#25D36615',
    borderWidth: 1,
    borderColor: '#25D36630',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  supportText: {
    flex: 1,
    fontSize: 13,
    color: '#4ADE80',
    lineHeight: 20,
  },
  supportLink: {
    fontWeight: '700',
    color: '#34D399',
    textDecorationLine: 'underline',
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#FBBF24',
    borderRadius: 14,
    paddingVertical: 17,
    marginBottom: 14,
  },
  homeBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#1E3048',
  },
})