/**
 * app/(auth)/onboarding.tsx  —  PRODUCTION-READY
 *
 * CHANGES IN THIS VERSION
 * ────────────────────────
 * • Hero: real Unsplash image (African university students, professional/academic)
 *   with a dark gradient overlay so text/UI above it pops
 * • Headline: reduced from 40 → 28px, single line, no wasted vertical space
 * • Carousel cards: reduced padding (16), smaller icon badge (40px),
 *   smaller fonts — all content visible without clipping on any card height
 * • Layout: wrapped in ScrollView so nothing is hidden on small screens
 *   (iPhone SE, small Android). FlatList inside ScrollView is fine here
 *   because the FlatList is horizontal with a fixed height.
 * • useWindowDimensions instead of Dimensions.get() — responds to orientation
 * • Dots: tighter margins (marginTop 10, marginBottom 2)
 * • Actions: paddingTop reduced to 10
 * • Subhead removed — headline is already compact, subhead added visual noise
 * • Tagline hidden on very small screens (height < 680) to save space
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  FlatList,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ROUTES } from '@/core/config/routes'

// ── Storage key ───────────────────────────────────────────────────────────────
export const ONBOARDING_KEY = 'onboarding_complete'

// ── Palette — identical to login.tsx ─────────────────────────────────────────
const P = {
  bg:     '#07080C',
  bgCard: '#10131C',
  border: '#161B27',
  dimmed: '#353D52',
  text:   '#EEF0F8',
  muted:  '#6E7A96',
  accent: '#E8692A',
  white:  '#FFFFFF',
}

// ── Hero image — African university students, professional academic setting ───
// Unsplash: group of African university students studying together on campus
const HERO_URI =
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&q=80'
//  ↑ "students studying together" — diverse, professional, campus setting.
//  Replace with your own asset:
//    source={require('../../assets/images/onboarding-hero.png')}

// ── Types ─────────────────────────────────────────────────────────────────────
type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type Feature = {
  id: string
  tag: string
  title: string
  description: string
  icon: IoniconsName
  accentColor: string
}

// ── Feature data ──────────────────────────────────────────────────────────────
const FEATURES: Feature[] = [
  {
    id: '1',
    tag: 'Intelligence',
    title: 'AI Tutoring',
    description: 'Personalised 24/7 support tailored to your curriculum and learning style.',
    icon: 'bulb-outline',
    accentColor: P.accent,
  },
  {
    id: '2',
    tag: 'Collaboration',
    title: 'Peer Notes',
    description: 'Curated study materials shared by top-performing students at your college.',
    icon: 'document-text-outline',
    accentColor: '#818CF8',
  },
  {
    id: '3',
    tag: 'Community',
    title: 'Campus Hub',
    description: 'Connect with your university community and find the right study groups.',
    icon: 'school-outline',
    accentColor: '#34D399',
  },
  {
    id: '4',
    tag: 'Organisation',
    title: 'Smart Planner',
    description: 'Study schedules that adapt automatically to your exam dates and deadlines.',
    icon: 'calendar-outline',
    accentColor: '#FBBF24',
  },
  {
    id: '5',
    tag: 'Resources',
    title: 'Digital Library',
    description: 'Textbooks, past papers, and lecture slides — always at your fingertips.',
    icon: 'library-outline',
    accentColor: '#F472B6',
  },
  {
    id: '6',
    tag: 'Interactive',
    title: 'Study Rooms',
    description: 'Real-time collaborative sessions and shared notes for deep focus.',
    icon: 'people-outline',
    accentColor: '#A78BFA',
  },
]

// ── FeatureCard ───────────────────────────────────────────────────────────────
const FeatureCard = memo(function FeatureCard({
  item,
  cardWidth,
}: {
  item: Feature
  cardWidth: number
}) {
  return (
    <View
      style={[styles.card, { width: cardWidth }]}
      accessible
      accessibilityRole="none"
      accessibilityLabel={`${item.title}: ${item.description}`}
    >
      {/* Icon + tag row */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: item.accentColor + '1A' }]}>
          <Ionicons name={item.icon} size={22} color={item.accentColor} />
        </View>
        <Text style={[styles.cardTag, { color: item.accentColor }]}>
          {item.tag.toUpperCase()}
        </Text>
      </View>

      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={3}>{item.description}</Text>
    </View>
  )
})

