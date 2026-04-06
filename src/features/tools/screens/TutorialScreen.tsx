/**
 * app/tutorial.tsx
 * Tutorial Screen
 *
 * Full-featured tutorial/video content browser:
 *  - Featured hero tutorial with play button
 *  - Filter chips (All · Recorded · Live · Short clips)
 *  - Subject/course filter pills
 *  - Horizontal "trending" row
 *  - Vertical full list with duration, views, tutor info
 *  - AI-recommended banner
 *  - Sticky mini player hint when browsing
 */

import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ─────────────────────────────────────────────
// Design Tokens (matches index.tsx)
// ─────────────────────────────────────────────
const C = {
  void:      '#08090C',
  deep:      '#0C0E14',
  surface:   '#111318',
  raised:    '#161A22',
  border:    '#1E2330',
  borderHi:  '#2A3145',
  text:      '#EEF0F6',
  textSub:   '#8B93A8',
  textMute:  '#4A5168',
  gold:      '#F0C060',
  goldGlow:  '#D4983A',
  goldDim:   '#2A1E08',
  silver:    '#C0C8D8',
  sapphire:  '#5B8DEF',
  sapphGlow: '#2D5AB8',
  sapphDim:  '#0D1A35',
  emerald:   '#44D4A0',
  emerDim:   '#0A2C1E',
  coral:     '#FF7B7B',
  coralDim:  '#2A0E0E',
  lavender:  '#A78BFA',
  lavDim:    '#1E1040',
  amber:     '#FBBD34',
  orange:    '#FB923C',
  orangeDim: '#2A1208',
  sky:       '#38BDF8',
  skyDim:    '#0D1E2A',
  pink:      '#E879F9',
  pinkDim:   '#260830',
} as const

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type FilterKey = 'all' | 'recorded' | 'live' | 'shorts'
type Tutorial = {
  id: string
  title: string
  tutor: string
  tutorAvatar?: string
  subject: string
  duration: string
  views: string
  type: 'recorded' | 'live' | 'shorts'
  thumbnail?: string
  isNew?: boolean
  isPopular?: boolean
  rating?: number
  tags: string[]
}

// ─────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────
const SUBJECTS = ['All', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'CS', 'Economics', 'Law']

const TUTORIALS: Tutorial[] = [
  {
    id: '1',
    title: 'Differential Equations: Complete Master Class',
    tutor: 'Dr. Amara Sesay',
    subject: 'Mathematics',
    duration: '2h 14m',
    views: '14.2k',
    type: 'recorded',
    isPopular: true,
    rating: 4.9,
    tags: ['Calculus', 'ODE', 'PDE'],
  },
  {
    id: '2',
    title: 'Quantum Mechanics — Wave-Particle Duality Explained',
    tutor: 'Prof. Kofi Mensah',
    subject: 'Physics',
    duration: '58m',
    views: '8.7k',
    type: 'recorded',
    isNew: true,
    rating: 4.7,
    tags: ['Quantum', 'Modern Physics'],
  },
  {
    id: '3',
    title: 'LIVE: Organic Chemistry Exam Prep — Reaction Mechanisms',
    tutor: 'Dr. Fatima Diallo',
    subject: 'Chemistry',
    duration: 'Live now',
    views: '321 watching',
    type: 'live',
    rating: 4.8,
    tags: ['Organic', 'Reactions', 'Exam Prep'],
  },
  {
    id: '4',
    title: 'Data Structures in 60 Seconds: Linked Lists',
    tutor: 'Emmanuel Osei',
    subject: 'CS',
    duration: '1m 2s',
    views: '22.1k',
    type: 'shorts',
    isPopular: true,
    tags: ['DSA', 'Python'],
  },
  {
    id: '5',
    title: 'Microeconomics: Supply & Demand Deep Dive',
    tutor: 'Dr. Amara Sesay',
    subject: 'Economics',
    duration: '1h 30m',
    views: '5.4k',
    type: 'recorded',
    rating: 4.6,
    tags: ['Micro', 'Markets'],
  },
  {
    id: '6',
    title: 'Cell Division — Mitosis vs Meiosis Visual Guide',
    tutor: 'Dr. Ama Owusu',
    subject: 'Biology',
    duration: '42m',
    views: '11.3k',
    type: 'recorded',
    isNew: true,
    rating: 4.8,
    tags: ['Cell Bio', 'Genetics'],
  },
  {
    id: '7',
    title: 'LIVE: Law of Torts — Case Study Marathon',
    tutor: 'Barr. Kwame Asante',
    subject: 'Law',
    duration: 'Starts in 20m',
    views: '87 registered',
    type: 'live',
    tags: ['Tort Law', 'Cases'],
  },
  {
    id: '8',
    title: 'Binomial Theorem: Quick Visual Proof',
    tutor: 'Emmanuel Osei',
    subject: 'Mathematics',
    duration: '0m 48s',
    views: '18.9k',
    type: 'shorts',
    isPopular: true,
    tags: ['Algebra'],
  },
  {
    id: '9',
    title: 'Big-O Notation Explained Simply',
    tutor: 'Emmanuel Osei',
    subject: 'CS',
    duration: '55m',
    views: '9.1k',
    type: 'recorded',
    rating: 4.9,
    tags: ['DSA', 'Algorithms'],
  },
]

