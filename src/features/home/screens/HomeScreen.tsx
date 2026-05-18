/**
 * app/(tabs)
 * Home Screen — Production-ready
 *
 * Fix 3: Scroll jank — orbs moved to hero, removeClippedSubviews removed,
 *         nestedScrollEnabled on horizontal deadline ScrollView
 * Fix 4: NOTES_STORAGE_KEY and DASH_CUSTOM_CARDS_KEY scoped to userId
 * Fix 5: College/class pills restructured to column layout under avatar
 * Fix 6: useDeadlines and useStudyPlannerSnapshot now receive userId
 * Fix flash: showSkeleton guards against null-userId gap on remount.
 *            A module-level lastKnownUserId ensures we never treat a
 *            transient null userId as "no user" after first login.
 * Fix premium pill: Get Premium badge is now inline with Verified/Premium pills
 */

import { supabase } from '@/core/api/supabase'
import { CustomizeModal } from '@/features/home/components/CustomizeModal'
import { DashCardItem, DeadlineChip, ScheduleRow } from '@/features/home/components/HomeRows'
import {
  HomeErrorBoundary,
  MetaVerifiedBadge,
  OfflineBanner,
  QuickActionItem,
  SectionHead,
} from '@/features/home/components/HomeShell'
import { LeaderboardPreview } from '@/features/home/components/LeaderboardPreview'
import {
  AVATAR_LOCK_KEY,
  AVATAR_LOCK_TTL_MS,
  DASH_CUSTOM_CARDS_KEY,
  MOTIVATIONS,
} from '@/features/home/constants'
import { useAvatarUpload } from '@/features/home/hooks/useAvatarUpload'
import { useDeadlines } from '@/features/home/hooks/useDeadlines'
import { useHomeDashboard } from '@/features/home/hooks/useHomeDashboard'
import type { HomeScheduleItem } from '@/features/home/hooks/useStudyPlannerSnapshot'
import { useStudyPlannerSnapshot } from '@/features/home/hooks/useStudyPlannerSnapshot'
import type { DashCard } from '@/features/home/types'
import { isAvatarRefetchLocked } from '@/core/utils/avatarLock'
import { useProfileSync } from '@/hooks/useProfileSync'
import { C } from '@/lib/colors'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─── Layout constants ──────────────────────────────────────────────────────
const BODY_H_PAD       = 22
const COL_GAP          = 10
const DASH_CARD_HEIGHT = 150
const DASH_CARD_WIDTH  = (width: number) => Math.floor((width - BODY_H_PAD * 2 - COL_GAP) / 2)

// ── Module-level: last known userId ───────────────────────────────────────
// useProfileSync returns null for 1-2 renders on remount while it rehydrates.
// We remember the last non-null userId so we never treat that transient null
// as "logged out" and accidentally show the skeleton.
let _lastKnownUserId: string | null = null

// ─── Skeleton primitives ───────────────────────────────────────────────────
function SkeletonBox({ width, height, borderRadius = 12, style }: {
  width?: number | string; height: number; borderRadius?: number; style?: any
}) {
  const opacity = useRef(new Animated.Value(0.3)).current
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
    ]))
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={[{ width: width ?? '100%', height, borderRadius, backgroundColor: C.border, opacity }, style]} />
  )
}

function HeroSkeleton() {
  return (
    <View style={sk.heroWrap}>
      <View style={sk.profileRow}>
        <SkeletonBox width={70} height={70} borderRadius={35} />
        <View style={sk.profileText}>
          <SkeletonBox width={80}  height={10} borderRadius={6} style={{ marginBottom: 10 }} />
          <SkeletonBox width={140} height={24} borderRadius={8} style={{ marginBottom: 10 }} />
          <SkeletonBox width={100} height={16} borderRadius={8} />
        </View>
      </View>
      <View style={sk.infoRow}>
        <SkeletonBox width={90} height={28} borderRadius={20} />
        <SkeletonBox width={90} height={28} borderRadius={20} />
        <SkeletonBox width={80} height={28} borderRadius={20} />
      </View>
    </View>
  )
}