// ── Screen ────────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { width: W, height: H } = useWindowDimensions()

  // Responsive sizing
  const isSmall    = H < 680          // iPhone SE, Galaxy A-series small
  const HERO_H     = isSmall ? 150 : 190
  const CARD_W     = W - 56           // 28px padding each side
  const SNAP_INT   = CARD_W + 12

  const [activeIndex, setActiveIndex] = useState(0)

  // Dot animations
  const dotAnims = useRef(
    FEATURES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current

  // Button entrance
  const btnOpacity = useRef(new Animated.Value(0)).current
  const btnTransY  = useRef(new Animated.Value(16)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(btnOpacity, { toValue: 1, duration: 480, delay: 250, useNativeDriver: true }),
      Animated.timing(btnTransY,  { toValue: 0, duration: 480, delay: 250, useNativeDriver: true }),
    ]).start()
  }, [btnOpacity, btnTransY])

  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 55 }),
    [],
  )

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems.length) return
      const idx = viewableItems[0].index ?? 0
      setActiveIndex(idx)
      dotAnims.forEach((anim, i) =>
        Animated.timing(anim, {
          toValue: i === idx ? 1 : 0,
          duration: 220,
          useNativeDriver: false,
        }).start(),
      )
    },
    [dotAnims],
  )

  const handleComplete = useCallback(
    async (destination: typeof ROUTES.SIGNUP | typeof ROUTES.LOGIN) => {
      try { await AsyncStorage.setItem(ONBOARDING_KEY, 'true') }
      catch (e) { console.warn('[Onboarding] AsyncStorage failed:', e) }
      router.replace(destination)
    },
    [router],
  )

  const handleGetStarted = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    handleComplete(ROUTES.SIGNUP)
  }, [handleComplete])

  const handleSkip   = useCallback(() => handleComplete(ROUTES.LOGIN), [handleComplete])
  const handleSignIn = useCallback(() => handleComplete(ROUTES.LOGIN), [handleComplete])

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Background blobs */}
      <View style={styles.blobTR} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.blobBL} accessibilityElementsHidden importantForAccessibility="no" />

      {/* ScrollView so nothing clips on any screen size */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoDot} />
            <Text style={styles.logoText} accessibilityRole="header">StudentShare</Text>
          </View>
          <TouchableOpacity
            onPress={handleSkip}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            accessibilityHint="Goes directly to sign-in"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hero image ─────────────────────────────────────────── */}
        <View
          style={[styles.heroWrap, { height: HERO_H }]}
          accessible={false}
          importantForAccessibility="no"
        >
          <Image
            source={{ uri: HERO_URI }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={400}
            accessibilityLabel="African university students studying together on campus"
          />
          {/* Dark gradient overlay — keeps UI legible, adds depth */}
          <LinearGradient
            colors={['transparent', 'rgba(7,8,12,0.55)', 'rgba(7,8,12,0.92)']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Bottom label over image */}
          <View style={styles.heroLabel}>
            <View style={styles.heroBadge}>
              <Ionicons name="school" size={11} color={P.accent} />
              <Text style={styles.heroBadgeText}>African Universities</Text>
            </View>
          </View>
        </View>

        {/* ── Headline ───────────────────────────────────────────── */}
        <View style={styles.headlineWrap}>
          <Text
            style={[styles.headline, isSmall && { fontSize: 24, lineHeight: 30 }]}
            accessibilityRole="header"
            accessibilityLabel="Elevate Your Academic Journey"
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Elevate Your{' '}
            <Text style={{ color: P.accent }}>Academic</Text>
            {' '}Journey
          </Text>
        </View>

        {/* ── Carousel label ─────────────────────────────────────── */}
        <Text style={styles.carouselLabel}>What's inside</Text>

        {/* ── Feature carousel ───────────────────────────────────── */}
        <FlatList
          data={FEATURES}
          keyExtractor={(item, i) => item.id ?? String(i)}
          renderItem={({ item }) => <FeatureCard item={item} cardWidth={CARD_W} />}
          horizontal
          pagingEnabled={false}
          snapToInterval={SNAP_INT}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.carouselContent, { paddingRight: W * 0.12 }]}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          style={styles.carousel}
          scrollEnabled
          nestedScrollEnabled
          accessible={false}
        />

        {/* ── Dot indicators ─────────────────────────────────────── */}
        <View
          style={styles.dotsRow}
          accessible
          accessibilityLabel={`Feature ${activeIndex + 1} of ${FEATURES.length}`}
        >
          {FEATURES.map((_, idx) => {
            const width = dotAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [5, 20] })
            const opacity = dotAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] })
            const bg = dotAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [P.dimmed, P.accent] })
            return (
              <Animated.View key={idx} style={[styles.dot, { width, opacity, backgroundColor: bg }]} />
            )
          })}
        </View>

        {/* ── CTA buttons ────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.actions,
            { opacity: btnOpacity, transform: [{ translateY: btnTransY }] },
          ]}
        >
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGetStarted}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Start your journey"
            accessibilityHint="Takes you to the sign-up screen"
          >
            <Text style={styles.primaryBtnText}>Start Your Journey</Text>
            <Ionicons name="arrow-forward" size={17} color={P.white} style={{ marginLeft: 7 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginRow}
            onPress={handleSignIn}
            accessibilityRole="button"
            accessibilityLabel="Already a member? Sign in"
          >
            <Text style={styles.loginPrompt}>Already a member? </Text>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Tagline — hidden on very small screens */}
        {!isSmall && (
          <Text
            style={styles.tagline}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            Excellence · Collaboration · Growth
          </Text>
        )}

      </ScrollView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: P.bg,
  },

  // Background blobs
  blobTR: {
    position: 'absolute', top: 0, right: 0,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: P.accent, opacity: 0.04,
    transform: [{ translateX: 70 }, { translateY: -70 }],
  },
  blobBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: P.accent, opacity: 0.06,
    transform: [{ translateX: -50 }, { translateY: 50 }],
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: P.accent, opacity: 0.9,
  },
  logoText: { fontSize: 17, fontWeight: '800', color: P.white, letterSpacing: 0.2 },
  skipText: {
    fontSize: 11, fontWeight: '700',
    color: P.muted, letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Hero
  heroWrap: {
    marginHorizontal: 20,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: P.bgCard,
    borderWidth: 1,
    borderColor: P.border,
  },
  heroLabel: {
    position: 'absolute',
    bottom: 10,
    left: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(7,8,12,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(232,105,42,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: P.accent,
    letterSpacing: 0.5,
  },

  // Headline
  headlineWrap: {
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: P.white,
    letterSpacing: -0.6,
    lineHeight: 36,
  },

  // Carousel
  carouselLabel: {
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '700',
    color: P.muted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  carousel: { flexGrow: 0 },
  carouselContent: {
    paddingLeft: 20,
    gap: 12,
  },
  card: {
    backgroundColor: P.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.border,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  iconBadge: {
    width: 40, height: 40, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTag: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.8,
  },
  cardTitle: {
    fontSize: 17, fontWeight: '800',
    color: P.white, letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 12.5, color: P.muted,
    lineHeight: 18, fontWeight: '400',
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
    marginBottom: 2,
  },
  dot: { height: 3, borderRadius: 1.5 },

  // Actions
  actions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.accent,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: P.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryBtnText: {
    fontSize: 16, fontWeight: '800',
    color: P.white, letterSpacing: 0.2,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginPrompt: { fontSize: 14, color: P.muted },
  loginLink:   { fontSize: 14, fontWeight: '700', color: P.accent },

  // Tagline
  tagline: {
    textAlign: 'center',
    fontSize: 9, fontWeight: '700',
    color: P.muted, letterSpacing: 2.5,
    textTransform: 'uppercase',
    opacity: 0.45, marginTop: 10, marginBottom: 4,
  },
})