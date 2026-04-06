import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PERKS = [
  { icon: 'download-outline'           as const, color: '#60A5FA', label: 'Offline Downloads',       sub: 'Save materials for offline use'        },
  { icon: 'documents-outline'          as const, color: '#FBBF24', label: 'All Study Materials',      sub: 'Past questions, slides & notes'        },
  { icon: 'sparkles-outline'           as const, color: '#A78BFA', label: 'AI Study Assistant',       sub: 'Ask anything, get instant answers'     },
  { icon: 'play-circle-outline'        as const, color: '#34D399', label: 'Full Video Library',       sub: 'Every lesson, every subject'           },
  { icon: 'book-outline'               as const, color: '#F87171', label: 'Complete Textbooks',       sub: 'All books, no restrictions'            },
  { icon: 'checkmark-done-circle-outline' as const, color: '#FB923C', label: 'Worked Solutions',     sub: 'Step-by-step answers & explanations'   },
]

export default function PaymentSuccessScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Core icon animations
  const iconScale    = useRef(new Animated.Value(0)).current
  const iconOpacity  = useRef(new Animated.Value(0)).current
  const ring1Scale   = useRef(new Animated.Value(0.5)).current
  const ring1Opacity = useRef(new Animated.Value(0)).current
  const ring2Scale   = useRef(new Animated.Value(0.5)).current
  const ring2Opacity = useRef(new Animated.Value(0)).current
  const ring3Scale   = useRef(new Animated.Value(0.5)).current
  const ring3Opacity = useRef(new Animated.Value(0)).current

  // Text animations
  const badgeOpacity  = useRef(new Animated.Value(0)).current
  const badgeY        = useRef(new Animated.Value(-12)).current
  const titleOpacity  = useRef(new Animated.Value(0)).current
  const titleScale    = useRef(new Animated.Value(0.9)).current
  const subOpacity    = useRef(new Animated.Value(0)).current

  // Perks list animation
  const perksOpacity = useRef(new Animated.Value(0)).current
  const perksY       = useRef(new Animated.Value(24)).current

  // CTA animation
  const ctaOpacity = useRef(new Animated.Value(0)).current
  const ctaY       = useRef(new Animated.Value(20)).current

  // Continuous glow pulse
  const glowPulse = useRef(new Animated.Value(0.6)).current
  const starSpin  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // 1. Icon burst entrance
    Animated.parallel([
      Animated.spring(iconScale,   { toValue: 1, tension: 60, friction: 6,  useNativeDriver: true }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 300,              useNativeDriver: true }),
    ]).start()

    // 2. Rings staggered outward
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(ring1Scale,   { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(ring1Opacity, { toValue: 1, duration: 350,            useNativeDriver: true }),
      ]),
    ]).start()

    Animated.sequence([
      Animated.delay(220),
      Animated.parallel([
        Animated.spring(ring2Scale,   { toValue: 1, tension: 44, friction: 9, useNativeDriver: true }),
        Animated.timing(ring2Opacity, { toValue: 1, duration: 380,            useNativeDriver: true }),
      ]),
    ]).start()

    Animated.sequence([
      Animated.delay(330),
      Animated.parallel([
        Animated.spring(ring3Scale,   { toValue: 1, tension: 38, friction: 10, useNativeDriver: true }),
        Animated.timing(ring3Opacity, { toValue: 0.4, duration: 400,           useNativeDriver: true }),
      ]),
    ]).start()

    // 3. Badge drop-in
    Animated.parallel([
      Animated.timing(badgeOpacity, { toValue: 1, duration: 400, delay: 300, useNativeDriver: true }),
      Animated.spring(badgeY,       { toValue: 0, tension: 60, friction: 8,  useNativeDriver: true, delay: 300 }),
    ]).start()

    // 4. Title
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 450, delay: 420, useNativeDriver: true }),
      Animated.spring(titleScale,   { toValue: 1, tension: 55, friction: 7,  useNativeDriver: true, delay: 420 }),
    ]).start()

    // 5. Subtitle
    Animated.timing(subOpacity, { toValue: 1, duration: 400, delay: 560, useNativeDriver: true }).start()

    // 6. Perks list
    Animated.parallel([
      Animated.timing(perksOpacity, { toValue: 1, duration: 500, delay: 680, useNativeDriver: true }),
      Animated.timing(perksY,       { toValue: 0, duration: 500, delay: 680, useNativeDriver: true }),
    ]).start()

    // 7. CTA
    Animated.parallel([
      Animated.timing(ctaOpacity, { toValue: 1, duration: 400, delay: 850, useNativeDriver: true }),
      Animated.timing(ctaY,       { toValue: 0, duration: 400, delay: 850, useNativeDriver: true }),
    ]).start()

    // Continuous glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1,   duration: 1800, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.6, duration: 1800, useNativeDriver: true }),
      ])
    ).start()

    // Star slow spin
    Animated.loop(
      Animated.timing(starSpin, { toValue: 1, duration: 12000, useNativeDriver: true })
    ).start()
  }, [])

  const starRotate = starSpin.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Background orbs */}
      <View style={[styles.orb, { width: 380, height: 380, top: -160, left: -120, backgroundColor: '#34D399' }]} />
      <View style={[styles.orb, { width: 260, height: 260, bottom: -60, right: -80, backgroundColor: '#60A5FA' }]} />
      <View style={[styles.orb, { width: 180, height: 180, top: '35%', right: -60, backgroundColor: '#FBBF24' }]} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Icon area ── */}
        <View style={styles.iconArea}>
          {/* Outermost ring */}
          <Animated.View style={[styles.ring3, { opacity: ring3Opacity, transform: [{ scale: ring3Scale }] }]} />
          {/* Middle ring */}
          <Animated.View style={[styles.ring2, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] }]} />
          {/* Inner ring */}
          <Animated.View style={[styles.ring1, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]} />

          {/* Glow layer */}
          <Animated.View style={[styles.glowLayer, { opacity: glowPulse }]} />

          {/* Icon core */}
          <Animated.View style={[styles.iconCore, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
            <Animated.View style={{ transform: [{ rotate: starRotate }] }}>
              <Ionicons name="star" size={46} color="#34D399" />
            </Animated.View>
          </Animated.View>
        </View>

        {/* ── Badge ── */}
        <Animated.View style={[styles.badge, { opacity: badgeOpacity, transform: [{ translateY: badgeY }] }]}>
          <Ionicons name="checkmark-circle" size={14} color="#34D399" />
          <Text style={styles.badgeText}>PAYMENT CONFIRMED</Text>
        </Animated.View>

        {/* ── Title ── */}
        <Animated.Text style={[styles.title, { opacity: titleOpacity, transform: [{ scale: titleScale }] }]}>
          You're Premium!
        </Animated.Text>

        <Animated.Text style={[styles.subtitle, { opacity: subOpacity }]}>
          Full access is now unlocked. Everything StudentShare has to offer is yours.
        </Animated.Text>

        {/* ── Perks grid ── */}
        <Animated.View style={[styles.perksBlock, { opacity: perksOpacity, transform: [{ translateY: perksY }] }]}>
          <Text style={styles.perksLabel}>YOUR PREMIUM PERKS</Text>
          <View style={styles.perksCard}>
            {PERKS.map((perk, i) => (
              <View key={i} style={[styles.perkRow, i < PERKS.length - 1 && styles.perkRowBorder]}>
                <View style={[styles.perkIconBox, { backgroundColor: perk.color + '18', borderColor: perk.color + '35' }]}>
                  <Ionicons name={perk.icon} size={18} color={perk.color} />
                </View>
                <View style={styles.perkText}>
                  <Text style={styles.perkLabel}>{perk.label}</Text>
                  <Text style={styles.perkSub}>{perk.sub}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={16} color="#34D399" />
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── CTA ── */}
        <Animated.View style={[styles.ctaBlock, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.88}
          >
            <Ionicons name="rocket-outline" size={18} color="#0F172A" />
            <Text style={styles.ctaBtnText}>Start Exploring</Text>
            <Ionicons name="arrow-forward" size={18} color="#0F172A" />
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            Secured & verified by Monime · StudentShare Premium
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080E1A',
  },
  scroll: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.07,
  },

  // ── Icon ──
  iconArea: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  ring3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: '#34D39918',
  },
  ring2: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1.5,
    borderColor: '#34D39930',
    backgroundColor: '#34D39906',
  },
  ring1: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: '#34D39945',
    backgroundColor: '#34D39910',
  },
  glowLayer: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#34D399',
    opacity: 0.12,
  },
  iconCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#34D39920',
    borderWidth: 2,
    borderColor: '#34D39950',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Badge ──
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#34D39915',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#34D39935',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 1.8,
  },

  // ── Title ──
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -1.2,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 12,
    marginBottom: 32,
  },

  // ── Perks ──
  perksBlock: {
    width: '100%',
    marginBottom: 28,
  },
  perksLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 2,
    marginBottom: 12,
    paddingLeft: 2,
  },
  perksCard: {
    backgroundColor: '#0D1526',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1A2640',
    overflow: 'hidden',
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  perkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1A2640',
  },
  perkIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  perkText: { flex: 1 },
  perkLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 2,
  },
  perkSub: {
    fontSize: 12,
    color: '#475569',
  },

  // ── CTA ──
  ctaBlock: {
    width: '100%',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#34D399',
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 16,
  },
  ctaBtnText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#1E3048',
  },
})