function HomeSkeleton({ insets, screenWidth }: { insets: any; screenWidth: number }) {
  const cw = DASH_CARD_WIDTH(screenWidth)
  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>
      <View style={[sk.nav, { paddingTop: insets.top + 10 }]}>
        <SkeletonBox width={34} height={34} borderRadius={11} />
        <SkeletonBox width={120} height={18} borderRadius={8} style={{ marginLeft: 8 }} />
        <View style={{ flex: 1 }} />
        <SkeletonBox width={38} height={38} borderRadius={13} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, paddingTop: insets.top + 64 }}
        scrollEnabled={false}
      >
        <HeroSkeleton />
        <View style={{ paddingHorizontal: BODY_H_PAD }}>
          <View style={[sk.section, { marginTop: 28 }]}>
            <SkeletonBox width={'100%'} height={90} borderRadius={20} />
          </View>
          <View style={sk.section}>
            <SkeletonBox width={140} height={13} borderRadius={6} style={{ marginBottom: 10 }} />
            <SkeletonBox height={3} borderRadius={3} />
          </View>
          <View style={sk.section}>
            <SkeletonBox width={100} height={10} borderRadius={5} style={{ marginBottom: 18 }} />
            <View style={sk.qaGrid}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={sk.qaItem}>
                  <SkeletonBox width={54} height={54} borderRadius={18} style={{ marginBottom: 8 }} />
                  <SkeletonBox width={44} height={9} borderRadius={4} />
                </View>
              ))}
            </View>
          </View>
          <View style={sk.section}>
            <SkeletonBox width={80} height={10} borderRadius={5} style={{ marginBottom: 18 }} />
            <View style={{ gap: COL_GAP }}>
              {[0, 1, 2].map(row => (
                <View key={row} style={{ flexDirection: 'row', gap: COL_GAP }}>
                  <SkeletonBox width={cw} height={DASH_CARD_HEIGHT} borderRadius={20} />
                  <SkeletonBox width={cw} height={DASH_CARD_HEIGHT} borderRadius={20} />
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// ─── Get Premium badge (animated shimmer) ─────────────────────────────────
function GetPremiumBadge({ onPress }: { onPress: () => void }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ]))
    anim.start()
    return () => anim.stop()
  }, [])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] })

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Get Premium — unlock all features"
    >
      <Animated.View style={[s.getPremiumBadge, { opacity }]}>
        <LinearGradient
          colors={[C.gold, '#F59E0B', C.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={s.getPremiumStar}>✦</Text>
        <Text allowFontScaling={false} style={s.getPremiumText}>Get Premium</Text>
        <Ionicons name="chevron-forward" size={10} color="#fff" />
      </Animated.View>
    </TouchableOpacity>
  )
}

