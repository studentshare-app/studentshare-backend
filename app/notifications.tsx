/**
 * app/notifications.tsx — Redesigned to match index.tsx editorial dark theme
 *
 * Consistent with index.tsx:
 * ── Same C color tokens (void, deep, surface, raised, orange, sapphire, etc.)
 * ── Fixed dark nav bar with back button + wordmark (same as index nav)
 * ── Dark hero section with ambient orbs (same as index hero)
 * ── Orange accent lines, section headers, pill/badge patterns
 * ── Card language: raised surface, border, borderLeft accent, same radius/shadow
 * ── Filter tabs in the same pill style as index scope/period tabs
 * ── Stats strip matching index info row aesthetic
 * ── Skeleton shimmer, empty state, offline banner all in dark palette
 */

import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNotifications, type Notification, type NotificationType } from '../hooks/useNotifications'
import { useProfileSync } from '../hooks/useProfileSync'

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — mirrors index.tsx exactly
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  void:      '#07080C',
  deep:      '#0B0D13',
  surface:   '#10131C',
  raised:    '#161B27',
  lift2:     '#1C2232',
  border:    'rgba(255,255,255,0.055)',
  borderHi:  'rgba(255,255,255,0.10)',
  text:      '#EEF0F8',
  textSub:   '#6E7A96',
  textMute:  '#353D52',
  orange:    '#E8692A',
  orange2:   '#F07840',
  orangeDim: 'rgba(232,105,42,0.10)',
  orangeGlow:'rgba(232,105,42,0.18)',
  gold:      '#DFA83C',
  goldDim:   'rgba(223,168,60,0.10)',
  sapphire:  '#4B8CF5',
  sapphDim:  'rgba(75,140,245,0.10)',
  emerald:   '#3DC99A',
  emerDim:   'rgba(61,201,154,0.10)',
  lavender:  '#9B7CF4',
  lavDim:    'rgba(155,124,244,0.10)',
  coral:     '#EE6868',
  coralDim:  'rgba(238,104,104,0.10)',
  sky:       '#38BDF8',
  skyDim:    'rgba(56,189,248,0.10)',
  amber:     '#FBBD34',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'materials' | 'deadlines' | 'announcements'

// ─────────────────────────────────────────────────────────────────────────────
// Notification type config — dark palette
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<NotificationType, {
  icon:      React.ComponentProps<typeof Ionicons>['name']
  color:     string
  bg:        string
  accentBar: string
  label:     string
}> = {
  material_upload:   { icon: 'document-text',  color: C.emerald,  bg: C.emerDim,  accentBar: C.emerald,  label: 'New Material'    },
  deadline_reminder: { icon: 'alarm',           color: C.gold,     bg: C.goldDim,  accentBar: C.gold,     label: 'Reminder'        },
  deadline_due:      { icon: 'alert-circle',    color: C.coral,    bg: C.coralDim, accentBar: C.coral,    label: 'Due Now'         },
  admin_broadcast:   { icon: 'megaphone',       color: C.sapphire, bg: C.sapphDim, accentBar: C.sapphire, label: 'Announcement'    },
  leaderboard:       { icon: 'trophy',          color: C.orange,   bg: C.orangeDim,accentBar: C.orange,   label: 'Leaderboard'     },
  general:           { icon: 'notifications',   color: C.sky,      bg: C.skyDim,   accentBar: C.sky,      label: 'Notification'    },
}

const FILTER_TYPES: Record<FilterTab, NotificationType[] | null> = {
  all:           null,
  materials:     ['material_upload'],
  deadlines:     ['deadline_reminder', 'deadline_due'],
  announcements: ['admin_broadcast', 'leaderboard', 'general'],
}

