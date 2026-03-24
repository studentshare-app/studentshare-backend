/**
 * app/(tabs)/index.tsx
 * Home Screen — Editorial Redesign v3
 *
 * Changes from v2:
 *  1. Nav bar is now FIXED/STICKY — sits above the ScrollView, not inside it
 *  2. Hero name: removed 👋 wave emoji and ! exclamation mark; Meta-style verified badge
 *  3. Info row: college uses short_name + 🏛 icon; "MAJOR" → "CLASS" + 🎓 icon
 *  4. AI Tutor quick action: vibrant blue color
 *  5. Dashboard cards: fixed equal height (150), 3 rows × 2 cols; added Contribute + Contributors
 *  6. Recent Materials: collapsible toggle, shows latest 5
 *  7. Leaderboard "Full board" → router.push('/leaderboard') instead of modal
 *
 * v4 changes:
 *  - C color map imported from @/lib/colors (no longer inline)
 *  - Leaderboard fetch functions imported from @/lib/leaderboard (no longer inline)
 *  - Old LeaderboardModal replaced with shared LeaderboardModal from @/components/leaderboard/LeaderboardModal
 *  - Old inline LeaderboardModal, PodiumSlot, LeaderRankRow, CollegeRankRow,
 *    BreakdownBar, MovementChip, BreakdownCard, MyPositionFooter, CollegeRankRow
 *    all removed — they live in components/leaderboard/ now
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'

const BODY_H_PAD = 22
const COL_GAP    = 10

import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAvatarRefetchLocked, lockAvatarRefetch, useProfileSync } from '../../hooks/useProfileSync'
import { supabase } from '../../lib/supabase'

// ─────────────────────────────────────────────
// Design Tokens — imported from shared lib
// ─────────────────────────────────────────────
import { C } from '../../lib/colors'

// ─────────────────────────────────────────────
// Leaderboard — imported from shared lib + components
// ─────────────────────────────────────────────
import { LeaderboardModal } from '../../components/leaderboard/LeaderboardModal'
import {
  fetchCollegeLeaderboard,
} from '../../lib/leaderboard'

// ─────────────────────────────────────────────
// Error Boundary
// ─────────────────────────────────────────────
type EBState = { hasError: boolean; message: string }
class HomeErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error.message }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HomeScreen Error]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={eb.screen}>
          <View style={eb.iconBox}>
            <Ionicons name="warning-outline" size={32} color={C.coral} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={eb.title}>Something went wrong</Text>
          <Text maxFontSizeMultiplier={1.3} style={eb.sub}>{this.state.message}</Text>
          <TouchableOpacity
            style={eb.btn}
            onPress={() => this.setState({ hasError: false, message: '' })}
          >
            <Text maxFontSizeMultiplier={1.3} style={eb.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return this.props.children
  }
}
const eb = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 32 },
  iconBox: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.coralDim, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  title:   { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sub:     { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20 },
  btn:     { marginTop: 8, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13 },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Profile = {
  full_name: string
  avatar_url: string | null
  college_id: string | null
  class_id: string | null
  is_verified: boolean
  is_premium: boolean
  bio: string | null
  role: string | null
  college: { name: string; short_name: string } | null
  class: { name: string } | null
}
type Material     = { id: string; title: string; type: string; file_url: string; created_at: string; courses: any }
type Announcement = { id: string; title: string; body: string; image_url?: string | null; created_at: string; priority: 'high' | 'normal' | 'low' }
type Deadline     = { id: string; title: string; due_date: string; course: string; color: string }

type IoniconName  = React.ComponentProps<typeof Ionicons>['name']
type PendingAvatarUpload = { localUri: string; base64?: string; fileExt: string; userId: string; queuedAt: number; retryCount?: number }

type ScheduleItem = {
  id: string
  hour: string
  period: 'AM' | 'PM'
  title: string
  meta: string
  tagLabel: string
  tagColor: string
  tagBg: string
  dotColor: string
  cancelled?: boolean
}

type DashCard = {
  id: string
  emoji: string
  title: string
  sub: string
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  borderColor: string
  glowColor: string
  onPress: () => void
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MOTIVATIONS = [
  { quote: 'The secret of getting ahead is getting started.',                        author: 'Mark Twain'         },
  { quote: 'Success is the sum of small efforts repeated day in and day out.',       author: 'Robert Collier'     },
  { quote: "Believe you can and you're halfway there.",                              author: 'Theodore Roosevelt' },
  { quote: 'Education is the most powerful weapon you can use to change the world.', author: 'Nelson Mandela'     },
  { quote: 'The expert in anything was once a beginner.',                            author: 'Helen Hayes'        },
  { quote: 'Push yourself, because no one else is going to do it for you.',          author: 'Unknown'            },
  { quote: 'Great things never come from comfort zones.',                            author: 'Unknown'            },
  { quote: 'Dream it. Believe it. Build it.',                                        author: 'Unknown'            },
  { quote: 'Study hard, for the well is deep and our brains are shallow.',           author: 'Richard Baxter'     },
  { quote: "Don't watch the clock; do what it does. Keep going.",                   author: 'Sam Levenson'       },
  { quote: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B.B. King'   },
]

const DEADLINE_COLORS     = [C.sapphire, C.lavender, C.emerald, C.gold, C.coral, C.pink]
const DEADLINES_KEY       = 'studentshare_deadlines'
const DASHBOARD_CACHE_KEY = 'studentshare_dashboard_cache'
const DASH_CUSTOM_CARDS_KEY = 'studentshare_dashboard_custom_cards'
const ANNOUNCEMENTS_KEY   = 'studentshare_announcements_cache'
const SEEN_MATERIALS_KEY  = 'studentshare_seen_material_ids'
const AVATAR_QUEUE_KEY    = 'studentshare_avatar_upload_queue'
const AVATAR_LOCK_KEY     = 'studentshare_avatar_refetch_lock'
const AVATAR_LOCK_TTL_MS  = 60_000
const AVATAR_MAX_RETRIES  = 3
const MAX_AVATAR_BYTES    = 2 * 1024 * 1024
const AVATAR_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function priorityColor(p: string): string {
  return p === 'high' ? C.coral : p === 'normal' ? C.sapphire : C.emerald
}
function priorityBg(p: string): string {
  return p === 'high' ? C.coralDim : p === 'normal' ? C.sapphDim : C.emerDim
}
function safeParseDashboard(raw: string | null): any | null {
  if (!raw) return null
  try { const p = JSON.parse(raw); return p?.profile?.full_name ? p : null } catch { return null }
}
function safeParseAnnouncements(raw: string | null): Announcement[] {
  if (!raw) return []
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [] } catch { return [] }
}

async function createNotificationsForNewMaterials(userId: string, materials: Material[], seenIds: Set<string>) {
  const newMats = materials.filter(m => !seenIds.has(m.id))
  if (!newMats.length) return
  await supabase.from('notifications').upsert(
    newMats.map(m => ({ user_id: userId, title: 'New material available', body: `"${m.title}" has been added.`, is_read: false, material_id: m.id })),
    { onConflict: 'user_id,material_id', ignoreDuplicates: true },
  )
}

function parseDueDate(due: string): Date {
  if (!due) return new Date(8640000000000000)
  const iso = new Date(due)
  if (!isNaN(iso.getTime())) return iso
  const n = due.replace(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/, '$2 $1, $3')
  const fb = new Date(n)
  return isNaN(fb.getTime()) ? new Date(8640000000000000) : fb
}
function isOverdue(due: string) { return parseDueDate(due) < new Date(new Date().setHours(0, 0, 0, 0)) }
function sortDeadlines(ds: Deadline[]) { return [...ds].sort((a, b) => parseDueDate(a.due_date).getTime() - parseDueDate(b.due_date).getTime()) }

// ─────────────────────────────────────────────
// Query functions
// ─────────────────────────────────────────────
async function fetchDashboard(userId: string) {
  const { data: profileData } = await supabase
    .from('profiles').select('full_name, avatar_url, college_id, class_id, is_verified, bio, role')
    .eq('id', userId).single()
  if (!profileData) return null

  const [collegeRes, classRes, subRes] = await Promise.all([
    profileData.college_id ? supabase.from('colleges').select('name, short_name').eq('id', profileData.college_id).single() : Promise.resolve({ data: null }),
    profileData.class_id   ? supabase.from('classes').select('name').eq('id', profileData.class_id).single()                : Promise.resolve({ data: null }),
    supabase.from('subscriptions').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle(),
  ])

  const isPremium = subRes.data != null
  const profile: Profile = {
    full_name:   profileData.full_name,
    avatar_url:  profileData.avatar_url,
    college_id:  profileData.college_id,
    class_id:    profileData.class_id,
    is_verified: profileData.is_verified === true || isPremium,
    is_premium:  isPremium,
    bio:         (profileData as any).bio ?? null,
    role:        (profileData as any).role ?? null,
    college:     collegeRes.data as any,
    class:       classRes.data as any,
  }

  let materials: Material[] = []
  let totalMaterialCount = 0
  let courseCount = 0

  if (profileData.class_id) {
    const { data: courses } = await supabase.from('courses').select('id').eq('class_id', profileData.class_id)
    courseCount = courses?.length || 0
    if (courseCount > 0) {
      const courseIds = courses!.map((c: any) => c.id)
      const [matsRes, countRes] = await Promise.all([
        supabase.from('materials').select('id, title, type, file_url, created_at, courses(name)').in('course_id', courseIds).eq('status', 'published').order('created_at', { ascending: false }).limit(5),
        supabase.from('materials').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('status', 'published'),
      ])
      materials = matsRes.data || []
      totalMaterialCount = countRes.count ?? materials.length
    }
  }
  return { profile, materials, stats: { total: totalMaterialCount, courses: courseCount } }
}

async function fetchAnnouncements(classId: string | null, collegeId: string | null): Promise<Announcement[]> {
  if (!classId && !collegeId) return []
  const filters: string[] = []
  if (classId)   filters.push(`class_id.eq.${classId}`)
  if (collegeId) filters.push(`college_id.eq.${collegeId}`)
  const [{ data: targeted }, { data: global }] = await Promise.all([
    supabase.from('announcements').select('id, title, body, image_url, created_at, priority').or(filters.join(',')).order('created_at', { ascending: false }).limit(5),
    supabase.from('announcements').select('id, title, body, image_url, created_at, priority').is('class_id', null).is('college_id', null).order('created_at', { ascending: false }).limit(3),
  ])
  const seen = new Set<string>()
  return [...(targeted || []), ...(global || [])].filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true }).slice(0, 5) as Announcement[]
}

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i
  const clean  = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const len    = clean.length
  const bytes  = new Uint8Array(Math.floor(len * 3 / 4))
  let i = 0, j = 0
  while (i < len) {
    const a = lookup[clean.charCodeAt(i++)]
    const b = lookup[clean.charCodeAt(i++)]
    const c = lookup[clean.charCodeAt(i++)]
    const d = lookup[clean.charCodeAt(i++)]
    bytes[j++] = (a << 2) | (b >> 4)
    if (j < bytes.length) bytes[j++] = ((b & 0xf) << 4) | (c >> 2)
    if (j < bytes.length) bytes[j++] = ((c & 0x3) << 6) | d
  }
  return bytes
}

async function retryPendingAvatarUpload(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AVATAR_QUEUE_KEY)
    if (!raw) return
    const pending: PendingAvatarUpload = JSON.parse(raw)
    if (Date.now() - pending.queuedAt > AVATAR_QUEUE_MAX_AGE_MS) { await AsyncStorage.removeItem(AVATAR_QUEUE_KEY).catch(() => {}); return }
    if ((pending.retryCount ?? 0) >= AVATAR_MAX_RETRIES) { await AsyncStorage.removeItem(AVATAR_QUEUE_KEY).catch(() => {}); Alert.alert('Upload failed', 'Could not upload your queued profile picture after several attempts.'); return }
    let session: any
    try { const res = await supabase.auth.getSession(); session = res.data?.session } catch { return }
    if (!session?.user || session.user.id !== pending.userId) return
    await AsyncStorage.setItem(AVATAR_QUEUE_KEY, JSON.stringify({ ...pending, retryCount: (pending.retryCount ?? 0) + 1 })).catch(() => {})
    const pendingB64 = pending.base64
    if (!pendingB64) throw new Error('No image data in retry queue')
    const blob = base64ToBytes(pendingB64)
    const fileName = `${pending.userId}_${pending.queuedAt}.${pending.fileExt}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, blob, { contentType: `image/${pending.fileExt}`, upsert: true })
    if (uploadError) throw uploadError
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
    const newUrl = urlData.publicUrl + '?t=' + pending.queuedAt
    lockAvatarRefetch()
    await AsyncStorage.setItem(AVATAR_LOCK_KEY, String(Date.now())).catch(() => {})
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', pending.userId)
    queryClient.setQueryData(['dashboard', pending.userId], (old: any) => old ? { ...old, profile: { ...old.profile, avatar_url: newUrl } } : old)
    const cached = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY).then(r => r ? JSON.parse(r) : null).catch(() => null)
    if (cached) await AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...cached, profile: { ...cached.profile, avatar_url: newUrl } })).catch(() => {})
    await AsyncStorage.removeItem(AVATAR_QUEUE_KEY)
    Alert.alert('Avatar updated', 'Your profile picture was uploaded successfully.')
  } catch {}
}

// ─────────────────────────────────────────────
// Offline Banner
// ─────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={s.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      <Text maxFontSizeMultiplier={1.3} style={s.offlineText}>Offline — showing cached data</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: any }) {
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
// Tag chip
// ─────────────────────────────────────────────
function TagChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[s.tagChip, { backgroundColor: bg, borderColor: color + '30' }]}>
      <Text allowFontScaling={false} style={[s.tagChipText, { color }]}>{label}</Text>
    </View>
  )
}

// ─────────────────────────────────────────────
// Meta Verified Badge
// ─────────────────────────────────────────────
function MetaVerifiedBadge({ size = 20 }: { size?: number }) {
  return (
    <View style={[
      metaBadge.wrap,
      { width: size, height: size, borderRadius: size * 0.32 }
    ]}>
      <LinearGradient
        colors={['#1877F2', '#0A5CD8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size * 0.32 }]}
      />
      <Ionicons name="checkmark" size={size * 0.58} color="#fff" style={{ fontWeight: '900' }} />
    </View>
  )
}
const metaBadge = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1877F2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
})

// ─────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────
function SectionHead({ title, link = 'See all', onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionLabelRow}>
        <View style={s.sectionOrangeLine} />
        <Text maxFontSizeMultiplier={1.3} style={s.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {onLink && (
        <TouchableOpacity onPress={onLink} activeOpacity={0.7}>
          <Text maxFontSizeMultiplier={1.3} style={s.sectionLink}>{link}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Quick Action Item
// ─────────────────────────────────────────────
function QuickActionItem({ label, emoji, color, bg, borderColor, badge, onPress }: {
  label: string; emoji: string; color: string; bg: string; borderColor: string; badge?: string | number; onPress: () => void
}) {
  return (
    <TouchableOpacity style={s.qaItem} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.qaIcon, { backgroundColor: bg, borderColor }]}>
        <Text style={s.qaEmoji}>{emoji}</Text>
        {badge ? (
          <View style={s.qaBadge}>
            <Text allowFontScaling={false} style={s.qaBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={s.qaLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Dashboard Card
// ─────────────────────────────────────────────
const DASH_CARD_HEIGHT = 150
const DASH_CARD_WIDTH = (width: number) => Math.floor((width - BODY_H_PAD * 2 - COL_GAP) / 2)

function DashCardItem({ card, cardWidth }: { card: DashCard; cardWidth: number }) {
  return (
    <ScalePress onPress={card.onPress} style={{ width: cardWidth }}>
      <View style={[s.dashCard, { borderColor: card.borderColor, height: DASH_CARD_HEIGHT, width: cardWidth }]}>
        <View style={[s.dashCardGlow, { backgroundColor: card.glowColor }]} />
        <View style={s.dashCardTop}>
          <View style={[s.dashCardIcon, { backgroundColor: card.badgeBg }]}>
            <Text style={s.dashCardEmoji}>{card.emoji}</Text>
          </View>
          <View style={s.dashCardArrow}>
            <Text style={s.dashCardArrowText}>↗</Text>
          </View>
        </View>
        <View>
          <Text maxFontSizeMultiplier={1.3} style={s.dashCardTitle} numberOfLines={1}>{card.title}</Text>
          <Text maxFontSizeMultiplier={1.3} style={s.dashCardSub} numberOfLines={1}>{card.sub}</Text>
          <View style={[s.dashCardBadge, { backgroundColor: card.badgeBg }]}>
            <Text allowFontScaling={false} style={[s.dashCardBadgeText, { color: card.badgeColor }]} numberOfLines={1}>{card.badgeLabel}</Text>
          </View>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// Schedule Item
// ─────────────────────────────────────────────
function ScheduleRow({ item, isLast }: { item: ScheduleItem; isLast: boolean }) {
  return (
    <View style={[s.schedItem, item.cancelled && s.schedItemCancelled, isLast && { borderBottomWidth: 0 }]}>
      <View style={s.schedTime}>
        <Text maxFontSizeMultiplier={1.3} style={[s.schedTimeVal, item.cancelled && { color: C.textMute }]}>{item.hour}</Text>
        <Text allowFontScaling={false} style={s.schedTimePeriod}>{item.period}</Text>
      </View>
      <View style={s.schedDotWrap}>
        <View style={[s.schedDot, { backgroundColor: item.dotColor, shadowColor: item.dotColor }]} />
        {!isLast && <View style={s.schedLine} />}
      </View>
      <View style={s.schedContent}>
        <Text maxFontSizeMultiplier={1.3} style={[s.schedTitle, item.cancelled && s.schedTitleStrike]} numberOfLines={1}>{item.title}</Text>
        <Text maxFontSizeMultiplier={1.3} style={s.schedMeta} numberOfLines={1}>{item.meta}</Text>
        <View style={[s.schedTag, { backgroundColor: item.tagBg }]}>
          <Text allowFontScaling={false} style={[s.schedTagText, { color: item.tagColor }]}>{item.tagLabel}</Text>
        </View>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────
// Material Row
// ─────────────────────────────────────────────
function MaterialRow({ mat }: { mat: Material & { typeColor: string; typeBg: string; typeLabel: string; icon: IoniconName } }) {
  return (
    <ScalePress>
      <View style={s.matRow}>
        <View style={[s.matAccentLine, { backgroundColor: mat.typeColor }]} />
        <View style={[s.matIconBox, { backgroundColor: mat.typeBg, borderColor: mat.typeColor + '20' }]}>
          <Ionicons name={mat.icon} size={18} color={mat.typeColor} />
        </View>
        <View style={s.matContent}>
          <Text maxFontSizeMultiplier={1.3} style={s.matTitle} numberOfLines={2}>{mat.title}</Text>
          <View style={s.matMeta}>
            <TagChip label={mat.typeLabel} color={mat.typeColor} bg={mat.typeBg} />
            {mat.courses?.name && <Text style={s.matCourse}>{mat.courses.name}</Text>}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={14} color={C.textMute} />
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// Deadline Chip
// ─────────────────────────────────────────────
function DeadlineChip({ d, onRemove }: { d: Deadline; onRemove: () => void }) {
  const urgent = isOverdue(d.due_date)
  return (
    <View style={[s.deadlineChip, urgent && { backgroundColor: C.coralDim, borderColor: C.coral + '30' }]}>
      <View style={[s.deadlineChipDot, { backgroundColor: urgent ? C.coral : d.color }]} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.3} style={s.deadlineChipTitle} numberOfLines={1}>{d.title}</Text>
        <Text maxFontSizeMultiplier={1.3} style={[s.deadlineChipDue, urgent && { color: C.coral }]}>Due {d.due_date}</Text>
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={16} color={C.textMute} />
      </TouchableOpacity>
    </View>
  )
}

// ─────────────────────────────────────────────
// Leaderboard Preview (home card — unchanged)
// ─────────────────────────────────────────────
function LeaderboardPreview({ userId, collegeId, onOpenFull }: { userId: string | null; collegeId: string | null; onOpenFull: () => void }) {
  const { data: collegeBoard = [] } = useQuery({
    queryKey: ['leaderboard_college', collegeId, 'weekly'],
    queryFn: () => fetchCollegeLeaderboard(collegeId, 'weekly'),
    enabled: !!collegeId, staleTime: 5 * 60 * 1000,
  })

  const activeBoard = collegeBoard as any[]
  const podium      = activeBoard.slice(0, 3)
  const rest        = activeBoard.slice(3, 5)
  const myEntry     = activeBoard.find(e => e.id === userId)
  const topScore    = activeBoard[0]?.score || 1

  if (activeBoard.length === 0) return null

  const PodiumAvatar = ({ entry, size, bg }: { entry: any; size: number; bg: string }) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      {entry.avatar_url
        ? <Image source={{ uri: entry.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: '#fff' }}>{entry.full_name?.charAt(0) ?? '?'}</Text>
      }
      <View style={lbp.podAvatarBadge}>
        <Text allowFontScaling={false} style={lbp.podAvatarBadgeText}>{entry.rank}</Text>
      </View>
    </View>
  )

  return (
    <View style={lbp.card}>
      {/* Header */}
      <View style={lbp.header}>
        <View style={lbp.headerLeft}>
          <View style={lbp.headerLine} />
          <Text allowFontScaling={false} style={lbp.headerLabel}>LEADERBOARD</Text>
        </View>
        <TouchableOpacity onPress={onOpenFull} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={lbp.headerLink}>Full board</Text>
        </TouchableOpacity>
      </View>

      {/* Podium */}
      {podium.length >= 1 && (
        <View style={lbp.podiumWrap}>
          <View style={[lbp.podSlot, { alignSelf: 'flex-end' }]}>
            <PodiumAvatar entry={podium[1] ?? podium[0]} size={68} bg="#5A6070" />
            <Text allowFontScaling={false} style={lbp.podName} numberOfLines={1}>
              {(podium[1] ?? podium[0]).full_name?.split(' ')[0]}
            </Text>
            <Text allowFontScaling={false} style={lbp.podPts}>
              {(podium[1] ?? podium[0]).score.toLocaleString()}
            </Text>
            <View style={lbp.podBase2} />
          </View>

          <View style={[lbp.podSlot, { alignSelf: 'flex-end', marginBottom: 0 }]}>
            <Text style={lbp.crown}>👑</Text>
            <PodiumAvatar entry={podium[0]} size={84} bg="#BF9730" />
            <Text allowFontScaling={false} style={[lbp.podName, { color: C.text }]} numberOfLines={1}>
              {podium[0].full_name?.split(' ')[0]}
            </Text>
            <Text allowFontScaling={false} style={[lbp.podPts, { color: C.gold, fontWeight: '700', fontSize: 13 }]}>
              {podium[0].score.toLocaleString()}
            </Text>
            <View style={lbp.podBase1} />
          </View>

          <View style={[lbp.podSlot, { alignSelf: 'flex-end' }]}>
            <PodiumAvatar entry={podium[2] ?? podium[0]} size={68} bg="#7A4A28" />
            <Text allowFontScaling={false} style={lbp.podName} numberOfLines={1}>
              {(podium[2] ?? podium[0]).full_name?.split(' ')[0]}
            </Text>
            <Text allowFontScaling={false} style={lbp.podPts}>
              {(podium[2] ?? podium[0]).score.toLocaleString()}
            </Text>
            <View style={lbp.podBase3} />
          </View>
        </View>
      )}

      {/* Rank rows 4 & 5 */}
      <View style={lbp.rankSection}>
        {rest.map((entry) => {
          const isMe  = entry.id === userId
          const mv    = entry.movement
          const hasMv = mv !== undefined && mv !== 0
          return (
            <View key={entry.id}>
              <View style={lbp.rowDivider} />
              <View style={[lbp.rankRow, isMe && lbp.rankRowMe]}>
                <Text style={lbp.rankNum}>{entry.rank}</Text>
                <View style={lbp.rankAvatarBox}>
                  {entry.avatar_url
                    ? <Image source={{ uri: entry.avatar_url }} style={{ width: 44, height: 44, borderRadius: 14 }} />
                    : <Text style={lbp.rankAvatarInit}>{entry.full_name?.charAt(0) ?? '?'}</Text>
                  }
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={lbp.rankName} numberOfLines={1}>{entry.full_name}</Text>
                  <View style={lbp.rankUnderline}>
                    <View style={[lbp.rankUnderlineFill, { width: `${Math.min((entry.score / topScore) * 100, 100)}%` as any }]} />
                  </View>
                </View>
                <View style={lbp.mvChip}>
                  {hasMv
                    ? <Text style={mv! > 0 ? lbp.mvUp : lbp.mvDown}>{mv! > 0 ? `↑${mv}` : `↓${Math.abs(mv!)}`}</Text>
                    : <Text style={lbp.mvNeutral}>—</Text>
                  }
                </View>
                <View style={lbp.ptsBox}>
                  <Text style={lbp.rankPts}>{entry.score.toLocaleString()}</Text>
                  <Text style={lbp.rankPtsSub}>pts</Text>
                </View>
              </View>
            </View>
          )
        })}
      </View>

      {/* Footer */}
      {myEntry && (
        <View style={lbp.footer}>
          <Text style={lbp.footerHash}>#</Text>
          <Text style={lbp.footerRankNum}>{myEntry.rank}</Text>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
            <Text style={lbp.footerLabel}>Your College Rank</Text>
            <View style={lbp.footerBar}>
              <View style={[lbp.footerBarFill, { width: `${Math.min((myEntry.score / topScore) * 100, 100)}%` as any }]} />
            </View>
            <Text style={lbp.footerSub}>Top 5% · Keep going 🚀</Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 10 }}>
            <Text style={lbp.footerScore}>{myEntry.score.toLocaleString()}</Text>
            <Text style={lbp.footerScoreSub}>total pts</Text>
          </View>
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Grade Calculator Modal
// ─────────────────────────────────────────────
type GradeEntry = { id: string; subject: string; score: string; weight: string }
const BLANK_GRADES: GradeEntry[] = [
  { id: '1', subject: '', score: '', weight: '' },
  { id: '2', subject: '', score: '', weight: '' },
]

function GradeCalculatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<GradeEntry[]>(BLANK_GRADES)
  useEffect(() => { if (!visible) setEntries(BLANK_GRADES.map(e => ({ ...e }))) }, [visible])

  const addEntry    = () => setEntries(p => [...p, { id: Date.now().toString(), subject: '', score: '', weight: '' }])
  const removeEntry = (id: string) => { if (entries.length <= 1) return; setEntries(p => p.filter(e => e.id !== id)) }
  const updateEntry = (id: string, field: keyof GradeEntry, val: string) => {
    let v = val
    if (field === 'score' && val !== '') { const n = Number(val); if (!isNaN(n)) v = String(Math.min(100, Math.max(0, n))) }
    setEntries(p => p.map(e => e.id === id ? { ...e, [field]: v } : e))
  }

  const { gpa, average, letterGrade, mixed } = useMemo(() => {
    const valid = entries.filter(e => e.score !== '' && !isNaN(Number(e.score)))
    if (!valid.length) return { gpa: null, average: null, letterGrade: null, mixed: false }
    const wWith = valid.filter(e => e.weight !== '' && !isNaN(Number(e.weight)))
    const wOut  = valid.filter(e => e.weight === '' || isNaN(Number(e.weight)))
    const isMixed = wWith.length > 0 && wOut.length > 0
    let avg = isMixed || !wWith.length
      ? valid.reduce((s, e) => s + Number(e.score), 0) / valid.length
      : valid.reduce((s, e) => s + Number(e.score) * Number(e.weight), 0) / valid.reduce((s, e) => s + Number(e.weight), 0)
    const g = avg >= 90 ? 4.0 : avg >= 80 ? 3.0 : avg >= 70 ? 2.0 : avg >= 60 ? 1.0 : 0.0
    return { gpa: g.toFixed(1), average: avg.toFixed(1), letterGrade: avg >= 90 ? 'A' : avg >= 80 ? 'B' : avg >= 70 ? 'C' : avg >= 60 ? 'D' : 'F', mixed: isMixed }
  }, [entries])

  const gc = letterGrade === 'A' ? C.emerald : letterGrade === 'B' ? C.sapphire : letterGrade === 'C' ? C.gold : letterGrade === 'D' ? C.orange : C.coral

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={m.sheet}>
            <View style={m.handleRow}><View style={m.handle} /></View>
            <View style={m.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={m.title}>Grade Calculator</Text>
                <Text maxFontSizeMultiplier={1.3} style={m.subtitle}>Weighted GPA calculator</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={m.closeBtn}><Ionicons name="close" size={18} color={C.textSub} /></TouchableOpacity>
            </View>
            {mixed && (
              <View style={m.warningBox}>
                <Ionicons name="warning-outline" size={13} color={C.gold} />
                <Text maxFontSizeMultiplier={1.3} style={m.warningText}>Mixed weights detected — showing unweighted average.</Text>
              </View>
            )}
            {average !== null && (
              <View style={[m.resultBox, { borderColor: gc + '30', backgroundColor: gc + '08' }]}>
                <Text maxFontSizeMultiplier={1.3} style={[m.resultGrade, { color: gc }]}>{letterGrade}</Text>
                <View>
                  <Text maxFontSizeMultiplier={1.3} style={m.resultAvg}>{average}%</Text>
                  <Text maxFontSizeMultiplier={1.3} style={m.resultGpa}>GPA {gpa} / 4.0</Text>
                </View>
              </View>
            )}
            <View style={m.colHeaders}>
              {['Subject', 'Score %', 'Weight', ''].map((h, i) => (
                <Text maxFontSizeMultiplier={1.3} key={i} style={[m.colHeader, i === 0 ? { flex: 2 } : i < 3 ? { flex: 1 } : { width: 32 }]}>{h}</Text>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {entries.map((e, idx) => (
                <View key={e.id} style={m.entryRow}>
                  <TextInput style={[m.input, { flex: 2 }]} placeholder={`Course ${idx + 1}`} placeholderTextColor={C.textMute} value={e.subject} onChangeText={v => updateEntry(e.id, 'subject', v)} />
                  <TextInput style={[m.input, { flex: 1 }]} placeholder="85" placeholderTextColor={C.textMute} keyboardType="decimal-pad" value={e.score} onChangeText={v => updateEntry(e.id, 'score', v)} />
                  <TextInput style={[m.input, { flex: 1 }]} placeholder="3"  placeholderTextColor={C.textMute} keyboardType="decimal-pad" value={e.weight} onChangeText={v => updateEntry(e.id, 'weight', v)} />
                  <TouchableOpacity onPress={() => removeEntry(e.id)} style={{ width: 32, alignItems: 'center' }}>
                    <Ionicons name="remove-circle" size={20} color={C.coral} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={m.addBtn} onPress={addEntry}>
              <Ionicons name="add-circle-outline" size={17} color={C.orange} />
              <Text maxFontSizeMultiplier={1.3} style={m.addBtnText}>Add Course</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// Add Deadline Modal
// ─────────────────────────────────────────────
function AddDeadlineModal({ visible, onClose, onAdd }: {
  visible: boolean; onClose: () => void; onAdd: (d: Omit<Deadline, 'id'>) => void
}) {
  const [title, setTitle]   = useState('')
  const [course, setCourse] = useState('')
  const [due, setDue]       = useState('')
  const [color, setColor]   = useState(DEADLINE_COLORS[0])

  const handleAdd = () => {
    if (!title.trim() || !due.trim()) { Alert.alert('Missing fields', 'Please enter a title and due date.'); return }
    onAdd({ title: title.trim(), course: course.trim() || 'General', due_date: due.trim(), color })
    setTitle(''); setCourse(''); setDue(''); setColor(DEADLINE_COLORS[0]); onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { paddingBottom: 36 }]}>
            <View style={m.handleRow}><View style={m.handle} /></View>
            <View style={m.header}>
              <Text maxFontSizeMultiplier={1.3} style={m.title}>Add Deadline</Text>
              <TouchableOpacity onPress={onClose} style={m.closeBtn}><Ionicons name="close" size={18} color={C.textSub} /></TouchableOpacity>
            </View>
            <TextInput style={m.input} placeholder="Assignment / Exam title" placeholderTextColor={C.textMute} value={title}  onChangeText={setTitle}  />
            <TextInput style={m.input} placeholder="Course name (optional)"   placeholderTextColor={C.textMute} value={course} onChangeText={setCourse} />
            <TextInput style={m.input} placeholder="Due date (e.g. Dec 20, 2025)" placeholderTextColor={C.textMute} value={due} onChangeText={setDue} />
            <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Colour tag</Text>
            <View style={m.colorRow}>
              {DEADLINE_COLORS.map(c => (
                <TouchableOpacity key={c} style={[m.colorDot, { backgroundColor: c }, color === c && { borderWidth: 2.5, borderColor: '#fff' }]} onPress={() => setColor(c)}>
                  {color === c && <Ionicons name="checkmark" size={12} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={m.primaryBtn} onPress={handleAdd}>
              <Text maxFontSizeMultiplier={1.3} style={m.primaryBtnText}>Add Deadline</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// Deadlines Modal
// ─────────────────────────────────────────────
function DeadlinesModal({ visible, onClose, deadlines, onAdd, onRemove }: {
  visible: boolean; onClose: () => void; deadlines: Deadline[]; onAdd: () => void; onRemove: (id: string) => void
}) {
  const sorted = useMemo(() => sortDeadlines(deadlines), [deadlines])
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { paddingBottom: 40, maxHeight: '82%' }]}>
            <View style={m.handleRow}><View style={m.handle} /></View>
            <View style={m.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={m.title}>Deadlines</Text>
                <Text maxFontSizeMultiplier={1.3} style={m.subtitle}>Track assignments & exams</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={m.closeBtn}><Ionicons name="close" size={18} color={C.textSub} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
              {sorted.length === 0
                ? <View style={m.emptyBox}><Ionicons name="calendar-outline" size={32} color={C.textMute} /><Text maxFontSizeMultiplier={1.3} style={m.emptyText}>No deadlines yet</Text></View>
                : sorted.map(d => {
                    const over = isOverdue(d.due_date)
                    return (
                      <View key={d.id} style={[m.deadlineCard, { borderLeftColor: over ? C.coral : d.color }, over && { backgroundColor: C.coralDim + '60' }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <Text maxFontSizeMultiplier={1.3} style={[m.dlCourse, over && { color: C.coral }]}>{d.course}</Text>
                            {over && <TagChip label="OVERDUE" color={C.coral} bg={C.coralDim} />}
                          </View>
                          <Text maxFontSizeMultiplier={1.3} style={m.dlTitle}>{d.title}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                            <Ionicons name="calendar" size={11} color={over ? C.coral : C.textMute} />
                            <Text maxFontSizeMultiplier={1.3} style={[m.dlDate, over && { color: C.coral }]}>{d.due_date}</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => onRemove(d.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={20} color={C.textMute} />
                        </TouchableOpacity>
                      </View>
                    )
                  })
              }
            </ScrollView>
            <TouchableOpacity style={m.addBtn} onPress={onAdd}>
              <Ionicons name="add-circle-outline" size={17} color={C.orange} />
              <Text maxFontSizeMultiplier={1.3} style={m.addBtnText}>Add Deadline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// Announcement Admin Modal
// ─────────────────────────────────────────────
function AnnouncementAdminModal({ visible, onClose, announcements, classId, collegeId, onRefresh, onSaveSuccess, onOptimisticUpdate }: {
  visible: boolean; onClose: () => void; announcements: Announcement[]
  classId: string | null; collegeId: string | null; onRefresh: () => void
  onSaveSuccess?: () => void
  onOptimisticUpdate: (updater: (prev: Announcement[]) => Announcement[]) => void
}) {
  const [mode,    setMode]    = useState<'list' | 'edit'>('list')
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [imgUp,   setImgUp]   = useState(false)

  const reset = () => { setEditing(null); setMode('list') }
  useEffect(() => { if (!visible) reset() }, [visible])

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Delete this announcement?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        onOptimisticUpdate(prev => prev.filter(a => a.id !== id))
        const { error } = await supabase.from('announcements').delete().eq('id', id)
        if (error) { Alert.alert('Error', error.message); onRefresh() }
      }},
    ])
  }

  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission required', 'Allow photo library access.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, quality: 0.7, base64: true })
    if (result.canceled) return
    try {
      setImgUp(true)
      const asset = result.assets[0]
      const ext   = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
      const fn    = `announcement_${Date.now()}.${ext}`
      const bytes = base64ToBytes(asset.base64!)
      const { error } = await supabase.storage.from('announcements').upload(fn, bytes, { contentType: `image/${ext}`, upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('announcements').getPublicUrl(fn)
      setEditing(p => ({ ...p, image_url: urlData.publicUrl }))
    } catch (e: any) { Alert.alert('Upload failed', e?.message) } finally { setImgUp(false) }
  }

  const handleSave = async () => {
    if (!editing?.title?.trim()) { Alert.alert('Required', 'Please enter a title.'); return }
    setSaving(true)
    try {
      const payload = { title: editing.title!.trim(), body: editing.body?.trim() || '', priority: (editing.priority || 'normal') as Announcement['priority'], image_url: editing.image_url || null, class_id: classId, college_id: collegeId }
      const isNew = !editing.id
      if (editing.id) {
        const { error } = await supabase.from('announcements').update(payload).eq('id', editing.id)
        if (error) throw new Error(error.message)
        onOptimisticUpdate(prev => prev.map(a => a.id === editing.id ? { ...a, ...payload, created_at: a.created_at } : a))
      } else {
        const { data: inserted, error } = await supabase.from('announcements').insert(payload).select('id, title, body, image_url, created_at, priority').single()
        if (error) throw new Error(error.message)
        if (!inserted) throw new Error('Insert returned no data.')
        onOptimisticUpdate(prev => [inserted as Announcement, ...prev])
      }
      reset(); onClose()
      if (isNew) onSaveSuccess?.()
      onRefresh()
    } catch (e: any) { Alert.alert('Could not save', e?.message ?? 'Check your connection.') } finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { maxHeight: '90%' }]}>
            <View style={m.handleRow}><View style={m.handle} /></View>
            <View style={m.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={m.title}>{mode === 'edit' ? (editing?.id ? 'Edit Announcement' : 'New Announcement') : 'Manage Announcements'}</Text>
                <Text maxFontSizeMultiplier={1.3} style={m.subtitle}>{mode === 'edit' ? 'Fill in details below' : 'Add, edit or remove'}</Text>
              </View>
              <TouchableOpacity onPress={() => { reset(); onClose() }} style={m.closeBtn}><Ionicons name="close" size={18} color={C.textSub} /></TouchableOpacity>
            </View>
            {mode === 'list' ? (
              <>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
                  {announcements.length === 0
                    ? <View style={m.emptyBox}><Ionicons name="megaphone-outline" size={32} color={C.textMute} /><Text maxFontSizeMultiplier={1.3} style={m.emptyText}>No announcements yet</Text></View>
                    : announcements.map(a => (
                      <View key={a.id} style={[m.annCard, { borderLeftColor: priorityColor(a.priority) }]}>
                        <View style={{ flex: 1 }}>
                          <Text maxFontSizeMultiplier={1.3} style={m.annCardTitle} numberOfLines={1}>{a.title}</Text>
                          <Text maxFontSizeMultiplier={1.3} style={m.annCardBody} numberOfLines={2}>{a.body}</Text>
                          {a.image_url && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}><Ionicons name="image" size={11} color={C.textMute} /><Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11, color: C.textMute }}>Has image</Text></View>}
                        </View>
                        <View style={{ flexDirection: 'column', gap: 8 }}>
                          <TouchableOpacity style={[m.iconBtn, { backgroundColor: C.sapphDim }]} onPress={() => { setEditing({ ...a }); setMode('edit') }}><Ionicons name="pencil" size={15} color={C.sapphire} /></TouchableOpacity>
                          <TouchableOpacity style={[m.iconBtn, { backgroundColor: C.coralDim }]} onPress={() => handleDelete(a.id)}><Ionicons name="trash" size={15} color={C.coral} /></TouchableOpacity>
                        </View>
                      </View>
                    ))
                  }
                </ScrollView>
                <TouchableOpacity style={m.primaryBtn} onPress={() => { setEditing({ title: '', body: '', priority: 'normal', image_url: null }); setMode('edit') }}>
                  <Ionicons name="add-circle-outline" size={17} color={C.void} />
                  <Text maxFontSizeMultiplier={1.3} style={m.primaryBtnText}>New Announcement</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={m.backRow} onPress={reset}>
                  <Ionicons name="arrow-back" size={15} color={C.textSub} /><Text maxFontSizeMultiplier={1.3} style={m.backText}>Back to list</Text>
                </TouchableOpacity>
                <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Title *</Text>
                <TextInput style={m.input} placeholder="Announcement title" placeholderTextColor={C.textMute} value={editing?.title || ''} onChangeText={v => setEditing(p => ({ ...p, title: v }))} />
                <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Body</Text>
                <TextInput style={[m.input, { height: 90, textAlignVertical: 'top' }]} placeholder="Write the announcement..." placeholderTextColor={C.textMute} multiline numberOfLines={4} value={editing?.body || ''} onChangeText={v => setEditing(p => ({ ...p, body: v }))} />
                <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Priority</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
                  {(['high', 'normal', 'low'] as const).map(p => (
                    <TouchableOpacity key={p} style={[m.priorityBtn, editing?.priority === p && { backgroundColor: priorityColor(p), borderColor: priorityColor(p) }]} onPress={() => setEditing(prev => ({ ...prev, priority: p }))}>
                      <Text maxFontSizeMultiplier={1.3} style={[m.priorityBtnText, editing?.priority === p && { color: '#fff' }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text maxFontSizeMultiplier={1.3} style={m.fieldLabel}>Image (optional)</Text>
                {editing?.image_url
                  ? <View style={{ position: 'relative', marginBottom: 16 }}>
                      <Image source={{ uri: editing.image_url }} style={{ width: '100%', height: 150, borderRadius: 14 }} resizeMode="cover" />
                      <TouchableOpacity style={{ position: 'absolute', top: 8, right: 8 }} onPress={() => setEditing(p => ({ ...p, image_url: null }))}><Ionicons name="close-circle" size={22} color={C.coral} /></TouchableOpacity>
                    </View>
                  : <TouchableOpacity style={m.imgPickBtn} onPress={handlePickImage} disabled={imgUp}>
                      {imgUp ? <ActivityIndicator color={C.orange} size="small" /> : <><Ionicons name="image-outline" size={18} color={C.orange} /><Text maxFontSizeMultiplier={1.3} style={[m.addBtnText, { color: C.orange }]}>Upload Image</Text></>}
                    </TouchableOpacity>
                }
                <TouchableOpacity style={[m.primaryBtn, { marginTop: 18, marginBottom: 8 }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color={C.void} size="small" /> : <Text style={m.primaryBtnText}>{editing?.id ? 'Save Changes' : 'Post Announcement'}</Text>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// HOME SCREEN INNER
// ─────────────────────────────────────────────
function HomeScreenInner() {
  const router    = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  const queryClient = useQueryClient()
  const insets      = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const { userId, isOnline, isAdmin } = useProfileSync()

  const [uploadingAvatar,       setUploadingAvatar]       = useState(false)
  const [motivation,            setMotivation]            = useState(MOTIVATIONS[0])
  const [showGradeCalc,         setShowGradeCalc]         = useState(false)
  const [showAddDeadline,       setShowAddDeadline]       = useState(false)
  const [showDeadlines,         setShowDeadlines]         = useState(false)
  const [showLeaderboard,       setShowLeaderboard]       = useState(false)
  const [showAnnouncementAdmin, setShowAnnouncementAdmin] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [customCards, setCustomCards] = useState<string[]>([])
  const [deadlines,             setDeadlines]             = useState<Deadline[]>([])
  const [deadlinesLoaded,       setDeadlinesLoaded]       = useState(false)
  const [showAnnouncements,     setShowAnnouncements]     = useState(false)
  const [showRecentMaterials,   setShowRecentMaterials]   = useState(false)
  const [notifCount,            setNotifCount]            = useState(0)
  const prevNotifCountRef = useRef(0)
  const bellAnim          = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (notifCount > prevNotifCountRef.current) {
      Animated.sequence([
        Animated.timing(bellAnim, { toValue:  1, duration: 80,  useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -1, duration: 80,  useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue:  1, duration: 80,  useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -1, duration: 80,  useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue:  0, duration: 60,  useNativeDriver: true }),
      ]).start()
    }
    prevNotifCountRef.current = notifCount
  }, [notifCount, bellAnim])

  const [studyProgress, setStudyProgress] = useState(0)

  const [cacheReady,          setCacheReady]          = useState(false)
  const [cachedDashboard,     setCachedDashboard]     = useState<any>(null)
  const [cachedAnnouncements, setCachedAnnouncements] = useState<Announcement[]>([])

  const seenMaterialIdsRef = useRef<Set<string>>(new Set())
  const seenLoadedRef      = useRef(false)
  const lastFocusRef       = useRef(Date.now())

  const urgentPulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(urgentPulse, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(urgentPulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  useEffect(() => {
    const target = 68
    let current  = 0
    const timer  = setInterval(() => {
      current += 1.6
      setStudyProgress(Math.min(current, target))
      if (current >= target) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const load = async () => {
      const [rawDash, rawAnn] = await Promise.all([
        AsyncStorage.getItem(DASHBOARD_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(ANNOUNCEMENTS_KEY).catch(() => null),
      ])
      const pd = safeParseDashboard(rawDash)
      if (pd) setCachedDashboard(pd)
      const pa = safeParseAnnouncements(rawAnn)
      if (pa.length) setCachedAnnouncements(pa)
      setCacheReady(true)
    }
    load()
  }, [])

  const avatarRetryRanRef = useRef(false)
  useEffect(() => {
    if (userId && isOnline && !avatarRetryRanRef.current) {
      avatarRetryRanRef.current = true
      retryPendingAvatarUpload(queryClient).catch(() => {})
    }
    if (!isOnline) avatarRetryRanRef.current = false
  }, [userId, isOnline, queryClient])

  useEffect(() => {
    AsyncStorage.getItem(SEEN_MATERIALS_KEY)
      .then(raw => {
        if (raw) { try { seenMaterialIdsRef.current = new Set(JSON.parse(raw)) } catch {} }
        seenLoadedRef.current = true
      })
      .catch(() => { seenLoadedRef.current = true })
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    const fetch = async () => {
      if (!active) return
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false)
      if (active) setNotifCount(count || 0)
    }
    fetch()
    const ch = supabase.channel(`notif-bell-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, fetch)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [userId])

  useEffect(() => {
    AsyncStorage.getItem(DEADLINES_KEY).then(raw => { if (raw) setDeadlines(JSON.parse(raw)) }).catch(() => {}).finally(() => setDeadlinesLoaded(true))
  }, [])

  // Load custom dashboard cards
  useEffect(() => {
    AsyncStorage.getItem(DASH_CUSTOM_CARDS_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw)
          if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
            setCustomCards(saved.slice(0, 6))
            return
          }
        } catch {}
      }
      // Default: top 6 available cards
      setCustomCards(['solutions', 'mats', 'notes', 'plan', 'contribute', 'contributors'])
    }).catch(() => {
      setCustomCards(['solutions', 'mats', 'notes', 'plan', 'contribute', 'contributors'])
    })
  }, [])

  // Save custom cards on change
  useEffect(() => {
    if (customCards.length > 0) {
      AsyncStorage.setItem(DASH_CUSTOM_CARDS_KEY, JSON.stringify(customCards.slice(0, 6))).catch(() => {})
    }
  }, [customCards])
  useEffect(() => {
    if (!deadlinesLoaded) return
    AsyncStorage.setItem(DEADLINES_KEY, JSON.stringify(deadlines)).catch(() => {
      Alert.alert('Storage Warning', 'Deadlines could not be saved locally.')
    })
  }, [deadlines, deadlinesLoaded])

  useFocusEffect(useCallback(() => {
    setMotivation(MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)])
    const now = Date.now()
    const checkAndRefetch = async () => {
      if (isAvatarRefetchLocked()) { lastFocusRef.current = now; return }
      try {
        const lockTime = await AsyncStorage.getItem(AVATAR_LOCK_KEY).then(v => v ? Number(v) : 0)
        if (now - lockTime < AVATAR_LOCK_TTL_MS) { lastFocusRef.current = now; return }
      } catch {}
      if (userId && now - lastFocusRef.current > 30_000) {
        lastFocusRef.current = now
        queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
      }
    }
    checkAndRefetch()
  }, [userId, queryClient]))

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', userId],
    queryFn: async () => {
      const fresh = await fetchDashboard(userId!)
      if (fresh) {
        const toCache = { ...fresh, profile: { ...fresh.profile } }
        void AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(toCache)).catch(() => {})
      }
      return fresh
    },
    enabled:         !!userId && cacheReady,
    staleTime:       2 * 60 * 1000,
    gcTime:          10 * 60 * 1000,
    placeholderData: cachedDashboard ?? undefined,
    retry:           (n: number) => n < 1,
  })

  const effectiveData   = data ?? cachedDashboard
  const profile         = effectiveData?.profile   ?? null
  const recentMaterials = effectiveData?.materials ?? []
  const stats           = effectiveData?.stats     ?? { total: 0, courses: 0 }
  const classId         = effectiveData?.profile?.class_id   ?? null
  const collegeId       = effectiveData?.profile?.college_id ?? null
  const collegeName     = effectiveData?.profile?.college?.name ?? undefined

  const newMaterialCount = useMemo(() => {
    if (!seenLoadedRef.current) return 0
    return recentMaterials.filter((m: Material) => !seenMaterialIdsRef.current.has(m.id)).length
  }, [recentMaterials])

  const recentMaterialsKey = recentMaterials.map((m: Material) => m.id).join(',')
  useEffect(() => {
    if (!userId || !recentMaterials.length || !seenLoadedRef.current) return
    const newItems = recentMaterials.filter((m: Material) => !seenMaterialIdsRef.current.has(m.id))
    if (newItems.length) createNotificationsForNewMaterials(userId, recentMaterials, seenMaterialIdsRef.current).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentMaterialsKey, userId])

  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`announcements-rt-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        void AsyncStorage.removeItem(ANNOUNCEMENTS_KEY).catch(() => {})
        queryClient.invalidateQueries({ queryKey: ['announcements', classId, collegeId] })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, classId, collegeId, queryClient])

  const { data: announcements = cachedAnnouncements } = useQuery({
    queryKey: ['announcements', classId, collegeId],
    queryFn: async () => {
      const fresh = await fetchAnnouncements(classId, collegeId)
      void AsyncStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(fresh)).catch(() => {})
      return fresh
    },
    enabled:         !!userId && cacheReady && !!(classId || collegeId),
    staleTime:       0,
    gcTime:          10 * 60 * 1000,
    placeholderData: cachedAnnouncements.length > 0 ? cachedAnnouncements : undefined,
  })

  useEffect(() => {
    if (announcements.some(a => a.priority === 'high')) {
      setShowAnnouncements(true)
    }
  }, [announcements])

  async function pickAndUploadAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Photo access required', 'Please allow photo library access in Settings to change your profile picture.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }])
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true })
    if (result.canceled) return
    const asset = result.assets[0]
    const fileSizeBytes = asset.fileSize ?? 0
    if (fileSizeBytes > MAX_AVATAR_BYTES) { Alert.alert('Image too large', `Please choose an image under 5 MB. (~${(fileSizeBytes / 1_048_576).toFixed(1)} MB)`); return }
    const rawExt  = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
    const fileExt = ['heic', 'heif'].includes(rawExt) ? 'jpg' : rawExt
    const timestamp = Date.now()
    const fileName  = `${userId}.${fileExt}`
    setUploadingAvatar(true)
    try {
      if (!isOnline) {
        const pending: PendingAvatarUpload = { localUri: asset.uri, base64: asset.base64 ?? undefined, fileExt, userId: userId!, queuedAt: timestamp, retryCount: 0 }
        await AsyncStorage.setItem(AVATAR_QUEUE_KEY, JSON.stringify(pending)).catch(() => {})
        const localUrl = asset.uri + '?local=' + timestamp
        queryClient.setQueryData(['dashboard', userId], (old: any) => old ? { ...old, profile: { ...old.profile, avatar_url: localUrl } } : old)
        const cached = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY).then(r => r ? JSON.parse(r) : null).catch(() => null)
        if (cached) await AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...cached, profile: { ...cached.profile, avatar_url: localUrl } })).catch(() => {})
        setUploadingAvatar(false)
        Alert.alert('Saved offline', "You're offline. Your photo will upload when you reconnect.")
        return
      }
      const b64 = asset.base64
      if (!b64) throw new Error('Picker did not return image data.')
      const byteArray = base64ToBytes(b64)
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, byteArray, { contentType: `image/${fileExt}`, upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const newUrl = urlData.publicUrl + '?t=' + timestamp
      await supabase.from('profiles').update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', userId!)
      lockAvatarRefetch()
      await AsyncStorage.setItem(AVATAR_LOCK_KEY, String(timestamp)).catch(() => {})
      queryClient.setQueryData(['dashboard', userId], (old: any) => old ? { ...old, profile: { ...old.profile, avatar_url: newUrl }, materials: old.materials ?? [], stats: old.stats ?? {} } : old)
      const cached = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY).then(r => r ? JSON.parse(r) : null).catch(() => null)
      if (cached) await AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...cached, profile: { ...cached.profile, avatar_url: newUrl } })).catch(() => {})
      setTimeout(async () => {
        const lockTime = await AsyncStorage.getItem(AVATAR_LOCK_KEY).then(v => v ? Number(v) : 0).catch(() => 0)
        if (Date.now() - lockTime < AVATAR_LOCK_TTL_MS) return
        queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
      }, AVATAR_LOCK_TTL_MS)
      Alert.alert('Done', 'Profile picture updated!')
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || err?.error_description || JSON.stringify(err) || 'Could not upload profile picture.')
    } finally { setUploadingAvatar(false) }
  }

  const handleNavigateToMaterials = useCallback(() => {
    if (seenLoadedRef.current) {
      recentMaterials.forEach((m: Material) => seenMaterialIdsRef.current.add(m.id))
      void AsyncStorage.setItem(SEEN_MATERIALS_KEY, JSON.stringify([...seenMaterialIdsRef.current])).catch(() => {})
    }
    routerRef.current.push('/new-materials' as any)
  }, [recentMaterials])

  const quickActions = useMemo(() => [
    { label: 'Materials',    emoji: '📚', color: C.sapphire, bg: C.sapphDim,  borderColor: 'rgba(75,140,245,0.18)',   badge: newMaterialCount > 0 ? newMaterialCount : undefined, onPress: handleNavigateToMaterials },
    { label: 'AI Tutor',     emoji: '✨',  color: C.sky,      bg: C.skyDim,    borderColor: 'rgba(56,189,248,0.18)',   badge: undefined, onPress: () => routerRef.current.push({ pathname: '/chat' as any, params: { material_title: 'General Assistant', file_url: '' } }) },
    { label: 'Quiz & Cards', emoji: '🧠', color: C.coral,    bg: C.coralDim,  borderColor: 'rgba(238,104,104,0.18)', badge: undefined, onPress: () => routerRef.current.push('/quiz-flashcards' as any) },
    { label: 'Courses',      emoji: '🎓', color: C.emerald,  bg: C.emerDim,   borderColor: 'rgba(61,201,154,0.18)',  badge: undefined, onPress: () => routerRef.current.push('/my-courses' as any) },
    { label: 'College Hub',  emoji: '🏛', color: C.sky,      bg: C.skyDim,    borderColor: 'rgba(56,189,248,0.18)',  badge: undefined, onPress: () => routerRef.current.push('/college-info' as any) },
    { label: 'Grade Calc',   emoji: '🧮', color: C.gold,     bg: C.goldDim,   borderColor: 'rgba(223,168,60,0.18)',  badge: undefined, onPress: () => routerRef.current.push('/grade-calculator' as any) },
    { label: 'Deadlines',    emoji: '⏰', color: C.orange,   bg: C.orangeDim, borderColor: 'rgba(232,105,42,0.18)',  badge: deadlines.length > 0 ? deadlines.length : undefined, onPress: () => routerRef.current.push('/deadlines' as any) },
    { label: 'Leaderboard',  emoji: '🏆', color: C.orange,   bg: C.orangeDim, borderColor: 'rgba(232,105,42,0.18)',  badge: undefined, onPress: () => routerRef.current.push('/leaderboard' as any) },
  ], [newMaterialCount, deadlines.length, handleNavigateToMaterials])

const availableCards = useMemo<DashCard[]>(() => [
    {
      id: 'test', emoji: '🧪', title: 'Test Tab', sub: 'For customization testing',
      badgeLabel: 'New!', badgeColor: C.pink, badgeBg: C.pinkDim ?? '#F472B6',
      borderColor: 'rgba(244,114,182,0.14)', glowColor: 'rgba(244,114,182,0.12)',
      onPress: () => Alert.alert('Test', 'Customization works! 🎉'),
    },

    {
      id: 'solutions', emoji: '💡', title: 'Question Solutions', sub: 'Past paper & AI solutions',
      badgeLabel: 'Solve now', badgeColor: C.sapphire, badgeBg: C.sapphDim,
      borderColor: 'rgba(75,140,245,0.14)', glowColor: 'rgba(75,140,245,0.12)',
      onPress: () => routerRef.current.push('/solutions' as any),
    },
    {
      id: 'mats', emoji: '📂', title: 'Study Materials', sub: 'Docs, slides, past Qs',
      badgeLabel: stats.total > 0 ? `${stats.total} files` : 'Browse all', badgeColor: C.gold, badgeBg: C.goldDim,
      borderColor: 'rgba(223,168,60,0.14)', glowColor: 'rgba(223,168,60,0.12)',
      onPress: () => routerRef.current.push('/study-materials' as any),
    },
    {
      id: 'notes', emoji: '📝', title: 'Notes', sub: 'Peer-written notes',
      badgeLabel: '8 new notes', badgeColor: C.orange, badgeBg: C.orangeDim,
      borderColor: 'rgba(232,105,42,0.14)', glowColor: 'rgba(232,105,42,0.12)',
      onPress: () => routerRef.current.push('/notes' as any),
    },
    {
      id: 'plan', emoji: '🗓', title: 'Study Planner', sub: 'Tasks & goals',
      badgeLabel: 'Plan week', badgeColor: C.emerald, badgeBg: C.emerDim,
      borderColor: 'rgba(61,201,154,0.14)', glowColor: 'rgba(61,201,154,0.12)',
      onPress: () => routerRef.current.push('/(tabs)/study-planner' as any),
    },
    {
      id: 'contribute', emoji: '⬆️', title: 'Contribute', sub: 'Upload study materials',
      badgeLabel: 'Share now', badgeColor: C.lavender, badgeBg: C.lavDim,
      borderColor: 'rgba(155,124,244,0.14)', glowColor: 'rgba(155,124,244,0.12)',
      onPress: () => routerRef.current.push('/contribute' as any),
    },
    {
      id: 'contributors', emoji: '🌟', title: 'Contributors', sub: 'Top material sharers',
      badgeLabel: 'View all', badgeColor: C.coral, badgeBg: C.coralDim,
      borderColor: 'rgba(238,104,104,0.14)', glowColor: 'rgba(238,104,104,0.12)',
      onPress: () => routerRef.current.push('/contributors' as any),
    },
  ], [stats.total])

  const dashCards = useMemo(() => {
    const selected = customCards.map(id => availableCards.find(c => c.id === id)).filter(Boolean) as DashCard[]
    const remaining = availableCards.filter(c => !customCards.includes(c.id))
    const padded = [...selected, ...remaining.slice(0, 6 - selected.length)]
    return padded.slice(0, 6)
  }, [availableCards, customCards])

  const scheduleItems = useMemo((): ScheduleItem[] => [
    { id: '1', hour: '10', period: 'AM', title: 'Data Structures Lecture', meta: 'Hall 4B · Prof. Miller', tagLabel: 'Live now',     tagColor: C.orange,   tagBg: C.orangeDim, dotColor: C.orange },
    { id: '2', hour: '02', period: 'PM', title: 'Study Group Session',     meta: 'Main Library (Rescheduled)',  tagLabel: 'Rescheduled', tagColor: C.coral,    tagBg: C.coralDim,  dotColor: C.textMute, cancelled: true },
    { id: '3', hour: '04', period: 'PM', title: 'AI Tutor Session',        meta: 'Online · DCIT 303',           tagLabel: 'Upcoming',    tagColor: C.sapphire, tagBg: C.sapphDim,  dotColor: C.sapphire },
    { id: '4', hour: '07', period: 'PM', title: 'Algorithms Problem Set',  meta: 'Due tonight · CS 161',        tagLabel: 'Deadline',    tagColor: C.lavender, tagBg: C.lavDim,    dotColor: C.lavender },
  ], [])

  function matMeta(type: string): { typeColor: string; typeBg: string; typeLabel: string; icon: IoniconName } {
    switch (type) {
      case 'past_question': return { typeColor: C.sapphire, typeBg: C.sapphDim, typeLabel: 'Past Q',   icon: 'document-text' }
      case 'slide':         return { typeColor: C.lavender, typeBg: C.lavDim,   typeLabel: 'Slides',   icon: 'easel'         }
      case 'book':          return { typeColor: C.emerald,  typeBg: C.emerDim,  typeLabel: 'Book',     icon: 'book'          }
      case 'tutorial':      return { typeColor: C.gold,     typeBg: C.goldDim,  typeLabel: 'Tutorial', icon: 'play-circle'   }
      case 'notes':         return { typeColor: C.coral,    typeBg: C.coralDim, typeLabel: 'Notes',    icon: 'pencil'        }
      default:              return { typeColor: C.sky,      typeBg: C.skyDim,   typeLabel: type,       icon: 'document'      }
    }
  }

  const hasUrgentAnnouncement = announcements.some(a => a.priority === 'high')

  if (!cacheReady || (!effectiveData && isLoading)) {
    return (
      <View style={s.loadingScreen}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text maxFontSizeMultiplier={1.3} style={s.loadingText}>Loading dashboard…</Text>
      </View>
    )
  }

  if (cacheReady && !isLoading && !profile) {
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

  const firstName    = profile?.full_name?.split(' ')[0] || 'Student'
  const hour         = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>
      {/* ════════ FIXED NAV BAR ════════ */}
      <View style={[s.nav, { paddingTop: insets.top + 10 }]}>
        <View style={s.orbOrange} />
        <View style={s.orbBlue} />
        <View style={s.orbPurple} />

        <View style={s.navBrand}>
          <View style={s.navLogo}>
            <Text style={{ fontSize: 16 }}>🎓</Text>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={s.navWordmark}>
            student<Text style={s.navWordmarkAccent}>share</Text>
          </Text>
        </View>

        <TouchableOpacity style={s.navSearchBox} onPress={() => router.push('/search' as any)} activeOpacity={0.85}>
          <Ionicons name="search-outline" size={13} color={C.textMute} />
          <Text allowFontScaling={false} style={s.navSearchPlaceholder} numberOfLines={1}>Search…</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/notifications' as any)} activeOpacity={0.8}>
          <Animated.View style={{ transform: [{ rotate: bellAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-18deg', '0deg', '18deg'] }) }] }}>
            <Ionicons name="notifications" size={16} color={notifCount > 0 ? C.orange : C.textSub} />
          </Animated.View>
          {notifCount > 0 && <View style={s.navNotifPip} />}
        </TouchableOpacity>
      </View>

      {!isOnline && <OfflineBanner />}

      {/* ════════ SCROLLABLE CONTENT ════════ */}
      <ScrollView
        style={s.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, paddingTop: insets.top + 64 }}
      >
        {/* ════════ HERO ════════ */}
        <View style={s.hero}>
          <View style={s.profileRow}>
            <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} style={s.avatarWrap} activeOpacity={0.85}>
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
              {!uploadingAvatar && (
                <View style={s.cameraBadge}><Text style={{ fontSize: 10 }}>📷</Text></View>
              )}
            </TouchableOpacity>

            <View style={s.profileText}>
              <Text maxFontSizeMultiplier={1.3} style={s.greetingLabel}>{timeGreeting}</Text>
              <View style={s.nameRow}>
                <Text maxFontSizeMultiplier={1.3} style={s.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {firstName}
                </Text>
                {profile?.is_verified && <MetaVerifiedBadge size={22} />}
              </View>
              <View style={s.pillsRow}>
                {profile?.is_verified && (
                  <View style={[s.pill, s.pillVerified]}>
                    <Text allowFontScaling={false} style={s.pillVerifiedText}>✓ Verified</Text>
                  </View>
                )}
                {profile?.is_premium && (
                  <View style={[s.pill, s.pillPremium]}>
                    <Text allowFontScaling={false} style={s.pillPremiumText}>★ Premium</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {profile?.college && (
            <View style={s.infoRow}>
              <View style={[s.infoCell, { flex: 1 }]}>
                <View style={s.infoCellLabelRow}>
                  <Text style={s.infoCellIcon}>🏛</Text>
                  <Text allowFontScaling={false} style={s.infoCellLabel}>COLLEGE</Text>
                </View>
                <Text maxFontSizeMultiplier={1.3} style={s.infoCellVal} numberOfLines={2}>
                  {profile.college.short_name || profile.college.name}
                </Text>
              </View>
              <View style={s.infoCellDivider} />
              <View style={[s.infoCell, s.infoCellRight, { flex: 1 }]}>
                <View style={s.infoCellLabelRow}>
                  <Text style={s.infoCellIcon}>🎓</Text>
                  <Text allowFontScaling={false} style={s.infoCellLabel}>CLASS</Text>
                </View>
                <Text maxFontSizeMultiplier={1.3} style={s.infoCellVal} numberOfLines={2}>
                  {profile.class?.name ?? '—'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ════════ BODY ════════ */}
        <View style={s.body}>

          {/* MOTIVATION */}
          <View style={s.motCard}>
            <Text maxFontSizeMultiplier={1.3} style={s.motEyebrow}>MOTIVATION OF THE DAY</Text>
            <Text maxFontSizeMultiplier={1.3} style={s.motQuote}>"{motivation.quote}"</Text>
            <Text maxFontSizeMultiplier={1.3} style={s.motAuthor}>— {motivation.author}</Text>
          </View>

          {/* PROGRESS */}
          <View style={s.section}>
            <View style={s.progBlock}>
              <View style={s.progRow}>
                <View>
                  <Text maxFontSizeMultiplier={1.3} style={s.progTitle}>Weekly Study Goal</Text>
                  <Text maxFontSizeMultiplier={1.3} style={s.progSub}>{Math.round(studyProgress * 25 / 100)} of 25 study hours completed</Text>
                </View>
                <Text maxFontSizeMultiplier={1.3} style={s.progPct}>{Math.round(studyProgress)}%</Text>
              </View>
              <View style={s.progTrack}>
                <View style={[s.progFill, { width: `${studyProgress}%` as any }]}>
                  <View style={s.progDot} />
                </View>
              </View>
            </View>
          </View>

          {/* ANNOUNCEMENTS */}
          <View style={s.section}>
            <TouchableOpacity
              style={[s.annToggle, showAnnouncements && s.annToggleOpen]}
              onPress={() => setShowAnnouncements(p => !p)}
              activeOpacity={0.85}
            >
              <View style={s.annToggleLeft}>
                {hasUrgentAnnouncement && (
                  <Animated.View style={[s.annUrgentDot, { transform: [{ scale: urgentPulse }] }]} />
                )}
                <Text maxFontSizeMultiplier={1.3} style={s.annToggleLabel}>Announcements</Text>
                {announcements.length > 0 && (
                  <View style={s.annCountBadge}>
                    <Text allowFontScaling={false} style={s.annCountText}>{announcements.length}</Text>
                  </View>
                )}
              </View>
              <View style={s.annToggleRight}>
                {showAnnouncements && isAdmin && (
                  <TouchableOpacity style={s.gearBtn} onPress={e => { e.stopPropagation?.(); setShowAnnouncementAdmin(true) }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="settings-outline" size={13} color={C.textMute} />
                  </TouchableOpacity>
                )}
                {showAnnouncements && (
                  <Text maxFontSizeMultiplier={1.3} style={s.annSeeAll}>See all</Text>
                )}
                <View style={[s.annChevron, showAnnouncements && s.annChevronOpen]}>
                  <Ionicons name={showAnnouncements ? 'chevron-up' : 'chevron-down'} size={12} color={showAnnouncements ? C.orange : C.textSub} />
                </View>
              </View>
            </TouchableOpacity>

            {showAnnouncements && (
              <View style={s.annDrawer}>
                {announcements.length === 0 ? (
                  <View style={s.annDrawerEmpty}>
                    <Ionicons name="megaphone-outline" size={22} color={C.textMute} />
                    <Text maxFontSizeMultiplier={1.3} style={s.annDrawerEmptyText}>No announcements right now</Text>
                  </View>
                ) : (
                  announcements.map((a, i) => (
                    <View key={a.id} style={[s.annItem, i < announcements.length - 1 && s.annItemBorder]}>
                      <View style={[s.annPriorityDot, { backgroundColor: priorityColor(a.priority) }]} />
                      <View style={s.annContent}>
                        <Text maxFontSizeMultiplier={1.3} style={s.annTitle}>{a.title}</Text>
                        <Text maxFontSizeMultiplier={1.3} style={s.annBody} numberOfLines={2}>{a.body}</Text>
                        <View style={s.annMeta}>
                          <View style={[s.annTag, { borderColor: priorityColor(a.priority) + '30', backgroundColor: priorityBg(a.priority) }]}>
                            <Text allowFontScaling={false} style={[s.annTagText, { color: priorityColor(a.priority) }]}>{a.priority.toUpperCase()}</Text>
                          </View>
                          <Text allowFontScaling={false} style={s.annDate}>{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                        </View>
                        {a.image_url && <Image source={{ uri: a.image_url }} style={s.annImage} resizeMode="cover" />}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {/* QUICK ACTIONS */}
          <View style={s.section}>
            <SectionHead title="Quick Actions" />
            <View style={s.qaGrid}>
              {quickActions.map(item => (
                <QuickActionItem
                  key={item.label}
                  label={item.label}
                  emoji={item.emoji}
                  color={item.color}
                  bg={item.bg}
                  borderColor={item.borderColor}
                  badge={item.badge}
                  onPress={item.onPress}
                />
              ))}
            </View>
          </View>

          {/* DASHBOARD CARDS */}
          <View style={s.section}>
            <SectionHead title="Dashboard" link="Customize" onLink={() => setShowCustomize(true)} />
            <View style={s.dashGrid}>
              {(() => {
                const cw = DASH_CARD_WIDTH(screenWidth)
                const rows: DashCard[][] = []
                for (let i = 0; i < dashCards.length; i += 2) {
                  rows.push(dashCards.slice(i, i + 2))
                }
                return rows.map((row, rowIdx) => (
                  <View key={rowIdx} style={s.dashRow}>
                    {row.map((card, colIdx) => (
                      <DashCardItem key={card.id} card={card} cardWidth={cw} />
                    ))}
                    {row.length === 1 && <View style={{ width: cw }} />}
                  </View>
                ))
              })()}
            </View>
          </View>

          {/* UPCOMING DEADLINES */}
          <View style={s.section}>
            <SectionHead title="Upcoming Deadlines" link="Manage" onLink={() => routerRef.current.push('/deadlines' as any)} />
            {deadlines.length === 0 ? (
              <TouchableOpacity style={s.deadlineEmpty} onPress={() => setShowAddDeadline(true)} activeOpacity={0.8}>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 24 }}>
                {sortDeadlines(deadlines).slice(0, 5).map(d => (
                  <DeadlineChip key={d.id} d={d} onRemove={() => setDeadlines(p => p.filter(x => x.id !== d.id))} />
                ))}
                <TouchableOpacity style={s.deadlineAddChip} onPress={() => setShowAddDeadline(true)} activeOpacity={0.8}>
                  <Ionicons name="add" size={20} color={C.textMute} />
                  <Text allowFontScaling={false} style={s.deadlineAddText}>Add</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>

          {/* TODAY'S SCHEDULE */}
          <View style={s.section}>
            <SectionHead title="Today's Schedule" link="View all" onLink={() => routerRef.current.push('/(tabs)/study-planner' as any)} />
            <View style={s.scheduleWrap}>
              {scheduleItems.map((item, i) => (
                <ScheduleRow key={item.id} item={item} isLast={i === scheduleItems.length - 1} />
              ))}
            </View>
          </View>

          {/* RECENT MATERIALS — collapsible */}
          {recentMaterials.length > 0 && (
            <View style={s.section}>
              <TouchableOpacity
                style={[s.matToggle, showRecentMaterials && s.matToggleOpen]}
                onPress={() => setShowRecentMaterials(p => !p)}
                activeOpacity={0.85}
              >
                <View style={s.matToggleLeft}>
                  <Text maxFontSizeMultiplier={1.3} style={s.matToggleLabel}>Recent Materials</Text>
                  {newMaterialCount > 0 && (
                    <View style={s.matNewBadge}>
                      <Text allowFontScaling={false} style={s.matNewBadgeText}>{newMaterialCount} new</Text>
                    </View>
                  )}
                </View>
                <View style={s.matToggleRight}>
                  {showRecentMaterials && (
                    <TouchableOpacity onPress={handleNavigateToMaterials} activeOpacity={0.7}>
                      <Text maxFontSizeMultiplier={1.3} style={s.matSeeAll}>See all</Text>
                    </TouchableOpacity>
                  )}
                  <View style={[s.annChevron, showRecentMaterials && s.annChevronOpen]}>
                    <Ionicons name={showRecentMaterials ? 'chevron-up' : 'chevron-down'} size={12} color={showRecentMaterials ? C.orange : C.textSub} />
                  </View>
                </View>
              </TouchableOpacity>

              {showRecentMaterials && (
                <View style={s.matDrawer}>
                  {recentMaterials.slice(0, 5).map((mat: Material) => (
                    <MaterialRow key={mat.id} mat={{ ...mat, ...matMeta(mat.type) }} />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* LEADERBOARD PREVIEW — "Full board" navigates to /leaderboard screen */}
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

      {/* ── Modals ── */}
      <GradeCalculatorModal visible={showGradeCalc} onClose={() => setShowGradeCalc(false)} />
      <AddDeadlineModal
        visible={showAddDeadline}
        onClose={() => setShowAddDeadline(false)}
        onAdd={d => setDeadlines(prev => [...prev, { ...d, id: Date.now().toString() }])}
      />

      {/*
        LeaderboardModal — now uses the shared component from
        @/components/leaderboard/LeaderboardModal.
        Props are identical to the old inline version.
        The modal is kept for quick preview; tapping "Full board" pushes to /leaderboard.
      */}
      <LeaderboardModal
        visible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        userId={userId}
        collegeId={collegeId}
        collegeName={collegeName}
      />

      <AnnouncementAdminModal
        visible={showAnnouncementAdmin}
        onClose={() => setShowAnnouncementAdmin(false)}
        announcements={announcements}
        classId={classId}
        collegeId={collegeId}
        onOptimisticUpdate={updater => {
          queryClient.setQueryData<Announcement[]>(['announcements', classId, collegeId], prev => updater(prev ?? []))
        }}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ['announcements', classId, collegeId] })
          void AsyncStorage.removeItem(ANNOUNCEMENTS_KEY).catch(() => {})
        }}
        onSaveSuccess={() => setShowAnnouncements(true)}
      />

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

function CustomizeModal({
  visible,
  availableCards,
  customCards,
  onClose,
  onSave,
}: {
  visible: boolean
  availableCards: DashCard[]
  customCards: string[]
  onClose: () => void
  onSave: (newCards: string[]) => void
}) {
  const [tempSelected, setTempSelected] = useState(customCards)

  useEffect(() => {
    if (visible) {
      setTempSelected(customCards)
    }
  }, [visible, customCards])

  const handleToggle = (id: string) => {
    setTempSelected(prev => {
      const newSel = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
      return newSel.slice(0, 6) // Enforce max 6
    })
  }

  const handleSave = () => {
    onSave(tempSelected)
    onClose()
  }

  const handleReset = () => {
    setTempSelected(['solutions', 'mats', 'notes', 'plan', 'contribute', 'contributors'])
  }

  const maxedOut = tempSelected.length >= 6

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { paddingBottom: 36 }]}>
            <View style={m.handleRow}><View style={m.handle} /></View>
            <View style={m.header}>
              <View>
                <Text maxFontSizeMultiplier={1.3} style={m.title}>Customize Dashboard</Text>
                <Text maxFontSizeMultiplier={1.3} style={m.subtitle}>Choose up to 6 cards (3x2 grid)</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={[m.fieldLabel, { marginBottom: 12 }]} numberOfLines={1}>
              {tempSelected.length}/6 cards selected
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {availableCards.map(card => {
                const isSelected = tempSelected.includes(card.id)
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[
                      m.cardItem,
                      isSelected && { backgroundColor: card.glowColor + '20' }
                    ]}
                    onPress={() => !maxedOut || isSelected ? handleToggle(card.id) : null}
                    activeOpacity={0.7}
                  >
                    <View style={m.cardCheckbox}>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={isSelected ? C.emerald : C.textMute}
                      />
                    </View>
                    <View style={[m.cardIcon, { backgroundColor: card.badgeBg }]}>
                      <Text style={m.cardEmoji}>{card.emoji}</Text>
                    </View>
                    <View style={m.cardText}>
                      <Text maxFontSizeMultiplier={1.3} style={m.cardTitle} numberOfLines={1}>{card.title}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={m.cardSub} numberOfLines={1}>{card.sub}</Text>
                    </View>
                    {maxedOut && !isSelected && (
                      <View style={m.maxedBadge}>
                        <Text style={m.maxedText}>MAX</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={[m.primaryBtn, { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                onPress={handleReset}
                activeOpacity={0.8}
              >
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '700', color: C.text }}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.primaryBtn, { flex: 1 }]}
                onPress={handleSave}
                disabled={tempSelected.length === 0}
                activeOpacity={0.8}
              >
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                  {tempSelected.length === 0 ? 'Select cards' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

export default function HomeScreen() {
  return (
    <HomeErrorBoundary>
      <HomeScreenInner />
    </HomeErrorBoundary>
  )
}

// ─────────────────────────────────────────────
// LEADERBOARD PREVIEW STYLES
// ─────────────────────────────────────────────
const lbp = StyleSheet.create({
  card: { backgroundColor: C.void, borderRadius: 0, overflow: 'hidden' },

  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 2, paddingBottom: 20 },
  headerLeft:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLine:{ width: 18, height: 2, backgroundColor: C.orange, borderRadius: 1 },
  headerLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 2.8, color: C.textSub },
  headerLink: { fontSize: 14, fontWeight: '700', color: C.orange },

  podiumWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8, gap: 0 },
  podSlot:    { flex: 1, alignItems: 'center', gap: 0 },
  crown:      { fontSize: 24, marginBottom: 6, textAlign: 'center' },
  podAvatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#2A2D38', borderWidth: 2, borderColor: C.void, justifyContent: 'center', alignItems: 'center' },
  podAvatarBadgeText: { fontSize: 9, fontWeight: '900', color: C.textSub },
  podName:   { fontSize: 12.5, fontWeight: '700', color: C.text, marginTop: 12, textAlign: 'center', maxWidth: 90 },
  podPts:    { fontSize: 12, fontWeight: '600', color: C.textSub, marginTop: 2, textAlign: 'center' },
  podBase1:  { width: '100%', height: 50, backgroundColor: '#1A1C24', borderTopLeftRadius: 6, borderTopRightRadius: 6, marginTop: 10 },
  podBase2:  { width: '100%', height: 34, backgroundColor: '#161820', borderTopLeftRadius: 6, borderTopRightRadius: 6, marginTop: 10 },
  podBase3:  { width: '100%', height: 26, backgroundColor: '#161820', borderTopLeftRadius: 6, borderTopRightRadius: 6, marginTop: 10 },

  rankSection: { marginTop: 4 },
  rowDivider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  rankRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingVertical: 16 },
  rankRowMe:   { backgroundColor: 'rgba(232,105,42,0.04)' },
  rankNum:     { width: 16, fontSize: 14, fontWeight: '700', color: C.textSub, textAlign: 'center', flexShrink: 0 },
  rankAvatarBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#23283A', justifyContent: 'center', alignItems: 'center', flexShrink: 0, overflow: 'hidden' },
  rankAvatarInit:{ fontSize: 18, fontWeight: '800', color: C.text },
  rankName:    { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  rankUnderline:{ height: 2, width: '80%', backgroundColor: 'rgba(155,124,244,0.18)', borderRadius: 1, overflow: 'hidden' },
  rankUnderlineFill:{ height: '100%', backgroundColor: C.lavender, borderRadius: 1, opacity: 0.75 },
  mvChip:      { minWidth: 32, alignItems: 'center', flexShrink: 0 },
  mvUp:        { fontSize: 12, fontWeight: '700', color: C.emerald },
  mvDown:      { fontSize: 12, fontWeight: '700', color: C.coral },
  mvNeutral:   { fontSize: 14, fontWeight: '700', color: C.textMute },
  ptsBox:      { alignItems: 'flex-end', flexShrink: 0, minWidth: 58 },
  rankPts:     { fontSize: 18, fontWeight: '800', color: C.text, lineHeight: 20 },
  rankPtsSub:  { fontSize: 10.5, color: C.textMute, marginTop: 1 },

  footer:        { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 4, backgroundColor: '#2A1A0E', borderWidth: 1, borderColor: 'rgba(232,105,42,0.30)', borderRadius: 20, paddingVertical: 18, paddingHorizontal: 18, gap: 0 },
  footerHash:    { fontSize: 26, fontWeight: '900', fontStyle: 'italic', color: C.orange, lineHeight: 46, flexShrink: 0 },
  footerRankNum: { fontSize: 44, fontWeight: '900', fontStyle: 'italic', color: C.orange, lineHeight: 46, marginRight: 14, flexShrink: 0 },
  footerLabel:   { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 8 },
  footerBar:     { height: 5, backgroundColor: 'rgba(232,105,42,0.20)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  footerBarFill: { height: '100%', backgroundColor: C.orange, borderRadius: 3 },
  footerSub:     { fontSize: 11, color: C.textSub },
  footerScore:   { fontSize: 28, fontWeight: '900', color: C.orange, lineHeight: 30, textAlign: 'right' },
  footerScoreSub:{ fontSize: 11, color: C.textSub, textAlign: 'right', marginTop: 2 },
})

// ─────────────────────────────────────────────
// MAIN STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.void },
  loadingScreen:{ flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadingText:  { fontSize: 14, color: C.textMute, fontWeight: '500' },
  setupScreen:  { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  setupIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  setupTitle:   { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  setupSub:     { fontSize: 14, color: C.textMute, textAlign: 'center', lineHeight: 22 },
  setupBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  setupBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  offlineBanner:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(223,168,60,0.12)', borderBottomWidth: 1, borderBottomColor: C.gold + '30', paddingVertical: 8 },
  offlineText:  { fontSize: 12, fontWeight: '600', color: C.gold },

  nav: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  navBrand:    { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0 },
  navLogo:     { width: 34, height: 34, borderRadius: 11, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 18, elevation: 8 },
  navWordmark: { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.4, fontFamily: 'serif' },
  navWordmarkAccent: { color: C.orange, fontStyle: 'italic' },
  navSearchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  navSearchPlaceholder: { flex: 1, fontSize: 12, color: C.textMute, fontWeight: '500' },
  navBtn:      { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  navNotifPip: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.orange, borderWidth: 1.5, borderColor: C.deep },

  orbOrange: { position: 'absolute', top: -120, right: -80,  width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(232,105,42,0.12)' },
  orbBlue:   { position: 'absolute', top:   40, left: -60,   width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(75,140,245,0.07)'  },
  orbPurple: { position: 'absolute', top:   80, left: '38%', width: 160, height: 160, borderRadius: 80,  backgroundColor: 'rgba(155,124,244,0.06)' },

  hero:         { backgroundColor: C.deep, paddingHorizontal: BODY_H_PAD, paddingBottom: 0, position: 'relative', overflow: 'hidden' },
  profileRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 24, position: 'relative', zIndex: 2 },
  avatarWrap:   { position: 'relative', flexShrink: 0 },
  avatarRing:   { width: 70, height: 70, borderRadius: 35, padding: 2 },
  avatarInner:  { flex: 1, borderRadius: 33, backgroundColor: C.raised, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  avatarImage:  { width: '100%', height: '100%', borderRadius: 33 },
  avatarInitial:{ fontSize: 26, fontWeight: '800', color: C.text, fontFamily: 'serif' },
  cameraBadge:  { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.orange, borderWidth: 2, borderColor: C.deep, justifyContent: 'center', alignItems: 'center' },
  profileText:  { flex: 1, minWidth: 0, paddingTop: 4 },
  greetingLabel:{ fontSize: 10, fontWeight: '600', letterSpacing: 2, color: C.textSub, marginBottom: 4 },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 1 },
  heroName:     { fontSize: 28, fontWeight: '900', fontFamily: 'serif', color: C.text, letterSpacing: -0.8, lineHeight: 30, flexShrink: 1 },
  wave:         { fontSize: 20 },
  verifiedBadge:{ width: 22, height: 22, borderRadius: 7, backgroundColor: C.sapphire, justifyContent: 'center', alignItems: 'center' },
  pillsRow:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill:         { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillVerified: { backgroundColor: C.emerDim, borderColor: 'rgba(61,201,154,0.2)' },
  pillPremium:  { backgroundColor: C.goldDim, borderColor: 'rgba(223,168,60,0.2)'  },
  pillVerifiedText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.emerald },
  pillPremiumText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.gold    },

  infoRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, marginBottom: 0, position: 'relative', zIndex: 2 },
  infoCell: { paddingVertical: 16 },
  infoCellRight: { paddingLeft: 20 },
  infoCellDivider: { width: 1, backgroundColor: C.border, marginVertical: 10 },
  infoCellLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  infoCellIcon: { fontSize: 10 },
  infoCellLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 2, color: C.textMute },
  infoCellVal: { fontSize: 13.5, fontWeight: '600', color: C.text, lineHeight: 18 },

  body:    { backgroundColor: C.void, paddingHorizontal: BODY_H_PAD },
  section: { marginTop: 34 },

  sectionHead:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionOrangeLine:{ width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionTitle:     { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },
  sectionLink:      { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.3 },

  tagChip:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagChipText:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },

  motCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 20, padding: 20, marginTop: 28, marginBottom: 0, position: 'relative', overflow: 'hidden' },
  motEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 2.5, color: C.orange, marginBottom: 14 },
  motQuote:   { fontSize: 16, fontWeight: '600', fontStyle: 'italic', color: C.text, lineHeight: 26, marginBottom: 12, paddingLeft: 4 },
  motAuthor:  { fontSize: 11, color: C.textSub, fontWeight: '500' },

  progBlock: { marginTop: 6 },
  progRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  progTitle: { fontSize: 13.5, fontWeight: '600', color: C.text },
  progSub:   { fontSize: 11, color: C.textSub, marginTop: 2 },
  progPct:   { fontSize: 24, fontWeight: '900', fontFamily: 'serif', color: C.emerald },
  progTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'visible', position: 'relative' },
  progFill:  { height: '100%', backgroundColor: C.emerald, borderRadius: 3, position: 'relative' },
  progDot:   { position: 'absolute', right: -5, top: -4, width: 11, height: 11, borderRadius: 5.5, backgroundColor: C.emerald, borderWidth: 2, borderColor: C.void, shadowColor: C.emerald, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10, elevation: 4 },

  annToggle:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 0 },
  annToggleOpen:  { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: 'transparent', backgroundColor: C.raised },
  annToggleLeft:  { flexDirection: 'row', alignItems: 'center', gap: 9 },
  annToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  annToggleLabel: { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.1 },
  annUrgentDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.coral, flexShrink: 0, shadowColor: 'rgba(238,104,104,0.6)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 5, elevation: 2 },
  annCountBadge:  { minWidth: 20, height: 20, borderRadius: 7, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.2)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  annCountText:   { fontSize: 10, fontWeight: '800', color: C.orange },
  annSeeAll:      { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.2 },
  annChevron:     { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  annChevronOpen: { backgroundColor: C.orangeDim, borderColor: 'rgba(232,105,42,0.2)' },
  gearBtn:        { width: 26, height: 26, borderRadius: 8, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  annDrawer:       { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 },
  annDrawerEmpty:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20, justifyContent: 'center' },
  annDrawerEmptyText:{ fontSize: 13, color: C.textMute },
  annItem:       { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 15 },
  annItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  annPriorityDot:{ width: 7, height: 7, borderRadius: 3.5, flexShrink: 0, marginTop: 6 },
  annContent:    { flex: 1, minWidth: 0 },
  annTitle:      { fontSize: 13.5, fontWeight: '600', color: C.text, marginBottom: 3, lineHeight: 18 },
  annBody:       { fontSize: 11.5, color: C.textSub, lineHeight: 17 },
  annMeta:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  annTag:        { borderRadius: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  annTagText:    { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  annDate:       { fontSize: 10, color: C.textMute },
  annImage:      { width: '100%', height: 130, borderRadius: 10, marginTop: 10 },

  qaGrid:   { flexDirection: 'row', flexWrap: 'wrap' },
  qaItem:   { width: '25%', alignItems: 'center', gap: 9, paddingVertical: 16, paddingHorizontal: 6, borderRadius: 18 },
  qaIcon:   { width: 54, height: 54, borderRadius: 18, borderWidth: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  qaEmoji:  { fontSize: 23 },
  qaBadge:  { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 6, backgroundColor: C.orange, borderWidth: 2, borderColor: C.void, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  qaBadgeText:{ fontSize: 8, fontWeight: '800', color: '#fff' },
  qaLabel:  { fontSize: 10.5, fontWeight: '600', color: C.textSub, textAlign: 'center', lineHeight: 14, letterSpacing: 0.1 },

  dashGrid: { gap: COL_GAP },
  dashRow:  { flexDirection: 'row', gap: COL_GAP },
  dashCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 18, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' },
  dashCardGlow:  { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, opacity: 0.5 },
  dashCardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dashCardIcon:  { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  dashCardEmoji: { fontSize: 20 },
  dashCardArrow: { width: 26, height: 26, borderRadius: 9, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  dashCardArrowText: { fontSize: 11, color: C.textMute },
  dashCardTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'serif', color: C.text, marginBottom: 4, letterSpacing: -0.2, lineHeight: 19, zIndex: 1 },
  dashCardSub:   { fontSize: 11, color: C.textSub, zIndex: 1 },
  dashCardBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start', zIndex: 1 },
  dashCardBadgeText:{ fontSize: 10, fontWeight: '700' },

  scheduleWrap: { gap: 0 },
  schedItem:    { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border } as any,
  schedItemCancelled: { opacity: 0.4 },
  schedTime:    { width: 48, alignItems: 'center', paddingTop: 3, flexShrink: 0 },
  schedTimeVal: { fontSize: 15, fontWeight: '700', fontFamily: 'serif', color: C.text, lineHeight: 18, textAlign: 'center' },
  schedTimePeriod:{ fontSize: 9, fontWeight: '600', letterSpacing: 1, color: C.textMute, textAlign: 'center', marginTop: 1 },
  schedDotWrap: { alignItems: 'center', paddingTop: 5, flexShrink: 0 },
  schedDot:     { width: 9, height: 9, borderRadius: 4.5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 3 },
  schedLine:    { width: 1, flex: 1, minHeight: 28, backgroundColor: C.border, marginTop: 5 },
  schedContent: { flex: 1, paddingTop: 2 },
  schedTitle:   { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 3, lineHeight: 18 },
  schedTitleStrike: { textDecorationLine: 'line-through', color: C.textSub },
  schedMeta:    { fontSize: 11, color: C.textSub, lineHeight: 16 },
  schedTag:     { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginTop: 6, alignSelf: 'flex-start' },
  schedTagText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  deadlineChip:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, width: 170 },
  deadlineChipDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  deadlineChipTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 },
  deadlineChipDue:   { fontSize: 11.5, color: C.textMute, fontWeight: '500' },
  deadlineAddChip:   { width: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 14, gap: 4 },
  deadlineAddText:   { fontSize: 10.5, color: C.textMute, fontWeight: '600' },
  deadlineEmpty:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16 },
  deadlineEmptyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 10 },
  deadlineEmptyIcon: { width: 40, height: 40, minWidth: 40, minHeight: 40, flexShrink: 0, borderRadius: 12, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  deadlineEmptyTitle:{ fontSize: 13.5, fontWeight: '700', color: C.text },
  deadlineEmptySub:  { fontSize: 11.5, color: C.textMute, marginTop: 2 },
  deadlineEmptyBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.orange, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 8 },
  deadlineEmptyBtnText:{ fontSize: 12.5, fontWeight: '800', color: '#fff' },

  matToggle:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13 },
  matToggleOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomColor: 'transparent', backgroundColor: C.raised },
  matToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  matToggleRight:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  matToggleLabel:{ fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.1 },
  matNewBadge:   { minWidth: 20, height: 20, borderRadius: 7, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.2)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  matNewBadgeText:{ fontSize: 10, fontWeight: '800', color: C.orange },
  matSeeAll:     { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.2 },
  matDrawer:     { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', padding: 12, gap: 10 },

  matRow:      { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, position: 'relative', overflow: 'hidden' },
  matAccentLine:{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 2, borderRadius: 1, opacity: 0.65 },
  matIconBox:  { width: 42, height: 42, minWidth: 42, minHeight: 42, flexShrink: 0, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  matContent:  { flex: 1 },
  matTitle:    { fontSize: 13.5, fontWeight: '600', color: C.text, lineHeight: 19, marginBottom: 7 },
  matMeta:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  matCourse:   { fontSize: 11, color: C.textMute },
})

// ─────────────────────────────────────────────
// Modal Styles
// ─────────────────────────────────────────────
const m = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:        { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 48, maxHeight: '88%' },
  handleRow:    { alignItems: 'center', marginBottom: 22 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  title:        { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle:     { fontSize: 13, color: C.textMute, marginTop: 3 },
  closeBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  warningBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: 'rgba(223,168,60,0.08)', borderRadius: 12, padding: 11, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(223,168,60,0.2)' },
  warningText:  { flex: 1, fontSize: 12, color: C.gold, lineHeight: 17 },
  resultBox:    { borderRadius: 18, padding: 18, marginBottom: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 18 },
  resultGrade:  { fontSize: 52, fontWeight: '900' },
  resultAvg:    { fontSize: 24, fontWeight: '800', color: C.text },
  resultGpa:    { fontSize: 14, color: C.textMute, fontWeight: '600', marginTop: 3 },
  colHeaders:   { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 10, gap: 8 },
  colHeader:    { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.6 },
  entryRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  input:        { backgroundColor: C.raised, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 13 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30' },
  addBtnText:   { fontSize: 14, fontWeight: '700', color: C.orange },
  primaryBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 15 },
  primaryBtnText:{ fontSize: 15, fontWeight: '800', color: '#fff' },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 7 },
  colorRow:     { flexDirection: 'row', gap: 10, marginBottom: 20 },
  colorDot:     { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  emptyBox:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:    { fontSize: 14, color: C.textMute },
  deadlineCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.raised, borderRadius: 16, padding: 14, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border, gap: 12 },
  dlCourse:     { fontSize: 10.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
  dlTitle:      { fontSize: 13.5, fontWeight: '700', color: C.text, lineHeight: 19 },
  dlDate:       { fontSize: 11, color: C.textMute },
  annCard:      { flexDirection: 'row', backgroundColor: C.raised, borderRadius: 14, padding: 13, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border, gap: 10, marginBottom: 10 },
  annCardTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 3 },
  annCardBody:  { fontSize: 12.5, color: C.textSub, lineHeight: 17 },
  iconBtn:      { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  backRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 20 },
  backText:     { fontSize: 14, color: C.textSub, fontWeight: '600' },
  priorityBtn:  { flex: 1, paddingVertical: 10, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  priorityBtnText:{ fontSize: 13, fontWeight: '700', color: C.textMute },
  imgPickBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orangeDim, borderRadius: 13, paddingVertical: 14, borderWidth: 1, borderColor: C.orange + '25', marginBottom: 4 },

  // Customize Modal
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.raised,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardCheckbox: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardEmoji: { fontSize: 20 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: C.textSub },
  maxedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.coralDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maxedText: { fontSize: 10, fontWeight: '800', color: C.coral },
})