// ─── Main screen ───────────────────────────────────────────────────────────
function HomeScreenInner() {
  const router    = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  const queryClient = useQueryClient()
  const insets      = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const { userId: rawUserId, isOnline } = useProfileSync()

  // ── Stabilise userId across the null gap on remount ───────────────────
  // useProfileSync returns null for 1-2 renders while rehydrating auth state.
  // We keep the last non-null value so hooks and guards don't see a false
  // "logged out" signal, which would reset hasEverLoaded and show the skeleton.
  if (rawUserId) _lastKnownUserId = rawUserId
  const userId = rawUserId ?? _lastKnownUserId

  const [motivation,    setMotivation]    = useState(MOTIVATIONS[0])
  const [showCustomize, setShowCustomize] = useState(false)
  const [customCards,   setCustomCards]   = useState<string[]>([])
  const [notesCount,    setNotesCount]    = useState(0)

  // ── Storage keys scoped to userId ─────────────────────────────────────
  const notesStorageKey = userId ? `ss_notes_list_${userId}`            : null
  const customCardsKey  = userId ? `${DASH_CUSTOM_CARDS_KEY}_${userId}` : null

  // ── Hooks ─────────────────────────────────────────────────────────────
  const { deadlines, sortedDeadlines, removeDeadline, reload: reloadDeadlines } = useDeadlines(userId)
  const { uploadingAvatar, pickAndUploadAvatar } = useAvatarUpload({ userId, isOnline, queryClient })
  const {
    cacheReady, isLoading, hasEverLoaded, profile, stats, classId, collegeId, refreshDashboard,
  } = useHomeDashboard({ userId, queryClient })
  const { weeklyHours, weeklyGoalHours, todayBlocks, refresh: refreshPlanner } = useStudyPlannerSnapshot(userId)

  const studyProgressPct = weeklyGoalHours > 0
    ? Math.min((weeklyHours / weeklyGoalHours) * 100, 100)
    : 0

  // ── Bell animation ────────────────────────────────────────────────────
  const [notifCount, setNotifCount] = useState(0)
  const prevNotifRef = useRef(0)
  const bellAnim     = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (notifCount > prevNotifRef.current) {
      Animated.sequence([
        Animated.timing(bellAnim, { toValue:  1, duration: 80, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue:  1, duration: 80, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue:  0, duration: 60, useNativeDriver: true }),
      ]).start()
    }
    prevNotifRef.current = notifCount
  }, [notifCount, bellAnim])

  const lastFocusRef = useRef(Date.now())

  // ── Notification subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    let active = true
    const fetchNotifs = async () => {
      if (!active) return
      try {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('is_read', false)
        if (active) setNotifCount(count || 0)
      } catch {}
    }
    fetchNotifs()
    const ch = supabase.channel(`notif-bell-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, fetchNotifs)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [userId])

  // ── Notes count ───────────────────────────────────────────────────────
  const loadNotesCount = useCallback(async () => {
    if (!notesStorageKey) { setNotesCount(0); return }
    try {
      const raw = await AsyncStorage.getItem(notesStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setNotesCount(parsed.length)
      } else {
        setNotesCount(0)
      }
    } catch {}
  }, [notesStorageKey])

  useEffect(() => { setNotesCount(0) }, [userId])
  useEffect(() => { loadNotesCount() }, [loadNotesCount])

  // ── Custom cards ──────────────────────────────────────────────────────
  useEffect(() => {
    setCustomCards([])
    if (!customCardsKey) return
    AsyncStorage.getItem(customCardsKey).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw)
          if (Array.isArray(saved) && saved.every((id: any) => typeof id === 'string')) {
            setCustomCards(saved.slice(0, 6)); return
          }
        } catch {}
      }
      setCustomCards(['solutions', 'mats', 'notes', 'plan', 'contribute', 'contributors'])
    }).catch(() => setCustomCards(['solutions', 'mats', 'notes', 'plan', 'contribute', 'contributors']))
  }, [customCardsKey])

  useEffect(() => {
    if (customCards.length > 0 && customCardsKey)
      AsyncStorage.setItem(customCardsKey, JSON.stringify(customCards.slice(0, 6))).catch(() => {})
  }, [customCards, customCardsKey])

  // ── Focus refresh ─────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    setMotivation(MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)])
    refreshPlanner()
    loadNotesCount()
    reloadDeadlines()

    const now = Date.now()
    const checkAndRefetch = async () => {
      if (isAvatarRefetchLocked()) { lastFocusRef.current = now; return }
      try {
        const lockTime = await AsyncStorage.getItem(AVATAR_LOCK_KEY).then(v => v ? Number(v) : 0)
        if (now - lockTime < AVATAR_LOCK_TTL_MS) { lastFocusRef.current = now; return }
      } catch {}
      if (userId && now - lastFocusRef.current > 30_000) {
        lastFocusRef.current = now
        try { refreshDashboard() } catch {}
      }
    }
    checkAndRefetch()
  }, [userId, refreshDashboard, refreshPlanner, loadNotesCount, reloadDeadlines]))

  // ── Quick actions ─────────────────────────────────────────────────────
  const quickActions = useMemo(() => [
    { label: 'New Materials', emoji: '📚', color: C.sapphire, bg: C.sapphDim,  borderColor: 'rgba(75,140,245,0.18)',  onPress: () => routerRef.current.push('/new-materials' as any) },
    { label: 'AI Tutor',      emoji: '✨',  color: C.sky,     bg: C.skyDim,    borderColor: 'rgba(56,189,248,0.18)',  onPress: () => routerRef.current.push({ pathname: '/chat' as any, params: { material_title: 'General Assistant', file_url: '' } }) },
    { label: 'Quiz & Cards',  emoji: '🧠', color: C.coral,   bg: C.coralDim,  borderColor: 'rgba(238,104,104,0.18)', onPress: () => routerRef.current.push('/quiz-flashcards' as any) },
    { label: 'Courses',       emoji: '🎓', color: C.emerald, bg: C.emerDim,   borderColor: 'rgba(61,201,154,0.18)',  onPress: () => routerRef.current.push('/my-courses' as any) },
    { label: 'College Hub',   emoji: '🏛',  color: C.sky,     bg: C.skyDim,    borderColor: 'rgba(56,189,248,0.18)',  onPress: () => routerRef.current.push('/college-info' as any) },
    { label: 'Grade Calc',    emoji: '🧮', color: C.gold,    bg: C.goldDim,   borderColor: 'rgba(223,168,60,0.18)',  onPress: () => routerRef.current.push('/grade-calculator' as any) },
    { label: 'Deadlines',     emoji: '⏰', color: C.orange,  bg: C.orangeDim, borderColor: 'rgba(232,105,42,0.18)',  badge: deadlines.length > 0 ? deadlines.length : undefined, onPress: () => routerRef.current.push('/deadlines' as any) },
    { label: 'Leaderboard',   emoji: '🏆', color: C.orange,  bg: C.orangeDim, borderColor: 'rgba(232,105,42,0.18)',  onPress: () => routerRef.current.push('/leaderboard' as any) },
  ], [deadlines.length])

  // ── Dashboard cards ───────────────────────────────────────────────────
  const availableCards = useMemo<DashCard[]>(() => [
    { id: 'solutions',    emoji: '💡', title: 'Question Solutions', sub: 'Past paper & AI solutions',  badgeLabel: 'Solve now',                                             badgeColor: C.sapphire, badgeBg: C.sapphDim,  borderColor: 'rgba(75,140,245,0.14)',  glowColor: 'rgba(75,140,245,0.12)',  onPress: () => routerRef.current.push('/solutions' as any) },
    { id: 'mats',         emoji: '📂', title: 'Study Materials',    sub: 'Docs, slides, past Qs',      badgeLabel: stats.total > 0 ? `${stats.total} files` : 'Browse all', badgeColor: C.gold,     badgeBg: C.goldDim,   borderColor: 'rgba(223,168,60,0.14)',  glowColor: 'rgba(223,168,60,0.12)',  onPress: () => routerRef.current.push('/study-materials' as any) },
    { id: 'notes',        emoji: '📝', title: 'Notes',              sub: 'Peer-written notes',         badgeLabel: notesCount > 0 ? `${notesCount} notes` : 'Browse notes', badgeColor: C.orange,   badgeBg: C.orangeDim, borderColor: 'rgba(232,105,42,0.14)',  glowColor: 'rgba(232,105,42,0.12)', onPress: () => routerRef.current.push('/notes' as any) },
    { id: 'plan',         emoji: '🗓', title: 'Study Planner',      sub: 'Tasks & goals',              badgeLabel: 'Plan week',                                             badgeColor: C.emerald,  badgeBg: C.emerDim,   borderColor: 'rgba(61,201,154,0.14)', glowColor: 'rgba(61,201,154,0.12)', onPress: () => routerRef.current.push('/(tabs)/study-planner' as any) },
    { id: 'contribute',   emoji: '⬆️', title: 'Contribute',         sub: 'Upload study materials',     badgeLabel: 'Share now',                                             badgeColor: C.lavender, badgeBg: C.lavDim,    borderColor: 'rgba(155,124,244,0.14)', glowColor: 'rgba(155,124,244,0.12)', onPress: () => routerRef.current.push('/contribute' as any) },
    { id: 'contributors', emoji: '🌟', title: 'Contributors',       sub: 'Top material sharers',       badgeLabel: 'View all',                                              badgeColor: C.coral,    badgeBg: C.coralDim,  borderColor: 'rgba(238,104,104,0.14)', glowColor: 'rgba(238,104,104,0.12)', onPress: () => routerRef.current.push('/contributors' as any) },
  ], [stats.total, notesCount])

  const dashCards = useMemo(() => {
    const selected  = customCards.map(id => availableCards.find(c => c.id === id)).filter(Boolean) as DashCard[]
    const remaining = availableCards.filter(c => !customCards.includes(c.id))
    return [...selected, ...remaining.slice(0, 6 - selected.length)].slice(0, 6)
  }, [availableCards, customCards])

  const dashRows = useMemo(() => {
    const cw = DASH_CARD_WIDTH(screenWidth)
    const rows: DashCard[][] = []
    for (let i = 0; i < dashCards.length; i += 2) rows.push(dashCards.slice(i, i + 2))
    return { rows, cw }
  }, [dashCards, screenWidth])

  // ── Skeleton guard ────────────────────────────────────────────────────
  // Only show skeleton on a true cold start — no data whatsoever.
  // hasEverLoaded comes from module-level store in useHomeDashboard, so it
  // survives remounts. userId is stabilised above so the null gap on remount
  // no longer resets hasEverLoaded to false.
  const showSkeleton = !hasEverLoaded && !profile

  if (showSkeleton) {
    return <HomeSkeleton insets={insets} screenWidth={screenWidth} />
  }

  if (hasEverLoaded && !isLoading && !profile) {
    return (
      <View style={s.setupScreen}>
        <View style={s.setupIconBox}><Ionicons name="person-add-outline" size={36} color={C.orange} /></View>
        <Text maxFontSizeMultiplier={1.3} style={s.setupTitle}>Complete Your Profile</Text>
        <Text maxFontSizeMultiplier={1.3} style={s.setupSub}>Set up your college and class to unlock your full dashboard.</Text>
        <TouchableOpacity style={s.setupBtn} onPress={() => router.push('/profile' as any)}>
          <Text maxFontSizeMultiplier={1.3} style={s.setupBtnText}>Set Up Profile</Text>
          <Ionicons name="arrow-forward" size={15} color={C.void} />
        </TouchableOpacity>
      </View>
    )
  }

  const firstName  = profile?.full_name?.split(' ')[0] || 'Student'
  const hour       = new Date().getHours()
  const greeting   = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const isPremium  = !!profile?.is_premium
  const isVerified = !!profile?.is_verified

  const materialsPillLabel = (stats?.total ?? 0) > 0 ? `${stats.total} files` : 'Materials'
  const rankPillLabel      = stats?.collegeRank ? `#${stats.collegeRank}` : 'Unranked'

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>

      {/* ═══ NAV ═══ */}
      <View style={[s.nav, { paddingTop: insets.top + 10 }]}>
        <View style={s.navBrand}>
          <View style={s.navLogo}><Text style={{ fontSize: 16 }}>🎓</Text></View>
          <Text maxFontSizeMultiplier={1.3} style={s.navWordmark}>
            student<Text style={s.navWordmarkAccent}>share</Text>
          </Text>
        </View>
        <TouchableOpacity style={s.navSearchBox} onPress={() => router.push('/search' as any)} activeOpacity={0.85} accessibilityRole="search" accessibilityLabel="Search">
          <Ionicons name="search-outline" size={13} color={C.textMute} />
          <Text allowFontScaling={false} style={s.navSearchPlaceholder} numberOfLines={1}>Search…</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/notifications' as any)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={notifCount > 0 ? `Notifications, ${notifCount} unread` : 'Notifications'}>
          <Animated.View style={{ transform: [{ rotate: bellAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-18deg', '0deg', '18deg'] }) }] }}>
            <Ionicons name="notifications" size={16} color={notifCount > 0 ? C.orange : C.textSub} />
          </Animated.View>
          {notifCount > 0 && <View style={s.navNotifPip} />}
        </TouchableOpacity>
      </View>

      {!isOnline && <OfflineBanner />}

      {/* ═══ SCROLL ═══ */}
      <ScrollView
        style={s.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, paddingTop: insets.top + 64 }}
        decelerationRate="normal"
        scrollEventThrottle={16}
        overScrollMode="never"
        bounces
      >

        {/* ═══ HERO ═══ */}
        <View style={s.hero}>
          <View style={s.orbOrange} /><View style={s.orbBlue} /><View style={s.orbPurple} />

          <View style={s.profileRow}>
            <View style={s.profileTopRow}>
              {/* Avatar */}
              <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} style={s.avatarWrap} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={uploadingAvatar ? 'Uploading picture' : 'Change profile picture'}>
                <LinearGradient colors={[C.orange, C.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatarRing}>
                  <View style={s.avatarInner}>
                    {uploadingAvatar
                      ? <ActivityIndicator color={C.text} size="small" />
                      : profile?.avatar_url
                        ? <Image source={{ uri: profile.avatar_url }} style={s.avatarImage} />
                        : <Text maxFontSizeMultiplier={1.3} style={s.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
                    }
                  </View>
                </LinearGradient>
                {!uploadingAvatar && <View style={s.cameraBadge}><Text style={{ fontSize: 10 }}>📷</Text></View>}
              </TouchableOpacity>

              {/* Profile text + unified pills row */}
              <View style={s.profileText}>
                <Text maxFontSizeMultiplier={1.3} style={s.greetingLabel}>{greeting}</Text>
                <View style={s.nameRow}>
                  <Text maxFontSizeMultiplier={1.3} style={s.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{firstName}</Text>
                  {isVerified && <MetaVerifiedBadge size={22} />}
                </View>

                {/*
                  Unified pills row — all four states in one row:
                  · Verified + Premium     → ✓ Verified  ★ Premium
                  · Verified + not Premium → ✓ Verified  ✦ Get Premium
                  · not Verified + Premium → ★ Premium
                  · not Verified + not Premium → ✦ Get Premium
                */}
                <View style={s.pillsRow}>
                  {isVerified && (
                    <View style={[s.pill, s.pillVerified]}>
                      <Text allowFontScaling={false} style={s.pillVerifiedText}>✓ Verified</Text>
                    </View>
                  )}
                  {isPremium ? (
                    <View style={[s.pill, s.pillPremium]}>
                      <Text allowFontScaling={false} style={s.pillPremiumText}>★ Premium</Text>
                    </View>
                  ) : (
                    <GetPremiumBadge onPress={() => routerRef.current.push('/subscription' as any)} />
                  )}
                </View>
              </View>
            </View>

            {/* Info pills — college · class · materials */}
            {profile?.college && (
              <View style={s.infoPillsScrollWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.infoPillsRow}
                >
                  <View style={s.infoPill}>
                    <Text style={s.infoPillIcon}>🏛</Text>
                    <Text allowFontScaling={false} style={s.infoPillText}>
                      {profile.college.short_name || profile.college.name}
                    </Text>
                  </View>

                  {profile.class?.name && (
                    <View style={[s.infoPill, s.infoPillClass]}>
                      <Text style={s.infoPillIcon}>🎓</Text>
                      <Text allowFontScaling={false} style={[s.infoPillText, s.infoPillClassText]}>
                        {profile.class.name}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[s.infoPill, s.infoPillMats]}
                    onPress={() => routerRef.current.push('/study-materials' as any)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${materialsPillLabel} — view study materials`}
                  >
                    <Text style={s.infoPillIcon}>📂</Text>
                    <Text allowFontScaling={false} style={[s.infoPillText, s.infoPillMatsText]}>
                      {materialsPillLabel}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.infoPill, s.infoPillRank]}
                    onPress={() => routerRef.current.push('/leaderboard' as any)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Rank ${rankPillLabel} — view leaderboard`}
                  >
                    <Text style={s.infoPillIcon}>🏆</Text>
                    <Text allowFontScaling={false} style={[s.infoPillText, s.infoPillRankText]}>
                      {rankPillLabel}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}
          </View>
        </View>

        {/* ═══ BODY ═══ */}
        <View style={s.body}>

          {/* Motivation */}
          <View style={s.motCard}>
            <Text maxFontSizeMultiplier={1.3} style={s.motEyebrow}>MOTIVATION OF THE DAY</Text>
            <Text maxFontSizeMultiplier={1.3} style={s.motQuote}>"{motivation.quote}"</Text>
            <Text maxFontSizeMultiplier={1.3} style={s.motAuthor}>— {motivation.author}</Text>
          </View>

          {/* Study progress */}
          <View style={s.section}>
            <View style={s.progRow}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={s.progTitle}>Weekly Study Goal</Text>
                <Text maxFontSizeMultiplier={1.3} style={s.progSub}>{weeklyHours.toFixed(1)}h of {weeklyGoalHours}h this week</Text>
              </View>
              <Text maxFontSizeMultiplier={1.3} style={s.progPct}>{Math.round(studyProgressPct)}%</Text>
            </View>
            <View style={s.progTrackWrap}>
              <View style={s.progTrack}>
                <View style={[s.progFill, { width: `${studyProgressPct}%` as any }]} />
              </View>
              {studyProgressPct > 0 && <View style={[s.progDot, { left: `${Math.min(studyProgressPct, 98)}%` as any }]} />}
            </View>
            {weeklyHours === 0 && (
              <TouchableOpacity style={s.progCta} onPress={() => routerRef.current.push('/(tabs)/study-planner' as any)} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={12} color={C.textMute} />
                <Text allowFontScaling={false} style={s.progCtaText}>Add study blocks in Study Planner to track your progress</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Quick actions */}
          <View style={s.section}>
            <SectionHead title="Quick Actions" />
            <View style={s.qaGrid}>
              {quickActions.map(item => (
                <QuickActionItem key={item.label} label={item.label} emoji={item.emoji} color={item.color} bg={item.bg} borderColor={item.borderColor} badge={(item as any).badge} onPress={item.onPress} />
              ))}
            </View>
          </View>

          {/* Dashboard cards */}
          <View style={s.section}>
            <SectionHead title="Dashboard" link="Customize" onLink={() => setShowCustomize(true)} />
            <View style={s.dashGrid}>
              {dashRows.rows.map((row, rowIdx) => (
                <View key={rowIdx} style={s.dashRow}>
                  {row.map(card => <DashCardItem key={card.id} card={card} cardWidth={dashRows.cw} />)}
                  {row.length === 1 && <View style={{ width: dashRows.cw }} />}
                </View>
              ))}
            </View>
          </View>

          {/* Upcoming deadlines */}
          <View style={s.section}>
            <SectionHead title="Upcoming Deadlines" link="Manage" onLink={() => routerRef.current.push('/deadlines' as any)} />
            {deadlines.length === 0 ? (
              <TouchableOpacity style={s.deadlineEmpty} onPress={() => routerRef.current.push('/deadlines' as any)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="No deadlines yet. Tap to add one.">
                <View style={s.deadlineEmptyLeft}>
                  <View style={s.deadlineEmptyIcon}><Ionicons name="calendar-outline" size={18} color={C.orange} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text maxFontSizeMultiplier={1.3} style={s.deadlineEmptyTitle}>No deadlines yet</Text>
                    <Text maxFontSizeMultiplier={1.3} style={s.deadlineEmptySub}>Tap to track an assignment or exam</Text>
                  </View>
                </View>
                <View style={s.deadlineEmptyBtn}>
                  <Ionicons name="add" size={15} color={C.void} />
                  <Text maxFontSizeMultiplier={1.3} style={s.deadlineEmptyBtnText}>Add</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                scrollEventThrottle={16}
                contentContainerStyle={{ gap: 10, paddingRight: 24 }}
              >
                {sortedDeadlines.slice(0, 5).map(d => (
                  <DeadlineChip key={d.id} d={d} onRemove={() => removeDeadline(d.id)} />
                ))}
                <TouchableOpacity style={s.deadlineAddChip} onPress={() => routerRef.current.push('/deadlines' as any)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Add deadline">
                  <Ionicons name="add" size={20} color={C.textMute} />
                  <Text allowFontScaling={false} style={s.deadlineAddText}>Add</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>

          {/* Today's schedule */}
          <View style={s.section}>
            <SectionHead title="Today's Schedule" link="View all" onLink={() => routerRef.current.push('/(tabs)/study-planner' as any)} />
            {todayBlocks.length === 0 ? (
              <TouchableOpacity style={s.scheduleEmpty} onPress={() => routerRef.current.push('/(tabs)/study-planner' as any)} activeOpacity={0.8}>
                <View style={s.scheduleEmptyLeft}>
                  <View style={s.scheduleEmptyIcon}><Ionicons name="time-outline" size={18} color={C.sapphire} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text maxFontSizeMultiplier={1.3} style={s.scheduleEmptyTitle}>No sessions planned today</Text>
                    <Text maxFontSizeMultiplier={1.3} style={s.scheduleEmptySub}>Add study blocks in Study Planner</Text>
                  </View>
                </View>
                <View style={s.scheduleEmptyBtn}>
                  <Ionicons name="add" size={15} color={C.void} />
                  <Text maxFontSizeMultiplier={1.3} style={s.scheduleEmptyBtnText}>Plan</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={s.scheduleWrap}>
                {todayBlocks.map((item: HomeScheduleItem, i) => (
                  <ScheduleRow key={item.id} item={item} isLast={i === todayBlocks.length - 1} />
                ))}
              </View>
            )}
          </View>

          {/* Leaderboard preview */}
          <View style={s.section}>
            <LeaderboardPreview
              userId={userId}
              collegeId={collegeId}
              onOpenFull={() => routerRef.current.push('/leaderboard' as any)}
            />
          </View>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <CustomizeModal
        visible={showCustomize}
        availableCards={availableCards}
        customCards={customCards}
        onClose={() => setShowCustomize(false)}
        onSave={setCustomCards}
      />
    </View>
  )
}

export default function HomeScreen() {
  return <HomeErrorBoundary><HomeScreenInner /></HomeErrorBoundary>
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.void },
  setupScreen:  { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  setupIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  setupTitle:   { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  setupSub:     { fontSize: 14, color: C.textMute, textAlign: 'center', lineHeight: 22 },
  setupBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  setupBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  nav:                  { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  navBrand:             { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0 },
  navLogo:              { width: 34, height: 34, borderRadius: 11, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 18, elevation: 8 },
  navWordmark:          { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontFamily: 'serif' },
  navWordmarkAccent:    { color: C.orange, fontStyle: 'italic' },
  navSearchBox:         { flex: 1, minWidth: 80, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  navSearchPlaceholder: { flex: 1, fontSize: 12, color: C.textMute, fontWeight: '500' },
  navBtn:               { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  navNotifPip:          { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.orange, borderWidth: 1.5, borderColor: C.deep },

  orbOrange: { position: 'absolute', top: -40, right: -80,  width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(232,105,42,0.12)' },
  orbBlue:   { position: 'absolute', top:  60, left: -60,   width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(75,140,245,0.07)'  },
  orbPurple: { position: 'absolute', top: 100, left: '38%', width: 160, height: 160, borderRadius: 80,  backgroundColor: 'rgba(155,124,244,0.06)' },

  hero:          { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 20, position: 'relative', overflow: 'hidden' },
  profileRow:    { flexDirection: 'column', gap: 12, position: 'relative', zIndex: 2 },
  profileTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },

  avatarWrap:    { position: 'relative', flexShrink: 0 },
  avatarRing:    { width: 70, height: 70, borderRadius: 35, padding: 2 },
  avatarInner:   { flex: 1, borderRadius: 33, backgroundColor: C.raised, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  avatarImage:   { width: '100%', height: '100%', borderRadius: 33 },
  avatarInitial: { fontSize: 26, fontWeight: '800', color: C.text, fontFamily: 'serif' },
  cameraBadge:   { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.orange, borderWidth: 2, borderColor: C.deep, justifyContent: 'center', alignItems: 'center' },

  profileText:   { flex: 1, minWidth: 0, paddingTop: 4 },
  greetingLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 2, color: C.textSub, marginBottom: 4 },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 1 },
  heroName:      { fontSize: 28, fontWeight: '900', fontFamily: 'serif', color: C.text, letterSpacing: -0.8, lineHeight: 30, flexShrink: 1 },

  pillsRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  pill:             { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillVerified:     { backgroundColor: C.emerDim,  borderColor: 'rgba(61,201,154,0.2)' },
  pillPremium:      { backgroundColor: C.goldDim,  borderColor: 'rgba(223,168,60,0.2)'  },
  pillVerifiedText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.emerald },
  pillPremiumText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.gold    },

  getPremiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 5, overflow: 'hidden', alignSelf: 'flex-start' },
  getPremiumStar:  { fontSize: 9, color: '#fff' },
  getPremiumText:  { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  infoPillsScrollWrap: { marginRight: -BODY_H_PAD, marginTop: 4 },
  infoPillsRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: BODY_H_PAD },
  infoPill:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 7, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 1 },
  infoPillClass:     { backgroundColor: 'rgba(75,140,245,0.08)', borderColor: 'rgba(75,140,245,0.2)' },
  infoPillMats:      { backgroundColor: 'rgba(223,168,60,0.08)', borderColor: 'rgba(223,168,60,0.22)' },
  infoPillIcon:      { fontSize: 14 },
  infoPillText:      { fontSize: 12, fontWeight: '700', color: C.textSub },
  infoPillClassText: { color: C.sapphire },
  infoPillMatsText:  { color: C.gold },
  infoPillRank:      { backgroundColor: 'rgba(238,104,104,0.08)', borderColor: 'rgba(238,104,104,0.22)' },
  infoPillRankText:  { color: C.coral },

  body:    { backgroundColor: C.void, paddingHorizontal: BODY_H_PAD },
  section: { marginTop: 34 },

  motCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 20, padding: 20, marginTop: 28, overflow: 'hidden' },
  motEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 2.5, color: C.orange, marginBottom: 14 },
  motQuote:   { fontSize: 16, fontWeight: '600', fontStyle: 'italic', color: C.text, lineHeight: 26, marginBottom: 12, paddingLeft: 4 },
  motAuthor:  { fontSize: 11, color: C.textSub, fontWeight: '500' },

  progRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  progTitle:     { fontSize: 13.5, fontWeight: '600', color: C.text },
  progSub:       { fontSize: 11, color: C.textSub, marginTop: 2 },
  progPct:       { fontSize: 24, fontWeight: '900', fontFamily: 'serif', color: C.emerald },
  progTrackWrap: { position: 'relative', height: 11, justifyContent: 'center' },
  progTrack:     { height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3 },
  progFill:      { height: '100%', backgroundColor: C.emerald, borderRadius: 3 },
  progDot:       { position: 'absolute', top: 0, width: 11, height: 11, borderRadius: 5.5, backgroundColor: C.emerald, borderWidth: 2, borderColor: C.void, shadowColor: C.emerald, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10, elevation: 4, marginLeft: -5.5 },
  progCta:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  progCtaText:   { fontSize: 11, color: C.textMute, fontStyle: 'italic' },

  qaGrid:   { flexDirection: 'row', flexWrap: 'wrap' },
  dashGrid: { gap: COL_GAP },
  dashRow:  { flexDirection: 'row', gap: COL_GAP },

  scheduleWrap:         { gap: 0 },
  scheduleEmpty:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16 },
  scheduleEmptyLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 10 },
  scheduleEmptyIcon:    { width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0, borderRadius: 12, backgroundColor: C.sapphDim, justifyContent: 'center', alignItems: 'center' },
  scheduleEmptyTitle:   { fontSize: 13.5, fontWeight: '700', color: C.text },
  scheduleEmptySub:     { fontSize: 11.5, color: C.textMute, marginTop: 2 },
  scheduleEmptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.sapphire, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 8 },
  scheduleEmptyBtnText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },

  deadlineAddChip:      { width: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 14, gap: 4 },
  deadlineAddText:      { fontSize: 10.5, color: C.textMute, fontWeight: '600' },
  deadlineEmpty:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16 },
  deadlineEmptyLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 10 },
  deadlineEmptyIcon:    { width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0, borderRadius: 12, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  deadlineEmptyTitle:   { fontSize: 13.5, fontWeight: '700', color: C.text },
  deadlineEmptySub:     { fontSize: 11.5, color: C.textMute, marginTop: 2 },
  deadlineEmptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.orange, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 8 },
  deadlineEmptyBtnText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
})

const sk = StyleSheet.create({
  nav:         { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  heroWrap:    { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 20 },
  profileRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16, paddingTop: 4 },
  profileText: { flex: 1, minWidth: 0, paddingTop: 4 },
  infoRow:     { flexDirection: 'row', gap: 8 },
  section:     { marginTop: 34 },
  qaGrid:      { flexDirection: 'row', flexWrap: 'wrap' },
  qaItem:      { width: '25%', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6, gap: 8 },
})