const TRENDING = TUTORIALS.filter(t => t.isPopular || t.type === 'live').slice(0, 4)

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function typeConfig(type: Tutorial['type']): { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name']; label: string } {
  switch (type) {
    case 'live':    return { color: C.coral,    bg: C.coralDim, icon: 'radio',       label: 'LIVE'     }
    case 'shorts':  return { color: C.gold,     bg: C.goldDim,  icon: 'flash',       label: 'SHORT'    }
    default:        return { color: C.sapphire, bg: C.sapphDim, icon: 'play-circle', label: 'VIDEO'    }
  }
}

function subjectColor(subject: string): string {
  const map: Record<string, string> = {
    Mathematics: C.sapphire,
    Physics:     C.lavender,
    Chemistry:   C.emerald,
    Biology:     C.emerald,
    CS:          C.gold,
    Economics:   C.orange,
    Law:         C.coral,
  }
  return map[subject] ?? C.textMute
}

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// Thumbnail Placeholder
// ─────────────────────────────────────────────
function ThumbnailPlaceholder({ subject, size = 'normal' }: { subject: string; size?: 'normal' | 'large' | 'small' }) {
  const color  = subjectColor(subject)
  const emojis: Record<string, string> = {
    Mathematics: '∑', Physics: 'ψ', Chemistry: '⚗', Biology: '🧬',
    CS: '</>', Economics: '📊', Law: '⚖', All: '🎬',
  }
  const emoji   = emojis[subject] ?? '🎬'
  const heights = { large: 196, normal: 108, small: 80 }
  const sizes   = { large: 48, normal: 28, small: 22 }

  return (
    <View style={[t.thumbPlaceholder, {
      height: heights[size],
      backgroundColor: color + '10',
      borderColor: color + '20',
    }]}>
      <Text style={{ fontSize: sizes[size], fontWeight: '800', color: color + 'CC' }}>{emoji}</Text>
      <View style={[t.thumbDot, { backgroundColor: color + '30' }]} />
    </View>
  )
}

