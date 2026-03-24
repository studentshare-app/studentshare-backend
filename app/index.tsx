/**
 * app/index.tsx  — Entry point / Splash screen
 *
 * Flow:
 *   1. Animated splash plays (logo + tagline)
 *   2. _layout.tsx AuthGuard checks the session in the background
 *   3. Once resolved, AuthGuard redirects:
 *        Authenticated  → /(tabs)
 *        Unauthenticated → /(auth)/login
 *
 * Routing is never done here — this screen only shows the brand.
 *
 * Offline behaviour:
 *   - Session check reads AsyncStorage, so routing works with no network.
 *   - If the device is offline a subtle banner fades in after 1.5s so the
 *     user knows connectivity is limited — but the app still loads normally.
 */

import Constants from 'expo-constants'
import NetInfo from '@react-native-community/netinfo'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  bgDeep:   '#050D1A',
  bgCard:   '#0F2040',
  navy:     '#1A3A8F',
  blue:     '#2563EB',
  sky:      '#38BDF8',
  white:    '#FFFFFF',
  offWhite: '#E2EAF4',
  muted:    '#6B8CAE',
  border:   '#1E3A5F',
  warning:  '#F59E0B',
  warnBg:   'rgba(245,158,11,0.12)',
  warnBorder: 'rgba(245,158,11,0.35)',
} as const

// Version read from app.json — never hardcoded.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'

// Dot grid computed once at module load — not recreated on every render.
const DOT_POSITIONS = Array.from({ length: 48 }, (_, i) => ({
  cx: (i % 6) * 70 + 20,
  cy: Math.floor(i / 6) * 90 + 60,
}))

// ── Sub-components ────────────────────────────────────────────────────────────

function SignalArcs({
  size = 48,
  color = C.sky,
  opacity = 0.4,
}: {
  size?: number
  color?: string
  opacity?: number
}) {
  const s = size
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{
        width: s * 0.12, height: s * 0.12,
        borderRadius: 99, backgroundColor: color,
        opacity, marginBottom: 3,
      }} />
      <View style={{
        position: 'absolute', bottom: s * 0.14,
        width: s * 0.38, height: s * 0.38, borderRadius: 99,
        borderWidth: s * 0.055, borderColor: color,
        borderBottomColor: 'transparent', borderLeftColor: 'transparent',
        borderRightColor: 'transparent', opacity,
      }} />
      <View style={{
        position: 'absolute', bottom: s * 0.14,
        width: s * 0.65, height: s * 0.65, borderRadius: 99,
        borderWidth: s * 0.045, borderColor: color,
        borderBottomColor: 'transparent', borderLeftColor: 'transparent',
        borderRightColor: 'transparent', opacity: opacity * 0.65,
      }} />
      <View style={{
        position: 'absolute', bottom: s * 0.14,
        width: s * 0.92, height: s * 0.92, borderRadius: 99,
        borderWidth: s * 0.038, borderColor: color,
        borderBottomColor: 'transparent', borderLeftColor: 'transparent',
        borderRightColor: 'transparent', opacity: opacity * 0.35,
      }} />
    </View>
  )
}