const FILTER_TABS: { key: FilterTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'all',           label: 'All',           icon: 'apps-outline'           },
  { key: 'materials',     label: 'Materials',     icon: 'document-text-outline'  },
  { key: 'deadlines',     label: 'Deadlines',     icon: 'alarm-outline'          },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone-outline'      },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Card — dark shimmer
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard({ index }: { index: number }) {
  const pulse = useRef(new Animated.Value(0.15)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45,  duration: 750, delay: index * 80, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.15,  duration: 750, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={[sk.card, { opacity: pulse }]}>
      <View style={sk.iconBox} />
      <View style={sk.body}>
        <View style={sk.pill} />
        <View style={sk.title} />
        <View style={sk.sub} />
      </View>
    </Animated.View>
  )
}
const sk = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 10, gap: 14, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.textMute },
  iconBox: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.raised, flexShrink: 0 },
  body:    { flex: 1, gap: 8 },
  pill:    { width: 72, height: 11, borderRadius: 6, backgroundColor: C.raised },
  title:   { width: '70%', height: 13, borderRadius: 6, backgroundColor: C.lift2 },
  sub:     { width: '50%', height: 10, borderRadius: 5, backgroundColor: C.raised },
})

// ─────────────────────────────────────────────────────────────────────────────
// Pulsing dot — orange, matches index bell pip animation
// ─────────────────────────────────────────────────────────────────────────────
function PulsingDot({ color = C.orange }: { color?: string }) {
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={{
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: color,
      transform: [{ scale: pulse }],
    }} />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline Banner — matches index.tsx dark style
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={s.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      <Text style={s.offlineText}>Offline — showing cached notifications</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Chip — same as index.tsx TagChip
// ─────────────────────────────────────────────────────────────────────────────
function TagChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[s.tagChip, { backgroundColor: bg, borderColor: color + '30' }]}>
      <Text allowFontScaling={false} style={[s.tagChipText, { color }]}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Card — dark surface, matches index card language
// ─────────────────────────────────────────────────────────────────────────────
function NotificationCard({
  item, onPress, onDelete, index,
}: {
  item: Notification; onPress: () => void; onDelete: () => void; index: number
}) {
  const fade  = useRef(new Animated.Value(0)).current
  const slide = useRef(new Animated.Value(24)).current
  const scale = useRef(new Animated.Value(0.97)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 280, delay: Math.min(index, 6) * 50, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, speed: 20, bounciness: 3, delay: Math.min(index, 6) * 50, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 20, bounciness: 3, delay: Math.min(index, 6) * 50, useNativeDriver: true }),
    ]).start()
  }, [])

  const cfg = TYPE_CONFIG[item.type ?? 'general']
  const canNavigate = item.type === 'material_upload' && !!item.metadata?.material_id

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale }] }}>
      <TouchableOpacity
        style={[
          s.card,
          !item.is_read && s.cardUnread,
          { borderLeftColor: cfg.accentBar },
        ]}
        onPress={onPress}
        activeOpacity={0.80}
      >
        {/* Left accent bar */}
        <View style={[s.accentBar, { backgroundColor: cfg.accentBar }]} pointerEvents="none" />

        {/* Icon */}
        <View style={[s.iconCircle, { backgroundColor: cfg.bg, borderColor: cfg.color + '25' }]}>
          <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
        </View>

        {/* Body */}
        <View style={s.cardBody}>
          {/* Type pill + time */}
          <View style={s.cardTop}>
            <TagChip label={cfg.label} color={cfg.color} bg={cfg.bg} />
            <Text style={s.cardTime}>{timeAgo(item.created_at)}</Text>
          </View>

          {/* Title */}
          <Text
            style={[s.cardTitle, !item.is_read && s.cardTitleBold]}
            numberOfLines={1}
          >
            {item.title}
          </Text>

          {/* Body text */}
          <Text style={s.cardText}>{item.body}</Text>

          {/* Navigate pill */}
          {canNavigate && (
            <View style={[s.actionPill, { backgroundColor: cfg.bg, borderColor: cfg.color + '30' }]}>
              <Ionicons name="arrow-forward-circle" size={12} color={cfg.color} />
              <Text style={[s.actionPillText, { color: cfg.color }]}>View material</Text>
            </View>
          )}
        </View>

        {/* Unread dot */}
        {!item.is_read && (
          <View style={[s.unreadDot, { backgroundColor: cfg.color }]} />
        )}

        {/* Delete */}
        <TouchableOpacity
          onPress={onDelete}
          style={s.deleteBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-circle" size={18} color={C.textMute} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Label — matches index sectionHead editorial style
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <View style={s.sectionLabel}>
      <View style={[s.sectionOrangeLine, { backgroundColor: color }]} />
      <Text style={s.sectionLabelText}>{label.toUpperCase()}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { profile } = useProfileSync()
  const {
    notifications,
    loading,
    isOnline,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotif,
    refetch,
  } = useNotifications(profile?.college_id, profile?.class_id)

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [refreshing,   setRefreshing]   = useState(false)

  const headerFade  = useRef(new Animated.Value(0)).current
  const headerSlide = useRef(new Animated.Value(-16)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade,  { toValue: 1, duration: 340, useNativeDriver: true }),
      Animated.spring(headerSlide, { toValue: 0, speed: 16, bounciness: 2, useNativeDriver: true }),
    ]).start()
  }, [])

  // Filter
  const filtered = notifications.filter(n => {
    const types = FILTER_TYPES[activeFilter]
    if (!types) return true
    return types.includes(n.type ?? 'general')
  })

  // Time grouping
  const now = Date.now()
  const todayItems    = filtered.filter(n => now - new Date(n.created_at).getTime() < 86_400_000)
  const thisWeekItems = filtered.filter(n => { const age = now - new Date(n.created_at).getTime(); return age >= 86_400_000 && age < 7 * 86_400_000 })
  const olderItems    = filtered.filter(n => now - new Date(n.created_at).getTime() >= 7 * 86_400_000)

  const handlePress = useCallback(async (notif: Notification) => {
    if (!notif.is_read) await markRead(notif.id)
    if (notif.type === 'material_upload' && notif.metadata?.material_id) {
      router.push('/new-materials' as any)
    }
  }, [markRead, router])

  const onRefresh = useCallback(async () => {
    if (!isOnline) return
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [isOnline, refetch])

  const tabCounts: Record<FilterTab, number> = {
    all:           notifications.length,
    materials:     notifications.filter(n => (FILTER_TYPES.materials ?? []).includes(n.type ?? 'general')).length,
    deadlines:     notifications.filter(n => (FILTER_TYPES.deadlines ?? []).includes(n.type ?? 'general')).length,
    announcements: notifications.filter(n => (FILTER_TYPES.announcements ?? []).includes(n.type ?? 'general')).length,
  }

  const renderSection = (items: Notification[], label: string, accentColor: string, startIndex: number) => {
    if (!items.length) return null
    return (
      <>
        <SectionLabel label={label} color={accentColor} />
        {items.map((item, i) => (
          <NotificationCard
            key={item.id}
            item={item}
            index={startIndex + i}
            onPress={() => handlePress(item)}
            onDelete={() => deleteNotif(item.id)}
          />
        ))}
      </>
    )
  }

  const showSkeletons = loading && notifications.length === 0

  return (
    <View style={s.container}>

      {/* ════ FIXED NAV BAR — matches index.tsx nav exactly ════ */}
      <View style={[s.nav, { paddingTop: insets.top + 10 }]}>
        {/* Ambient orbs */}
        <View style={s.orbOrange} />
        <View style={s.orbBlue} />

        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color={C.textSub} />
        </TouchableOpacity>

        <View style={s.navCenter}>
          <Text style={s.navMicro}>INBOX</Text>
          <Text style={s.navTitle}>Notifications</Text>
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn} activeOpacity={0.8}>
            <Ionicons name="checkmark-done" size={14} color={C.orange} />
            <Text style={s.markAllText}>All read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      {!isOnline && notifications.length > 0 && <OfflineBanner />}

      {/* ════ SCROLLABLE CONTENT ════ */}
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48, paddingTop: insets.top + 72 }}
      >

        {/* ════ HERO — matches index dark hero with orbs ════ */}
        <Animated.View
          style={[
            s.hero,
            { opacity: headerFade, transform: [{ translateY: headerSlide }] },
          ]}
        >
          {/* Unread pulsing pill */}
          {unreadCount > 0 && (
            <View style={s.unreadPill}>
              <PulsingDot color={C.orange} />
              <Text style={s.unreadPillText}>
                {unreadCount} unread{unreadCount !== 1 ? ' notifications' : ' notification'}
              </Text>
            </View>
          )}

          {/* Stats strip — matches index infoRow style */}
          <View style={s.statsStrip}>
            <View style={s.statItem}>
              <Text style={s.statNum}>{notifications.length}</Text>
              <Text style={s.statLabel}>Total</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statNum, unreadCount > 0 && { color: C.orange }]}>{unreadCount}</Text>
              <Text style={s.statLabel}>Unread</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{todayItems.length}</Text>
              <Text style={s.statLabel}>Today</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statNum}>
                {notifications.filter(n => n.type === 'material_upload').length}
              </Text>
              <Text style={s.statLabel}>Materials</Text>
            </View>
          </View>

          {/* Filter tabs — matches index period tabs style */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterScroll}
          >
            {FILTER_TABS.map(tab => {
              const active = activeFilter === tab.key
              const count  = tabCounts[tab.key]
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.filterTab, active && s.filterTabActive]}
                  onPress={() => setActiveFilter(tab.key)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={tab.icon}
                    size={12}
                    color={active ? C.orange : C.textSub}
                  />
                  <Text style={[s.filterTabText, active && s.filterTabTextActive]}>
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View style={[s.filterBadge, active && s.filterBadgeActive]}>
                      <Text style={[s.filterBadgeText, active && s.filterBadgeTextActive]}>
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </Animated.View>

        {/* ════ BODY ════ */}
        <View style={s.body}>
          {showSkeletons ? (
            <View>
              {Array(5).fill(null).map((_, i) => <SkeletonCard key={i} index={i} />)}
            </View>
          ) : filtered.length === 0 ? (
            /* Empty state — matches index setupScreen aesthetic */
            <View style={s.emptyState}>
              <View style={s.emptyIconBox}>
                <Ionicons
                  name={activeFilter === 'all' ? 'notifications-off-outline' : 'filter-outline'}
                  size={34}
                  color={C.orange}
                />
              </View>
              <Text style={s.emptyTitle}>
                {activeFilter === 'all' ? 'All caught up' : `No ${activeFilter} notifications`}
              </Text>
              <Text style={s.emptySub}>
                {activeFilter === 'all'
                  ? "We'll notify you when materials are added, deadlines approach, or admins post announcements."
                  : `Switch to "All" to see everything, or check back later.`}
              </Text>
              {activeFilter === 'materials' && (
                <TouchableOpacity
                  style={s.ctaBtn}
                  onPress={() => router.push('/new-materials' as any)}
                >
                  <Ionicons name="library-outline" size={15} color={C.void} />
                  <Text style={s.ctaBtnText}>Browse Materials</Text>
                </TouchableOpacity>
              )}
              {activeFilter !== 'all' && (
                <TouchableOpacity
                  style={s.ctaBtnSecondary}
                  onPress={() => setActiveFilter('all')}
                >
                  <Text style={s.ctaBtnSecondaryText}>Show all</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={[]}
              keyExtractor={() => ''}
              renderItem={null}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
              onRefresh={isOnline ? onRefresh : undefined}
              refreshing={refreshing}
              scrollEnabled={false}
              ListHeaderComponent={
                <>
                  {renderSection(todayItems,    'Today',     C.orange,   0)}
                  {renderSection(thisWeekItems, 'This week', C.sapphire, todayItems.length)}
                  {renderSection(olderItems,    'Earlier',   C.textSub,  todayItems.length + thisWeekItems.length)}
                </>
              }
            />
          )}
        </View>
      </ScrollView>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — fully aligned with index.tsx design tokens
// ─────────────────────────────────────────────────────────────────────────────
const BODY_H_PAD = 22

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  scroll:    { flex: 1, backgroundColor: C.void },

  // ── Offline banner (same as index) ───────────────────────────────────────
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(223,168,60,0.12)',
    borderBottomWidth: 1, borderBottomColor: C.gold + '30',
    paddingVertical: 8,
  },
  offlineText: { fontSize: 12, fontWeight: '600', color: C.gold },

  // ── NAV — fixed, identical structure to index ─────────────────────────────
  nav: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: C.deep,
    paddingHorizontal: BODY_H_PAD,
    paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    overflow: 'hidden',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  orbOrange: { position: 'absolute', top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(232,105,42,0.10)' },
  orbBlue:   { position: 'absolute', top: 20, left: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(75,140,245,0.06)' },

  backBtn: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  navCenter: { alignItems: 'center' },
  navMicro:  { fontSize: 9, fontWeight: '700', letterSpacing: 2.5, color: C.orange, marginBottom: 2 },
  navTitle:  { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.3, fontFamily: 'serif' },

  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  markAllText: { fontSize: 11, fontWeight: '700', color: C.orange },

  // ── HERO — dark surface, same as index hero ───────────────────────────────
  hero: {
    backgroundColor: C.deep,
    paddingHorizontal: BODY_H_PAD,
    paddingBottom: 0,
  },

  // Unread pill — orange, matches index annCountBadge style
  unreadPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 16,
  },
  unreadPillText: { fontSize: 12, fontWeight: '700', color: C.orange },

  // Stats strip — same as index infoRow
  statsStrip: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border,
    marginBottom: 0,
  },
  statItem:   { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum:    { fontSize: 20, fontWeight: '900', color: C.text, fontFamily: 'serif', marginBottom: 3 },
  statLabel:  { fontSize: 9, fontWeight: '700', letterSpacing: 2, color: C.textMute },
  statDivider:{ width: 1, height: 30, backgroundColor: C.border },

  // Filter tabs — same as index period tabs
  filterScroll: { gap: 8, paddingVertical: 16 },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 6,
    borderRadius: 100, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  filterTabActive:    { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  filterTabText:      { fontSize: 11.5, fontWeight: '600', color: C.textSub },
  filterTabTextActive:{ color: C.orange },
  filterBadge:        { backgroundColor: C.raised, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  filterBadgeActive:  { backgroundColor: C.orangeDim },
  filterBadgeText:    { fontSize: 10, fontWeight: '800', color: C.textSub },
  filterBadgeTextActive:{ color: C.orange },

  // ── BODY ─────────────────────────────────────────────────────────────────
  body: {
    backgroundColor: C.void,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -16, paddingTop: 24, paddingHorizontal: BODY_H_PAD,
  },

  // Section label — editorial style, same as index sectionHead
  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 14, marginTop: 6,
  },
  sectionOrangeLine: { width: 14, height: 1, opacity: 0.7 },
  sectionLabelText:  { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },

  // Tag chip — same as index
  tagChip:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagChipText:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },

  // ── Notification card — dark surface, index card language ────────────────
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderRadius: 20, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3,
    gap: 13, position: 'relative', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
  },
  cardUnread: {
    backgroundColor: C.raised,
    borderColor: C.borderHi,
    shadowOpacity: 0.25,
  },
  accentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
  },
  iconCircle: {
    width: 46, height: 46, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0, borderWidth: 1,
  },
  cardBody:  { flex: 1 },
  cardTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '500', color: C.textSub, marginBottom: 4 },
  cardTitleBold: { fontWeight: '700', color: C.text },
  cardTime:  { fontSize: 10.5, color: C.textMute, fontWeight: '500', flexShrink: 0 },
  cardText:  { fontSize: 12.5, color: C.textSub, lineHeight: 18 },

  actionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 7,
  },
  actionPillText: { fontSize: 11, fontWeight: '700' },

  deleteBtn:  { paddingTop: 2, flexShrink: 0 },
  unreadDot:  { position: 'absolute', top: 10, right: 34, width: 7, height: 7, borderRadius: 4 },

  // ── Empty state — matches index setupScreen ───────────────────────────────
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingTop: 60, gap: 14,
  },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
    shadowColor: C.orange, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 6,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4, fontFamily: 'serif' },
  emptySub:   { fontSize: 13.5, color: C.textSub, textAlign: 'center', lineHeight: 22 },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.orange, borderRadius: 16,
    paddingHorizontal: 24, paddingVertical: 13, marginTop: 4,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  ctaBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 11, marginTop: 4,
  },
  ctaBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: C.textSub },
})