// ─────────────────────────────────────────────
// Featured Card (hero)
// ─────────────────────────────────────────────
function FeaturedCard({ tutorial }: { tutorial: Tutorial }) {
  const tc = typeConfig(tutorial.type)
  return (
    <ScalePress style={t.featuredCard}>
      <ThumbnailPlaceholder subject={tutorial.subject} size="large" />
      {/* Gradient overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(8,9,12,0.85)', C.void]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={t.featuredOverlay}
      >
        {/* Play button */}
        <View style={t.featuredPlayBtn}>
          <Ionicons name="play" size={22} color="#fff" />
        </View>
        <View style={t.featuredInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <View style={[t.typePill, { backgroundColor: tc.color + '22', borderColor: tc.color + '50' }]}>
              <Ionicons name={tc.icon} size={10} color={tc.color} />
              <Text allowFontScaling={false} style={[t.typePillText, { color: tc.color }]}>{tc.label}</Text>
            </View>
            <View style={[t.subjectPill, { backgroundColor: subjectColor(tutorial.subject) + '18' }]}>
              <Text allowFontScaling={false} style={[t.subjectPillText, { color: subjectColor(tutorial.subject) }]}>{tutorial.subject}</Text>
            </View>
            {tutorial.isPopular && (
              <View style={t.popularPill}>
                <Text allowFontScaling={false} style={t.popularText}>🔥 Trending</Text>
              </View>
            )}
          </View>
          <Text maxFontSizeMultiplier={1.2} style={t.featuredTitle} numberOfLines={2}>{tutorial.title}</Text>
          <View style={t.featuredMeta}>
            <View style={t.tutorRow}>
              <View style={t.tutorAvFb}><Text style={t.tutorAvInit}>{tutorial.tutor.charAt(0)}</Text></View>
              <Text allowFontScaling={false} style={t.tutorName}>{tutorial.tutor}</Text>
            </View>
            <View style={t.metaDot} />
            <Text allowFontScaling={false} style={t.metaText}>{tutorial.duration}</Text>
            <View style={t.metaDot} />
            <Text allowFontScaling={false} style={t.metaText}>{tutorial.views} views</Text>
            {tutorial.rating && (
              <>
                <View style={t.metaDot} />
                <Text allowFontScaling={false} style={[t.metaText, { color: C.gold }]}>⭐ {tutorial.rating}</Text>
              </>
            )}
          </View>
        </View>
      </LinearGradient>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// Trending Card (horizontal)
// ─────────────────────────────────────────────
function TrendingCard({ tutorial }: { tutorial: Tutorial }) {
  const tc = typeConfig(tutorial.type)
  return (
    <ScalePress style={t.trendCard}>
      <ThumbnailPlaceholder subject={tutorial.subject} size="small" />
      {/* Live pulse */}
      {tutorial.type === 'live' && (
        <View style={t.livePulseBadge}>
          <View style={t.livePulseDot} />
          <Text allowFontScaling={false} style={t.livePulseText}>LIVE</Text>
        </View>
      )}
      {tutorial.type === 'shorts' && (
        <View style={[t.livePulseBadge, { backgroundColor: C.goldDim, borderColor: C.gold + '40' }]}>
          <Ionicons name="flash" size={9} color={C.gold} />
          <Text allowFontScaling={false} style={[t.livePulseText, { color: C.gold }]}>SHORT</Text>
        </View>
      )}
      <View style={t.trendInfo}>
        <Text maxFontSizeMultiplier={1.1} style={t.trendTitle} numberOfLines={2}>{tutorial.title}</Text>
        <Text allowFontScaling={false} style={t.trendMeta}>{tutorial.tutor}</Text>
        <View style={t.trendBottom}>
          <Text allowFontScaling={false} style={[t.trendDuration, { color: tc.color }]}>{tutorial.duration}</Text>
          <Text allowFontScaling={false} style={t.trendViews}>{tutorial.views}</Text>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// Tutorial List Row
// ─────────────────────────────────────────────
function TutorialRow({ tutorial }: { tutorial: Tutorial }) {
  const tc    = typeConfig(tutorial.type)
  const color = subjectColor(tutorial.subject)
  return (
    <ScalePress style={t.listRow}>
      <View style={t.listThumbWrap}>
        <ThumbnailPlaceholder subject={tutorial.subject} size="small" />
        {/* Duration badge */}
        <View style={t.durationBadge}>
          <Text allowFontScaling={false} style={t.durationText}>{tutorial.duration}</Text>
        </View>
      </View>
      <View style={t.listInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <View style={[t.typePillSm, { backgroundColor: tc.bg, borderColor: tc.color + '35' }]}>
            <Ionicons name={tc.icon} size={9} color={tc.color} />
            <Text allowFontScaling={false} style={[t.typePillSmText, { color: tc.color }]}>{tc.label}</Text>
          </View>
          <View style={[t.typePillSm, { backgroundColor: color + '14', borderColor: color + '25' }]}>
            <Text allowFontScaling={false} style={[t.typePillSmText, { color }]}>{tutorial.subject}</Text>
          </View>
          {tutorial.isNew && (
            <View style={[t.typePillSm, { backgroundColor: C.emerDim, borderColor: C.emerald + '35' }]}>
              <Text allowFontScaling={false} style={[t.typePillSmText, { color: C.emerald }]}>NEW</Text>
            </View>
          )}
        </View>
        <Text maxFontSizeMultiplier={1.1} style={t.listTitle} numberOfLines={2}>{tutorial.title}</Text>
        <View style={t.listMetaRow}>
          <View style={t.tutorRowSm}>
            <View style={[t.tutorAvFbSm, { backgroundColor: color + '20' }]}>
              <Text style={[t.tutorAvInitSm, { color }]}>{tutorial.tutor.charAt(0)}</Text>
            </View>
            <Text allowFontScaling={false} style={t.tutorNameSm} numberOfLines={1}>{tutorial.tutor}</Text>
          </View>
          {tutorial.rating && (
            <Text allowFontScaling={false} style={t.ratingText}>⭐ {tutorial.rating}</Text>
          )}
          <Text allowFontScaling={false} style={t.viewsText}>{tutorial.views}</Text>
        </View>
        {/* Tags */}
        <View style={t.tagRow}>
          {tutorial.tags.slice(0, 2).map(tag => (
            <View key={tag} style={t.tag}>
              <Text allowFontScaling={false} style={t.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <TouchableOpacity style={t.playBtnSm} activeOpacity={0.8}>
        <Ionicons name="play" size={14} color="#fff" />
      </TouchableOpacity>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// AI Recommended Banner
// ─────────────────────────────────────────────
function AIRecommendBanner() {
  return (
    <LinearGradient
      colors={[C.lavender + '18', C.sapphire + '12', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={t.aiBanner}
    >
      <View style={t.aiIconBox}>
        <Text style={{ fontSize: 18 }}>✦</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={1.2} style={t.aiBannerTitle}>AI Tutor Recommended</Text>
        <Text allowFontScaling={false} style={t.aiBannerSub}>Based on your study history & upcoming exams</Text>
      </View>
      <TouchableOpacity style={t.aiBtn} activeOpacity={0.85}>
        <Text allowFontScaling={false} style={t.aiBtnText}>Explore</Text>
        <Ionicons name="arrow-forward" size={12} color={C.lavender} />
      </TouchableOpacity>
    </LinearGradient>
  )
}

// ─────────────────────────────────────────────
// TUTORIAL SCREEN
// ─────────────────────────────────────────────
export default function TutorialScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const [filter,  setFilter]  = useState<FilterKey>('all')
  const [subject, setSubject] = useState('All')

  const featured = TUTORIALS[0]

  const filtered = useMemo(() => {
    return TUTORIALS.filter(tut => {
      const matchFilter  = filter === 'all' || tut.type === filter
      const matchSubject = subject === 'All' || tut.subject === subject
      return matchFilter && matchSubject
    })
  }, [filter, subject])

  const FILTER_TABS: { key: FilterKey; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; bg: string }[] = [
    { key: 'all',      icon: 'grid',        label: 'All',       color: C.text,    bg: C.raised    },
    { key: 'recorded', icon: 'play-circle', label: 'Recorded',  color: C.sapphire,bg: C.sapphDim  },
    { key: 'live',     icon: 'radio',       label: 'Live',      color: C.coral,   bg: C.coralDim  },
    { key: 'shorts',   icon: 'flash',       label: 'Shorts',    color: C.gold,    bg: C.goldDim   },
  ]

  return (
    <View style={t.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.void} />

      {/* ── HEADER ── */}
      <View style={[t.header, { paddingTop: insets.top + 10 }]}>
        <View style={t.headerGlow} />
        <View style={t.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={t.backBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={18} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={1.2} style={t.headerTitle}>Tutorials</Text>
            <Text allowFontScaling={false} style={t.headerSub}>Video content · {TUTORIALS.length} videos</Text>
          </View>
          <TouchableOpacity style={t.searchIconBtn} activeOpacity={0.8}>
            <Ionicons name="search" size={17} color={C.gold} />
          </TouchableOpacity>
          <TouchableOpacity style={t.filterIconBtn} activeOpacity={0.8}>
            <Ionicons name="options" size={17} color={C.textSub} />
          </TouchableOpacity>
        </View>

        {/* Filter type tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={t.filterTabsRow}>
          {FILTER_TABS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[
                t.filterTab,
                filter === f.key
                  ? { backgroundColor: f.bg, borderColor: f.color + '45' }
                  : { backgroundColor: C.raised, borderColor: C.border },
              ]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={f.icon} size={12} color={filter === f.key ? f.color : C.textMute} />
              <Text
                allowFontScaling={false}
                style={[t.filterTabText, { color: filter === f.key ? f.color : C.textMute }]}
              >
                {f.label}
              </Text>
              {f.key === 'live' && (
                <View style={t.liveIndicator} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >
        {/* Subject pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={t.subjectRow}
        >
          {SUBJECTS.map(sub => (
            <TouchableOpacity
              key={sub}
              style={[
                t.subjectPillBtn,
                subject === sub && {
                  backgroundColor: subjectColor(sub) + '18',
                  borderColor:     subjectColor(sub) + '45',
                },
              ]}
              onPress={() => setSubject(sub)}
              activeOpacity={0.8}
            >
              <Text
                allowFontScaling={false}
                style={[
                  t.subjectPillBtnText,
                  { color: subject === sub ? subjectColor(sub) : C.textMute },
                ]}
              >
                {sub}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── FEATURED ── */}
        {filter === 'all' && subject === 'All' && (
          <View style={t.section}>
            <View style={t.sectionHead}>
              <View style={t.sectionLabelBox}>
                <View style={t.sectionAccent} />
                <Text maxFontSizeMultiplier={1.2} style={t.sectionTitle}>Featured</Text>
              </View>
            </View>
            <FeaturedCard tutorial={featured} />
          </View>
        )}

        {/* ── AI RECOMMEND ── */}
        <View style={t.sectionPadH}>
          <AIRecommendBanner />
        </View>

        {/* ── TRENDING ── */}
        {filter === 'all' && (
          <View style={t.section}>
            <View style={t.sectionHead}>
              <View style={t.sectionLabelBox}>
                <View style={[t.sectionAccent, { backgroundColor: C.coral }]} />
                <Text maxFontSizeMultiplier={1.2} style={t.sectionTitle}>Trending Now</Text>
              </View>
              <Text allowFontScaling={false} style={t.seeAll}>See all ›</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 18, paddingRight: 6, gap: 12 }}
            >
              {TRENDING.map(tut => (
                <TrendingCard key={tut.id} tutorial={tut} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── MAIN LIST ── */}
        <View style={t.section}>
          <View style={t.sectionHead}>
            <View style={t.sectionLabelBox}>
              <View style={[t.sectionAccent, { backgroundColor: C.sapphire }]} />
              <Text maxFontSizeMultiplier={1.2} style={t.sectionTitle}>
                {filter === 'all' ? 'All Videos' : filter === 'live' ? 'Live & Upcoming' : filter === 'shorts' ? 'Short Clips' : 'Recorded Videos'}
                {'  '}
                <Text style={t.sectionCount}>{filtered.length}</Text>
              </Text>
            </View>
          </View>
          <View style={t.listWrap}>
            {filtered.length === 0 ? (
              <View style={t.emptyState}>
                <Text style={{ fontSize: 36 }}>🎬</Text>
                <Text maxFontSizeMultiplier={1.2} style={t.emptyTitle}>No tutorials found</Text>
                <Text allowFontScaling={false} style={t.emptySub}>Try a different filter or subject</Text>
              </View>
            ) : (
              filtered.map((tut, i) => (
                <View key={tut.id}>
                  <TutorialRow tutorial={tut} />
                  {i < filtered.length - 1 && <View style={t.divider} />}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const t = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.void },

  // Header
  header:        { backgroundColor: C.deep, paddingHorizontal: 18, paddingBottom: 0, position: 'relative', overflow: 'hidden' },
  headerGlow:    { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: C.gold + '09' },
  headerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  backBtn:       { width: 38, height: 38, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerTitle:   { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  headerSub:     { fontSize: 11.5, color: C.textMute, marginTop: 2 },
  searchIconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.goldDim, borderWidth: 1, borderColor: C.gold + '22', justifyContent: 'center', alignItems: 'center' },
  filterIconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.raised,  borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },

  // Filter tabs
  filterTabsRow: { paddingBottom: 16, gap: 8, flexDirection: 'row' },
  filterTab:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100, borderWidth: 1, position: 'relative' },
  filterTabText: { fontSize: 12, fontWeight: '700' },
  liveIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.coral, position: 'absolute', top: -2, right: -2, borderWidth: 1.5, borderColor: C.deep },

  // Subject row
  subjectRow:        { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, gap: 7 },
  subjectPillBtn:    { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.raised },
  subjectPillBtnText:{ fontSize: 12, fontWeight: '600' },

  // Sections
  section:       { marginBottom: 24 },
  sectionPadH:   { paddingHorizontal: 18, marginBottom: 24 },
  sectionHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, marginBottom: 14 },
  sectionLabelBox:{ flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionAccent: { width: 3, height: 18, borderRadius: 2, backgroundColor: C.gold },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sectionCount:  { fontSize: 13, fontWeight: '600', color: C.textMute },
  seeAll:        { fontSize: 13, fontWeight: '600', color: C.sapphire },

  // Featured card
  featuredCard:    { marginHorizontal: 18, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  featuredOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
  featuredPlayBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 10,
    backdropFilter: 'blur(8px)',
  },
  featuredInfo:  { paddingHorizontal: 16, paddingBottom: 16 },
  featuredTitle: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginBottom: 10, lineHeight: 24 },
  featuredMeta:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaDot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.textMute },
  metaText:      { fontSize: 11.5, color: C.textSub },

  // Thumbnail
  thumbPlaceholder: { width: '100%', borderRadius: 0, borderWidth: 0, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },
  thumbDot:         { position: 'absolute', bottom: -30, right: -30, width: 100, height: 100, borderRadius: 50, opacity: 0.15 },

  // Type / subject pills
  typePill:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1 },
  typePillText:   { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  subjectPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  subjectPillText:{ fontSize: 9.5, fontWeight: '700' },
  popularPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: C.coralDim },
  popularText:    { fontSize: 9.5, fontWeight: '700', color: C.coral },

  // Tutor row
  tutorRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tutorAvFb:   { width: 20, height: 20, borderRadius: 7, backgroundColor: C.sapphDim, justifyContent: 'center', alignItems: 'center' },
  tutorAvInit: { fontSize: 9, fontWeight: '800', color: C.sapphire },
  tutorName:   { fontSize: 11.5, color: C.textSub, fontWeight: '500' },

  // Trending card
  trendCard:  { width: 170, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: 'hidden' },
  livePulseBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.coralDim, borderWidth: 1, borderColor: C.coral + '40', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  livePulseDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.coral },
  livePulseText:  { fontSize: 9, fontWeight: '800', color: C.coral, letterSpacing: 0.5 },
  trendInfo:   { padding: 12 },
  trendTitle:  { fontSize: 12.5, fontWeight: '700', color: C.text, lineHeight: 17, marginBottom: 5 },
  trendMeta:   { fontSize: 10.5, color: C.textMute, marginBottom: 7 },
  trendBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trendDuration:{ fontSize: 10.5, fontWeight: '700' },
  trendViews:  { fontSize: 10, color: C.textMute },

  // List rows
  listWrap:    { paddingHorizontal: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 22, overflow: 'hidden', marginHorizontal: 18 },
  listRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 2, position: 'relative' },
  divider:     { height: 1, backgroundColor: C.border, opacity: 0.5 },
  listThumbWrap:{ width: 108, flexShrink: 0, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  durationBadge:{ position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(8,9,12,0.8)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  durationText: { fontSize: 9.5, fontWeight: '700', color: C.text },
  listInfo:    { flex: 1, minWidth: 0 },
  listTitle:   { fontSize: 13, fontWeight: '700', color: C.text, lineHeight: 18, marginBottom: 6 },
  listMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' },
  ratingText:  { fontSize: 10.5, color: C.gold },
  viewsText:   { fontSize: 10.5, color: C.textMute },
  tagRow:      { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tag:         { paddingHorizontal: 7, paddingVertical: 2, backgroundColor: C.raised, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  tagText:     { fontSize: 9.5, color: C.textMute, fontWeight: '600' },

  // Small tutor row (list)
  tutorRowSm:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tutorAvFbSm:  { width: 16, height: 16, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  tutorAvInitSm:{ fontSize: 8, fontWeight: '800' },
  tutorNameSm:  { fontSize: 10.5, color: C.textMute, maxWidth: 80 },

  // Small type pill
  typePillSm:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  typePillSmText:  { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },

  // Play btn
  playBtnSm: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.sapphire, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', flexShrink: 0 },

  // AI Banner
  aiBanner:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.lavender + '25', borderRadius: 20, padding: 15 },
  aiIconBox:     { width: 42, height: 42, borderRadius: 13, backgroundColor: C.lavDim, borderWidth: 1, borderColor: C.lavender + '30', justifyContent: 'center', alignItems: 'center' },
  aiBannerTitle: { fontSize: 13.5, fontWeight: '800', color: C.text, marginBottom: 2 },
  aiBannerSub:   { fontSize: 11, color: C.textMute },
  aiBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.lavDim, borderWidth: 1, borderColor: C.lavender + '30', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  aiBtnText:     { fontSize: 12, fontWeight: '700', color: C.lavender },

  // Empty state
  emptyState:{ alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle:{ fontSize: 16, fontWeight: '800', color: C.text },
  emptySub:  { fontSize: 13, color: C.textMute },
})
