/**
 * app/(auth)/onboarding.tsx
 *
 * First-launch onboarding screen.
 *
 * FLOW
 * ────
 * Shown only once — _layout.tsx checks AsyncStorage for ONBOARDING_KEY before
 * routing. Once the user taps "Start Your Journey" or "Skip", the key is set
 * and they are never shown this screen again.
 *
 * DESIGN
 * ──────
 * Matches the existing auth palette (C.bgDeep, C.sky, C.bgCard, C.border) so
 * the transition into login/signup feels seamless.
 *
 * Hero image: replace the placeholder <View> with an <Image> when ready:
 *   import { Image } from 'react-native'
 *   <Image source={require('../../assets/images/onboarding-hero.png')}
 *          style={styles.heroImage} resizeMode="cover" />
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ROUTES } from '../../lib/routes'
import { C } from '../../src/auth-constants/colors'

// ── Storage key ───────────────────────────────────────────────────────────────
export const ONBOARDING_KEY = 'onboarding_complete'

const { width: SCREEN_W } = Dimensions.get('window')
const CARD_W = SCREEN_W - 48   // full-bleed cards with 24px margin each side

// ── Feature data ──────────────────────────────────────────────────────────────
type Feature = {
  id: string
  tag: string
  title: string
  description: string
  icon: string          // Ionicons name
  accentColor: string   // per-card accent (all blue-family to stay on-palette)
}

const FEATURES: Feature[] = [
  {
    id: '1',
    tag: 'Intelligence',
    title: 'AI Tutoring',
    description:
      'Personalised 24/7 learning support tailored to your specific curriculum and learning style.',
    icon: 'bulb-outline',
    accentColor: C.sky,
  },
  {
    id: '2',
    tag: 'Collaboration',
    title: 'Peer Notes',
    description:
      'Access curated, high-quality study materials and insights shared by top-performing students.',
    icon: 'document-text-outline',
    accentColor: '#818CF8',   // indigo — still cool-toned
  },
  {
    id: '3',
    tag: 'Community',
    title: 'Campus Hub',
    description:
      'Connect with your university community, find study partners, and join academic groups.',
    icon: 'school-outline',
    accentColor: '#34D399',   // emerald accent for variety
  },
  {
    id: '4',
    tag: 'Organisation',
    title: 'Smart Planner',
    description:
      'Automated study schedules that adapt to your exam dates, deadlines, and personal workload.',
    icon: 'calendar-outline',
    accentColor: '#FBBF24',   // amber — warm contrast
  },
  {
    id: '5',
    tag: 'Resources',
    title: 'Digital Library',
    description:
      'A vast repository of textbooks, past papers, and lecture slides at your fingertips.',
    icon: 'library-outline',
    accentColor: '#F472B6',   // pink — visual variety
  },
  {
    id: '6',
    tag: 'Interactive',
    title: 'Study Rooms',
    description:
      'Real-time collaborative group study sessions and shared notes for deep focus.',
    icon: 'people-outline',
    accentColor: '#A78BFA',   // violet
  },
]

// ── Helper: mark onboarding done + navigate ───────────────────────────────────
async function completeOnboarding(
  router: ReturnType<typeof useRouter>,
  destination: typeof ROUTES.SIGNUP | typeof ROUTES.LOGIN,
) {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true')
  } catch {
    // Non-critical — proceed even if storage fails
  }
  router.replace(destination)
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ item }: { item: Feature }) {
  return (
    <View style={[styles.card, { width: CARD_W }]}>
      {/* Icon badge */}
      <View style={[styles.iconBadge, { backgroundColor: item.accentColor + '1A' }]}>
        <Ionicons name={item.icon as any} size={30} color={item.accentColor} />
      </View>

      {/* Tag */}
      <Text style={[styles.cardTag, { color: item.accentColor }]}>
        {item.tag.toUpperCase()}
      </Text>

      {/* Title */}
      <Text style={styles.cardTitle}>{item.title}</Text>

      {/* Description */}
      <Text style={styles.cardDesc}>{item.description}</Text>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [activeIndex, setActiveIndex] = useState(0)

  // Dot opacity animations — one Animated.Value per feature
  const dotScales = useRef(FEATURES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current

  // Called by FlatList when the visible item changes
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems.length) return
      const idx = viewableItems[0].index ?? 0
      setActiveIndex(idx)

      // Animate dots
      dotScales.forEach((anim, i) => {
        Animated.timing(anim, {
          toValue: i === idx ? 1 : 0,
          duration: 250,
          useNativeDriver: false,
        }).start()
      })
    },
    [dotScales],
  )

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current

  // Button entrance animation
  const btnOpacity = useRef(new Animated.Value(0)).current
  const btnTransY  = useRef(new Animated.Value(20)).current

  // Trigger button entrance once on mount
  useRef(
    Animated.parallel([
      Animated.timing(btnOpacity, { toValue: 1, duration: 500, delay: 300, useNativeDriver: true }),
      Animated.timing(btnTransY,  { toValue: 0, duration: 500, delay: 300, useNativeDriver: true }),
    ]).start(),
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Logo mark */}
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <Text style={styles.logoText}>StudentShare</Text>
        </View>

        {/* Skip */}
        <TouchableOpacity
          onPress={() => completeOnboarding(router, ROUTES.LOGIN)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Skip onboarding"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* ── Hero image placeholder ──────────────────────────────
          Replace this View with an <Image> when your asset is ready:

          import { Image } from 'react-native'
          <Image
            source={require('../../assets/images/onboarding-hero.png')}
            style={styles.heroImage}
            resizeMode="cover"
          />
      ─────────────────────────────────────────────────────────── */}
      <View style={styles.heroPlaceholder}>
        {/* Decorative blobs */}
        <View style={styles.blobTR} />
        <View style={styles.blobBL} />

        {/* Placeholder content */}
        <View style={styles.placeholderInner}>
          <View style={styles.placeholderIcon}>
            <Ionicons name="image-outline" size={36} color={C.muted} />
          </View>
          <Text style={styles.placeholderLabel}>Hero image coming soon</Text>
        </View>

        {/* Gradient fade at bottom */}
        <View style={styles.heroFade} />
      </View>

      {/* ── Headline ───────────────────────────────────────────── */}
      <View style={styles.headlineWrap}>
        <Text style={styles.headline}>
          Elevate Your{' '}
          <Text style={[styles.headline, { color: C.sky }]}>Academic</Text>
          {'\n'}Journey
        </Text>
      </View>

      {/* ── Feature carousel ───────────────────────────────────── */}
      <FlatList
        data={FEATURES}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <FeatureCard item={item} />}
        horizontal
        pagingEnabled={false}
        snapToInterval={CARD_W + 16}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={styles.carousel}
      />

      {/* ── Dot indicators ─────────────────────────────────────── */}
      <View style={styles.dotsRow}>
        {FEATURES.map((_, idx) => {
          const width = dotScales[idx].interpolate({
            inputRange:  [0, 1],
            outputRange: [8, 28],
          })
          const opacity = dotScales[idx].interpolate({
            inputRange:  [0, 1],
            outputRange: [0.35, 1],
          })
          const bg = dotScales[idx].interpolate({
            inputRange:  [0, 1],
            outputRange: [C.border, C.sky],
          })
          return (
            <Animated.View
              key={idx}
              style={[styles.dot, { width, opacity, backgroundColor: bg }]}
            />
          )
        })}
      </View>

      {/* ── CTA buttons ────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.actions,
          {
            paddingBottom: insets.bottom + 16,
            opacity:   btnOpacity,
            transform: [{ translateY: btnTransY }],
          },
        ]}
      >
        {/* Primary — get started */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => completeOnboarding(router, ROUTES.SIGNUP)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start your journey — go to sign up"
        >
          <Text style={styles.primaryBtnText}>Start Your Journey</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        {/* Secondary — already have account */}
        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>Already a member? </Text>
          <TouchableOpacity
            onPress={() => completeOnboarding(router, ROUTES.LOGIN)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Footer tagline ──────────────────────────────────────── */}
      <Text style={[styles.tagline, { marginBottom: insets.bottom > 0 ? 4 : 12 }]}>
        Excellence · Collaboration · Growth
      </Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bgDeep,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoDot: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.sky,
    opacity: 0.9,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.2,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Hero
  heroPlaceholder: {
    height: 200,
    marginHorizontal: 24,
    borderRadius: 20,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  heroImage: {
    // Used when replacing placeholder with real Image
    height: 200,
    marginHorizontal: 24,
    borderRadius: 20,
  },
  blobTR: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: C.sky,
    opacity: 0.05,
  },
  blobBL: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#818CF8',
    opacity: 0.06,
  },
  placeholderInner: {
    alignItems: 'center',
    gap: 8,
  },
  placeholderIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: C.bgMid,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '500',
  },
  heroFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: C.bgDeep,
    opacity: 0.0,   // subtle — set to 0.4 if you want a hard fade
  },

  // Headline
  headlineWrap: {
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 16,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.5,
    lineHeight: 38,
  },

  // Carousel
  carousel: {
    flexGrow: 0,
  },
  carouselContent: {
    paddingHorizontal: 24,
    gap: 16,
    paddingRight: 40,    // let the next card peek
  },
  card: {
    backgroundColor: C.bgCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    gap: 10,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.3,
  },
  cardDesc: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 21,
    fontWeight: '400',
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    marginBottom: 4,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },

  // Actions
  actions: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.blue,
    borderRadius: 16,
    paddingVertical: 17,
    shadowColor: C.sky,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.3,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginPrompt: {
    fontSize: 14,
    color: C.muted,
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '800',
    color: C.sky,
  },

  // Footer
  tagline: {
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    opacity: 0.5,
    marginTop: 8,
  },
})