function BookIcon({ size = 36 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size * 1.15, position: 'relative' }}>
      <View style={{
        position: 'absolute', left: size * 0.44,
        width: size * 0.1, height: size * 1.15,
        backgroundColor: C.sky, borderRadius: 3,
      }} />
      <View style={{
        position: 'absolute', left: 0, top: size * 0.06,
        width: size * 0.42, height: size * 1.05,
        backgroundColor: C.bgCard, borderWidth: 1.5,
        borderColor: C.sky, borderRadius: 3, opacity: 0.9,
      }} />
      <View style={{
        position: 'absolute', right: 0, top: size * 0.06,
        width: size * 0.42, height: size * 1.05,
        backgroundColor: C.bgCard, borderWidth: 1.5,
        borderColor: C.sky, borderRadius: 3, opacity: 0.9,
      }} />
      {[0.28, 0.44, 0.60].map((t, i) => (
        <View key={`l${i}`} style={{
          position: 'absolute', left: size * 0.06, top: size * t,
          width: size * 0.31, height: 1.5,
          backgroundColor: C.sky, opacity: 0.45,
        }} />
      ))}
      {[0.28, 0.44, 0.60].map((t, i) => (
        <View key={`r${i}`} style={{
          position: 'absolute', right: size * 0.06, top: size * t,
          width: size * 0.31, height: 1.5,
          backgroundColor: C.sky, opacity: 0.45,
        }} />
      ))}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SplashScreen() {
  const insets = useSafeAreaInsets()

  // ── Network state ─────────────────────────────────────────────────────────
  // We only show the offline banner after a short delay (1.5s) so it doesn't
  // flash briefly on fast connections or while the network check is pending.
  const [isOffline,     setIsOffline]     = useState(false)
  const [showOffline,   setShowOffline]   = useState(false)
  const offlineBannerOpacity             = useRef(new Animated.Value(0)).current
  const offlineCheckTimer                = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Get the initial network state immediately
    NetInfo.fetch().then(state => {
      setIsOffline(!(state.isConnected ?? true))
    })

    // Subscribe to changes for the duration of the splash
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!(state.isConnected ?? true))
    })

    return () => {
      unsubscribe()
      if (offlineCheckTimer.current) clearTimeout(offlineCheckTimer.current)
    }
  }, [])

  // Animate the offline banner in/out when isOffline changes
  useEffect(() => {
    if (offlineCheckTimer.current) clearTimeout(offlineCheckTimer.current)

    if (isOffline) {
      // Delay before showing — avoids a flash during normal startup
      offlineCheckTimer.current = setTimeout(() => {
        setShowOffline(true)
        Animated.timing(offlineBannerOpacity, {
          toValue: 1, duration: 400, useNativeDriver: true,
        }).start()
      }, 1500)
    } else {
      // Fade out immediately when back online
      Animated.timing(offlineBannerOpacity, {
        toValue: 0, duration: 300, useNativeDriver: true,
      }).start(() => setShowOffline(false))
    }
  // offlineBannerOpacity is a stable ref — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline])

  // ── Entrance animations ───────────────────────────────────────────────────
  const logoScale   = useRef(new Animated.Value(0.7)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const textY       = useRef(new Animated.Value(20)).current
  const tagOpacity  = useRef(new Animated.Value(0)).current
  const dotOpacity  = useRef(new Animated.Value(0)).current

  const dot1 = useRef(new Animated.Value(0.3)).current
  const dot2 = useRef(new Animated.Value(0.3)).current
  const dot3 = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoScale,   { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.back(1.6)) }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start()

    Animated.parallel([
      Animated.timing(textOpacity, { toValue: 1, delay: 400, duration: 500, useNativeDriver: true }),
      Animated.timing(textY,       { toValue: 0, delay: 400, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()

    Animated.timing(tagOpacity,  { toValue: 1, delay: 700, duration: 500, useNativeDriver: true }).start()
    Animated.timing(dotOpacity,  { toValue: 1, delay: 900, duration: 300, useNativeDriver: true }).start()

    // Store loop references so they can be stopped on unmount
    const loops: Animated.CompositeAnimation[] = []

    const pulseDot = (dot: Animated.Value, delay: number) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1,   delay, duration: 500, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3,        duration: 500, useNativeDriver: true }),
        ])
      )
      loops.push(loop)
      loop.start()
    }

    const dotTimer = setTimeout(() => {
      pulseDot(dot1, 0)
      pulseDot(dot2, 180)
      pulseDot(dot3, 360)
    }, 900)

    return () => {
      clearTimeout(dotTimer)
      loops.forEach(loop => loop.stop())
    }
  // Animated.Value refs are stable — safe empty deps array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      accessible
      accessibilityRole="none"
      accessibilityLabel={isOffline ? 'StudentShare is loading in offline mode' : 'StudentShare is loading'}
      accessibilityLiveRegion="polite"
    >
      {/* Background layers */}
      <View style={styles.bgLayer1} />
      <View style={styles.bgLayer2} />

      {/* Decorative arcs */}
      <View style={{ position: 'absolute', top: insets.top + 20, right: -10, opacity: 0.25 }}>
        <SignalArcs size={140} color={C.sky} opacity={1} />
      </View>
      <View style={{
        position: 'absolute', bottom: 100, left: -20,
        opacity: 0.15, transform: [{ rotate: '180deg' }],
      }}>
        <SignalArcs size={110} color={C.navy} opacity={1} />
      </View>

      {/* Dot grid — single SVG canvas, not 48 individual Views */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        {DOT_POSITIONS.map(({ cx, cy }, i) => (
          <Circle key={i} cx={cx} cy={cy} r={1.5} fill={C.sky} opacity={0.04} />
        ))}
      </Svg>

      {/* ── Logo ── */}
      <Animated.View
        style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel="StudentShare logo"
      >
        <View style={styles.logoGlow} />
        <View style={styles.logoBox}>
          <BookIcon size={34} />
          <View style={{ marginTop: 8, alignItems: 'center' }}>
            <SignalArcs size={40} color={C.sky} opacity={0.9} />
          </View>
        </View>
      </Animated.View>

      {/* ── App name ── */}
      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textY }], alignItems: 'center' }}>
        <Text style={styles.brand} accessibilityRole="header">
          StudentShare
        </Text>
      </Animated.View>

      {/* ── Tagline ── */}
      <Animated.View style={{ opacity: tagOpacity, alignItems: 'center', marginTop: 10 }}>
        <Text style={styles.tagline} accessibilityLabel="Learn, Share, Succeed">
          Learn · Share · Succeed
        </Text>
        <View style={styles.countryPill}>
          <Text style={styles.countryText}>🇸🇱  Built for Sierra Leone</Text>
        </View>
      </Animated.View>

      {/*
        ── Offline banner ──
        Only rendered once showOffline is true (after 1.5s delay).
        Fades in smoothly so it doesn't feel alarming.
        The message is reassuring — the app will still load using cached data.
      */}
      {showOffline && (
        <Animated.View
          style={[styles.offlineBanner, { opacity: offlineBannerOpacity }]}
          accessible
          accessibilityRole="alert"
          accessibilityLabel="No internet connection. Loading from saved data."
        >
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>
            No connection — loading from saved data
          </Text>
        </Animated.View>
      )}

      {/* ── Loading dots ── */}
      <Animated.View
        style={[styles.dotsRow, { opacity: dotOpacity }]}
        accessible
        accessibilityLabel="Loading"
        accessibilityRole="progressbar"
      >
        {[dot1, dot2, dot3].map((d, i) => (
          <Animated.View key={i} style={[styles.loadDot, { opacity: d }]} />
        ))}
      </Animated.View>

      {/* Version — hidden from screen readers, purely decorative */}
      <Text
        style={[styles.version, { bottom: insets.bottom + 16 }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        v{APP_VERSION}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgLayer1: {
    position: 'absolute', top: -120, right: -120,
    width: 420, height: 420, borderRadius: 210,
    backgroundColor: C.navy, opacity: 0.25,
  },
  bgLayer2: {
    position: 'absolute', bottom: -80, left: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: C.blue, opacity: 0.12,
  },

  logoWrap: { alignItems: 'center', marginBottom: 24, position: 'relative' },
  logoGlow: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: C.sky, opacity: 0.07, top: '50%', marginTop: -70,
  },
  logoBox: {
    width: 110, height: 110, borderRadius: 28,
    backgroundColor: C.bgCard, borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },

  brand: {
    fontSize: 34, fontWeight: '800',
    color: C.white, letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 15, color: C.muted,
    letterSpacing: 1.5, textTransform: 'uppercase',
    marginBottom: 14,
  },
  countryPill: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 100, paddingHorizontal: 16, paddingVertical: 7,
  },
  countryText: { fontSize: 13, color: C.muted, fontWeight: '600' },

  offlineBanner: {
    position: 'absolute',
    bottom: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.warnBg,
    borderWidth: 1,
    borderColor: C.warnBorder,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.warning,
  },
  offlineText: {
    fontSize: 12,
    color: C.warning,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  dotsRow: {
    position: 'absolute', bottom: 80,
    flexDirection: 'row', gap: 10,
  },
  loadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.sky,
  },

  version: {
    position: 'absolute',
    fontSize: 11, color: C.muted,
    letterSpacing: 1, opacity: 0.4,
  },
})