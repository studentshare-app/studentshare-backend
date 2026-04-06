/**
 * src/features/library/screens/LibraryScreen.tsx  —  PRODUCTION-READY
 *
 * FIXES APPLIED (cross-referenced with audit)
 * ────────────────────────────────────────────
 * Bug
 *  1. onToggleSearch fixed — was () => {} no-op; now properly toggles showSearch
 *  2. featuredItems derives from `filtered` not `downloadsWithLocal.slice(0,2)`
 *  3. openMenuId reset on tab switch
 *  4. useQueryClient import removed (unused)
 *
 * Performance
 *  5. HeartBtn wrapped in React.memo
 *  6. SkeletonRow wrapped in React.memo + animation loop cleaned up on unmount
 *  7. ScalePress onIn/onOut handlers stable via useCallback
 *  8. scale computed once at screen level and passed down — no per-card
 *     useWindowDimensions() calls
 *
 * UI/UX
 *  9. Empty state message accounts for offlineOnly ("No offline files saved")
 * 10. Pull-to-refresh wired up on SectionList
 * 11. Filter chips have accessibilityState={{ selected }}
 * 12. fontFamily: 'serif' removed from navWordmark (invalid on Android)
 *
 * Accessibility
 * 13. HeartBtn: accessibilityRole, accessibilityLabel, accessibilityState
 * 14. ScalePress: accessibilityRole="button"
 * 15. DocumentRow action menu buttons: accessibilityLabel on each
 * 16. Tab buttons: accessibilityRole="tab", accessibilityState={{ selected }}
 *     (handled in LibraryHeader)
 * 17. Filter chips: accessibilityState={{ selected }}
 * 18. FeaturedCard arrow chip marked hidden (decorative)
 * 19. SectionHead link button accessibilityRole
 *
 * Safety
 * 20. Error state added — if useDownloadsState sets an error, a retry banner
 *     is shown instead of a confusing empty screen
 *
 * Cleanup
 * 21. LinearGradient import removed (not used in this file)
 * 22. Trailing blank lines removed
 * 23. LockedIcon name typed as IoniconsName (no more `as any`)
 * 24. TYPE_META, TYPE_FALLBACK, C, BODY_H_PAD, COL_GAP, timeAgo, formatBytes,
 *     matchesQuery all imported from libraryConstants — duplicates removed
 * 25. LibraryHeader now receives onClearQuery and the search toggle no longer
 *     leaks raw state setters out of the screen
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'

import { supabase }          from '@/core/api/supabase'
import { useProfileSync }    from '@/hooks/useProfileSync'
import { usePremium }        from '@/core/entitlements/PremiumProvider'
import { useDownloadsState } from '@/features/library/hooks/useDownloadsState'
import { useLibraryActions } from '@/features/library/hooks/useLibraryActions'
import { useMaterialsActions } from '@/features/materials/hooks/useMaterialsActions'
import { useFolders }        from '@/features/library/hooks/useFolders'
import {
  AddToFolderSheet,
  FolderFormModal,
  PremiumGateModal,
} from '@/features/library/components/LibraryModals'
import { LibraryHeader }  from '@/features/library/components/LibraryHeader'
import { FavoritesTab }   from '@/features/library/components/FavoritesTab'
import { FoldersTab }     from '@/features/library/components/FoldersTab'
import {
  C,
  BODY_H_PAD,
  COL_GAP,
  TAB_H,
  TYPE_META,
  TYPE_FALLBACK,
  matchesQuery,
  timeAgo,
  formatBytes,
} from '@/features/library/utils/libraryConstants'
import type { Download } from '@/features/library/utils/downloads'

// ── Types ─────────────────────────────────────────────────────────────────────
type IoniconsName = React.ComponentProps<typeof Ionicons>['name']
type DLSection    = { title: string; data: Download[] }
type SortOption   = 'date' | 'title' | 'type'
type TabOption    = 'downloads' | 'favorites' | 'folders'

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS: { label: string; value: TabOption }[] = [
  { label: 'Downloads', value: 'downloads' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Folders',   value: 'folders'   },
]

const FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Past Q',    value: 'past_question' },
  { label: 'Slides',    value: 'slide' },
  { label: 'Books',     value: 'book' },
  { label: 'Tutorials', value: 'tutorial' },
]

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Date',  value: 'date'  },
  { label: 'Title', value: 'title' },
  { label: 'Type',  value: 'type'  },
]

// ── Responsive scale ──────────────────────────────────────────────────────────
function useScale() {
  const { width } = useWindowDimensions()
  return Math.min(1.20, Math.max(0.78, width / 390))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByDate(downloads: Download[], sort: SortOption): DLSection[] {
  const DAY        = 86_400_000
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const groups: Record<string, Download[]> = {
    Today: [], Yesterday: [], 'This Week': [], 'This Month': [], Older: [],
  }
  downloads.forEach(d => {
    const t = new Date(d.downloaded_at).setHours(0, 0, 0, 0)
    if      (t >= todayStart.getTime())             groups['Today'].push(d)
    else if (t >= todayStart.getTime() - DAY)       groups['Yesterday'].push(d)
    else if (t >= todayStart.getTime() - 7  * DAY)  groups['This Week'].push(d)
    else if (t >= todayStart.getTime() - 30 * DAY)  groups['This Month'].push(d)
    else                                             groups['Older'].push(d)
  })
  const sortFn = (a: Download, b: Download) => {
    if (sort === 'title') return a.material.title.localeCompare(b.material.title)
    if (sort === 'type')  return a.material.type.localeCompare(b.material.type)
    return new Date(b.downloaded_at).getTime() - new Date(a.downloaded_at).getTime()
  }
  return Object.entries(groups)
    .filter(([, data]) => data.length > 0)
    .map(([title, data]) => ({ title, data: [...data].sort(sortFn) }))
}

// ── ScalePress ────────────────────────────────────────────────────────────────
function ScalePress({
  children,
  onPress,
  onLongPress,
}: {
  children:     ReactNode
  onPress?:     () => void
  onLongPress?: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = useCallback(() =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start(),
  [scale])
  const onOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start(),
  [scale])
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onIn}
      onPressOut={onOut}
      accessibilityRole="button"
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  )
}

// ── TagChip ───────────────────────────────────────────────────────────────────
function TagChip({ label, color, bg, scale = 1 }: {
  label: string; color: string; bg: string; scale?: number
}) {
  return (
    <View style={[mc.tagChip, {
      backgroundColor: bg,
      borderColor: color + '30',
      paddingHorizontal: Math.round(8 * scale),
      paddingVertical: Math.round(3 * scale),
    }]}>
      <Text
        allowFontScaling={false}
        style={[mc.tagChipText, { color, fontSize: Math.round(10 * scale) }]}
      >
        {label}
      </Text>
    </View>
  )
}

// ── SectionHead ───────────────────────────────────────────────────────────────
function SectionHead({ title, link, onLink }: {
  title: string; link?: string; onLink?: () => void
}) {
  return (
    <View style={mc.sectionHead}>
      <View style={mc.labelRow}>
        <View style={mc.orangeLine} accessibilityElementsHidden importantForAccessibility="no" />
        <Text maxFontSizeMultiplier={1.3} style={mc.sectionTitle}>
          {title.toUpperCase()}
        </Text>
      </View>
      {onLink && (
        <TouchableOpacity
          onPress={onLink}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={link}
        >
          <Text maxFontSizeMultiplier={1.3} style={mc.sectionLink}>{link}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const mc = StyleSheet.create({
  tagChip:      { borderRadius: 6, borderWidth: 1 },
  tagChipText:  { fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  labelRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orangeLine:   { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionTitle: { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },
  sectionLink:  { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.3 },
})

// ── HeartBtn — memoised (#5) ──────────────────────────────────────────────────
const HeartBtn = memo(function HeartBtn({
  liked,
  onPress,
  size = 18,
}: {
  liked: boolean; onPress: () => void; size?: number
}) {
  const scale = useRef(new Animated.Value(1)).current
  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 8 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 50, bounciness: 4 }),
    ]).start()
    onPress()
  }, [scale, onPress])

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.8}
      accessibilityRole="togglebutton"
      accessibilityLabel={liked ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ checked: liked }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={size}
          color={liked ? C.coral : C.textMute}
        />
      </Animated.View>
    </TouchableOpacity>
  )
})

// ── SkeletonRow — memoised, animation cleaned up (#6) ────────────────────────
const SkeletonRow = memo(function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[sk.row, { opacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={sk.icon} />
      <View style={{ flex: 1, gap: 9 }}>
        <View style={{ height: 13, width: '60%', backgroundColor: C.raised, borderRadius: 6 }} />
        <View style={{ height: 10, width: '35%', backgroundColor: C.surface, borderRadius: 6 }} />
      </View>
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.surface }} />
    </Animated.View>
  )
})
const sk = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: C.surface, borderRadius: 18, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.raised },
})

// ── LockedIcon ────────────────────────────────────────────────────────────────
function LockedIcon({ name, size, color, locked }: {
  name: IoniconsName; size: number; color: string; locked: boolean
}) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={name} size={size} color={color} />
      {locked && (
        <View style={li.badge}>
          <Ionicons name="lock-closed" size={7} color="#fff" />
        </View>
      )}
    </View>
  )
}
const li = StyleSheet.create({
  badge: { position: 'absolute', bottom: -3, right: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: C.gold, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: C.void },
})

// ── FeaturedCard ──────────────────────────────────────────────────────────────
function FeaturedCard({ item, liked, scale, onPress, onLike }: {
  item: Download; liked: boolean; scale: number
  onPress: () => void; onLike: () => void
}) {
  const meta    = TYPE_META[item.material.type] ?? TYPE_FALLBACK
  const iconSz  = Math.round(20 * scale)
  const iconBox = Math.round(44 * scale)
  const titleSz = Math.round(13.5 * scale)
  const minH    = Math.round(150 * scale)

  return (
    <ScalePress onPress={onPress}>
      <View style={[fCard.card, { borderColor: meta.color + '22', flex: 1, minHeight: minH }]}>
        <View
          style={[fCard.glow, { backgroundColor: meta.color + '14' }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={fCard.top}>
          <View style={[fCard.iconBox, {
            backgroundColor: meta.dimBg,
            width: iconBox, height: iconBox,
            borderRadius: Math.round(14 * scale),
          }]}>
            <Ionicons name={meta.icon} size={iconSz} color={meta.color} />
          </View>
          <View style={fCard.topRight}>
            <HeartBtn liked={liked} onPress={onLike} size={Math.round(16 * scale)} />
            <View
              style={fCard.arrowChip}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Text style={fCard.arrowText}>↗</Text>
            </View>
          </View>
        </View>
        <View>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[fCard.title, { fontSize: titleSz }]}
            numberOfLines={2}
          >
            {item.material.title}
          </Text>
          <View style={fCard.metaRow}>
            <TagChip label={meta.short} color={meta.color} bg={meta.dimBg} scale={scale} />
            {item.isOffline && (
              <View style={fCard.offlinePip}>
                <Ionicons name="cloud-done-outline" size={Math.round(10 * scale)} color={C.emerald} />
              </View>
            )}
          </View>
          <View style={[fCard.badge, { backgroundColor: meta.dimBg }]}>
            <Text
              allowFontScaling={false}
              style={[fCard.badgeText, { color: meta.color, fontSize: Math.round(10 * scale) }]}
            >
              {timeAgo(item.downloaded_at)}
            </Text>
          </View>
        </View>
      </View>
    </ScalePress>
  )
}
const fCard = StyleSheet.create({
  card:       { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, padding: 18, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' },
  glow:       { position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, opacity: 0.5 },
  top:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  topRight:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBox:    { justifyContent: 'center', alignItems: 'center' },
  arrowChip:  { width: 26, height: 26, borderRadius: 9, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  arrowText:  { fontSize: 11, color: C.textMute },
  title:      { fontWeight: '700', color: C.text, lineHeight: 19, letterSpacing: -0.1, marginBottom: 8 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  offlinePip: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.emerDim, justifyContent: 'center', alignItems: 'center' },
  badge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText:  { fontWeight: '700' },
})

// ── DocumentRow ───────────────────────────────────────────────────────────────
function DocumentRow({ item, liked, scale, onOpen, onChat, onRemove, onCacheFile, onQuiz, onAddToFolder, onLike, caching, selected, onLongPress, isPremium, menuOpen, onToggleMenu }: {
  item: Download; liked: boolean; scale: number
  onOpen: () => void; onChat: () => void; onRemove: () => void
  onCacheFile: () => void; onQuiz: () => void; onAddToFolder: () => void; onLike: () => void
  caching: boolean; selected: boolean; onLongPress: () => void
  isPremium: boolean; menuOpen: boolean; onToggleMenu: () => void
}) {
  const meta    = TYPE_META[item.material.type] ?? TYPE_FALLBACK
  const iconSz  = Math.round(19 * scale)
  const iconBox = Math.round(44 * scale)
  const titleSz = Math.round(13.5 * scale)

  return (
    <ScalePress onPress={onOpen} onLongPress={onLongPress}>
      <View style={[drow.wrap, selected && drow.wrapSelected]}>
        <View style={[drow.accentLine, { backgroundColor: meta.color }]} />
        {selected && (
          <View style={drow.checkWrap}>
            <Ionicons name="checkmark-circle" size={Math.round(15 * scale)} color={C.orange} />
          </View>
        )}
        <View style={[drow.iconBox, {
          backgroundColor: meta.dimBg,
          borderColor: meta.color + '20',
          width: iconBox, height: iconBox, minWidth: iconBox,
          borderRadius: Math.round(13 * scale),
        }]}>
          <Ionicons name={meta.icon} size={iconSz} color={meta.color} />
        </View>
        <View style={drow.info}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={[drow.title, { fontSize: titleSz }]}
            numberOfLines={1}
          >
            {item.material.title}
          </Text>
          <View style={[drow.metaRow, { gap: Math.round(4 * scale) }]}>
            <TagChip label={meta.short} color={meta.color} bg={meta.dimBg} scale={scale} />
            <Text allowFontScaling={false} style={[drow.dot, { fontSize: Math.round(10 * scale) }]}>·</Text>
            <Text
              allowFontScaling={false}
              style={[drow.time, { fontSize: Math.round(10 * scale) }]}
              numberOfLines={1}
            >
              {timeAgo(item.downloaded_at)}
            </Text>
            {item.isOffline && (
              <>
                <Text allowFontScaling={false} style={[drow.dot, { fontSize: Math.round(10 * scale) }]}>·</Text>
                <Ionicons name="cloud-done-outline" size={Math.round(11 * scale)} color={C.emerald} />
                <Text
                  allowFontScaling={false}
                  style={[drow.time, { fontSize: Math.round(10 * scale), color: C.emerald }]}
                  numberOfLines={1}
                >
                  Offline
                </Text>
              </>
            )}
          </View>
        </View>

        <HeartBtn liked={liked} onPress={onLike} size={Math.round(18 * scale)} />

        {menuOpen ? (
          <View style={drow.actionMenu}>
            <TouchableOpacity
              style={drow.miniBtn}
              onPress={onCacheFile}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityLabel={item.isOffline ? 'Already saved offline' : 'Save for offline'}
            >
              {caching
                ? <ActivityIndicator size="small" color={C.orange} />
                : item.isOffline
                  ? <Ionicons name="checkmark-circle" size={17} color={C.emerald} />
                  : <LockedIcon name="download-outline" size={17} color={C.textSub} locked={!isPremium} />
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={drow.miniBtn}
              onPress={onChat}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityLabel="Ask AI about this file"
            >
              <Ionicons name="sparkles" size={15} color={C.lavender} />
            </TouchableOpacity>
            <TouchableOpacity
              style={drow.miniBtn}
              onPress={onQuiz}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityLabel="Generate quiz from this file"
            >
              <Ionicons name="school-outline" size={15} color={C.sapphire} />
            </TouchableOpacity>
            <TouchableOpacity
              style={drow.miniBtn}
              onPress={onAddToFolder}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityLabel="Add to folder"
            >
              <Ionicons name="folder-open-outline" size={15} color={C.gold} />
            </TouchableOpacity>
            <TouchableOpacity
              style={drow.miniBtn}
              onPress={onRemove}
              hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityLabel="Remove download"
            >
              <Ionicons name="trash-outline" size={15} color={C.coral} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={drow.moreBtn}
            onPress={onToggleMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-vertical" size={Math.round(16 * scale)} color={C.textMute} />
          </TouchableOpacity>
        )}
      </View>
    </ScalePress>
  )
}
const drow = StyleSheet.create({
  wrap:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 12, marginBottom: 8, position: 'relative', overflow: 'hidden' },
  wrapSelected: { borderColor: C.orange + '40', backgroundColor: C.orangeDim },
  accentLine:   { position: 'absolute', left: 0, top: 10, bottom: 10, width: 2, borderRadius: 1, opacity: 0.75 },
  checkWrap:    { position: 'absolute', top: 8, left: 8, zIndex: 1 },
  iconBox:      { borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  info:         { flex: 1, minWidth: 0, overflow: 'hidden' },
  title:        { fontWeight: '600', color: C.text, marginBottom: 5, lineHeight: 18, letterSpacing: -0.1 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  dot:          { color: C.textMute },
  time:         { color: C.textMute, flexShrink: 1 },
  actionMenu:   { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  miniBtn:      { width: 26, height: 28, justifyContent: 'center', alignItems: 'center' },
  moreBtn:      { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
})

// ── Screen ────────────────────────────────────────────────────────────────────
export default function DownloadsScreen() {
  const router        = useRouter()
  const { userId }    = useProfileSync()
  const { isPremium } = usePremium()
  const insets        = useSafeAreaInsets()
  const scale         = useScale()
  const { width }     = useWindowDimensions()

  const folderHook              = useFolders(userId)
  const { bookmarks, bookmarkedIds: favIds, toggleBookmark: toggleFav } = useMaterialsActions(userId)

  const [activeTab,     setActiveTab]     = useState<TabOption>('downloads')
  const [query,         setQuery]         = useState('')
  const [activeFilter,  setFilter]        = useState('')
  const [offlineOnly,   setOffline]       = useState(false)
  const [sortBy,        setSortBy]        = useState<SortOption>('date')
  const [showPremModal, setShowPremModal] = useState(false)
  const [openMenuId,    setOpenMenuId]    = useState<string | null>(null)
  const [showSearch,    setShowSearch]    = useState(false)
  const [folderTarget,  setFolderTarget]  = useState<Download | null>(null)

  const {
    downloadsWithLocal,
    setDownloadsWithLocal,
    storageUsed,
    isOfflineFallback,
    isLoading,
    error: downloadsError,
    refreshDownloads,
  } = useDownloadsState(userId)

  const {
    bulkDelete, cacheFile, cachingId,
    enterSelectMode, exitSelectMode,
    openChat, openFile, openQuiz, removeDownload,
    selectMode, selectedIds, toggleSelect,
  } = useLibraryActions({
    userId,
    isPremium,
    downloadsWithLocal,
    setDownloadsWithLocal,
    removeMaterialFromAll: folderHook.removeMaterialFromAll,
    refreshDownloads,
    setShowPremModal,
    setOpenMenuId,
    router,
  })

  // Header height
  const navPaddingTop = insets.top + 10
  const navRowH       = 34 + 12
  const totalHeaderH  = navPaddingTop + navRowH + TAB_H

  // Reset openMenuId on tab switch (#3)
  const handleTabChange = useCallback((tab: TabOption) => {
    setActiveTab(tab)
    setOpenMenuId(null)
  }, [])

  // Search toggle — properly implemented (#1)
  const handleToggleSearch = useCallback(() => {
    setShowSearch(v => {
      if (v) setQuery('') // clear query when closing search
      return !v
    })
  }, [])

  const handleClearQuery = useCallback(() => setQuery(''), [])

  // Filtered downloads list (#2 — derived from filtered not raw slice)
  const filtered = useMemo(() => {
    let list = downloadsWithLocal
    if (offlineOnly)  list = list.filter(d => d.isOffline)
    if (activeFilter) list = list.filter(d => d.material.type === activeFilter)
    if (query.trim()) list = list.filter(d => matchesQuery(d.material.title, query))
    return list
  }, [downloadsWithLocal, offlineOnly, activeFilter, query])

  const sections     = useMemo(() => groupByDate(filtered, sortBy), [filtered, sortBy])
  const offlineCount = downloadsWithLocal.filter(d => d.isOffline).length
  // featuredItems from filtered, not raw slice (#2)
  const featuredItems = useMemo(() => filtered.slice(0, 2), [filtered])
  const favCount      = favIds.size
  const featColW = (width - BODY_H_PAD * 2 - COL_GAP) / 2

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.container}>
        <LibraryHeader
          activeTab={activeTab}
          downloadsCount={downloadsWithLocal.length}
          favCount={favCount}
          foldersCount={folderHook.folders.length}
          navPaddingTop={navPaddingTop}
          offlineOnly={offlineOnly}
          selectMode={false}
          selectedCount={0}
          showSearch={false}
          query=""
          scale={scale}
          tabs={TABS}
          onBulkDelete={bulkDelete}
          onCancelSelect={exitSelectMode}
          onChangeQuery={setQuery}
          onToggleOffline={() => setOffline(v => !v)}
          onToggleSearch={handleToggleSearch}
          onToggleTab={handleTabChange}
          onClearQuery={handleClearQuery}
          setOpenMenuId={setOpenMenuId}
        />
        <View style={{ paddingTop: totalHeaderH + 16, paddingHorizontal: BODY_H_PAD, gap: 8 }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
        </View>
      </View>
    )
  }

  // ── Error state (#20) ──────────────────────────────────────────────────
  if (downloadsError) {
    return (
      <View style={s.container}>
        <LibraryHeader
          activeTab={activeTab}
          downloadsCount={0}
          favCount={0}
          foldersCount={0}
          navPaddingTop={navPaddingTop}
          offlineOnly={offlineOnly}
          selectMode={false}
          selectedCount={0}
          showSearch={false}
          query=""
          scale={scale}
          tabs={TABS}
          onBulkDelete={bulkDelete}
          onCancelSelect={exitSelectMode}
          onChangeQuery={setQuery}
          onToggleOffline={() => setOffline(v => !v)}
          onToggleSearch={handleToggleSearch}
          onToggleTab={handleTabChange}
          onClearQuery={handleClearQuery}
          setOpenMenuId={setOpenMenuId}
        />
        <View style={s.errorWrap}>
          <View style={s.errorIconBox}>
            <Ionicons name="cloud-offline-outline" size={32} color={C.textMute} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={s.errorTitle}>
            Could not load your library
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={s.errorSub}>
            Check your connection and try again
          </Text>
          <TouchableOpacity
            style={s.retryBtn}
            onPress={refreshDownloads}
            accessibilityRole="button"
            accessibilityLabel="Retry loading library"
          >
            <Ionicons name="refresh-outline" size={15} color='#fff' />
            <Text maxFontSizeMultiplier={1.3} style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <PremiumGateModal
        visible={showPremModal}
        onClose={() => setShowPremModal(false)}
        onUpgrade={() => { setShowPremModal(false); router.push('/subscription' as any) }}
      />

      <AddToFolderSheet
        visible={!!folderTarget}
        onClose={() => setFolderTarget(null)}
        item={folderTarget}
        folders={folderHook.folders}
        onToggle={(fid, mid) => folderHook.toggleMaterial(fid, mid)}
        onCreateAndAdd={async (name, color, mid) => {
          const created = await folderHook.createFolder(name, color)
          if (created) await folderHook.toggleMaterial(created.id, mid)
        }}
      />

      <LibraryHeader
        activeTab={activeTab}
        downloadsCount={downloadsWithLocal.length}
        favCount={favCount}
        foldersCount={folderHook.folders.length}
        navPaddingTop={navPaddingTop}
        offlineOnly={offlineOnly}
        selectMode={selectMode}
        selectedCount={selectedIds.size}
        showSearch={showSearch}
        query={query}
        scale={scale}
        tabs={TABS}
        onBulkDelete={bulkDelete}
        onCancelSelect={exitSelectMode}
        onChangeQuery={setQuery}
        onToggleOffline={() => setOffline(v => !v)}
        onToggleSearch={handleToggleSearch}
        onToggleTab={handleTabChange}
        onClearQuery={handleClearQuery}
        setOpenMenuId={setOpenMenuId}
      />

      <View style={[s.tabContent, { paddingTop: totalHeaderH }]}>

        {/* Favorites tab */}
        {activeTab === 'favorites' && (
          <FavoritesTab
            DocumentRow={DocumentRow}
            SectionHead={SectionHead}
            downloads={downloadsWithLocal}
            bookmarks={bookmarks}
            favIds={favIds}
            isPremium={isPremium}
            scale={scale}
            query={query}
            openMenuId={openMenuId}
            cachingId={cachingId}
            onOpen={openFile}
            onLike={toggleFav}
            onChat={openChat}
            onRemove={removeDownload}
            onCacheFile={cacheFile}
            onQuiz={openQuiz}
            onAddToFolder={item => { setFolderTarget(item) }}
            onToggleMenu={id => setOpenMenuId(prev => prev === id ? null : id)}
          />
        )}

        {/* Folders tab */}
        {activeTab === 'folders' && (
          <FoldersTab
            folders={folderHook.folders}
            downloads={downloadsWithLocal}
            syncing={folderHook.syncing}
            query={query}
            onCreateFolder={async (n, c) => { await folderHook.createFolder(n, c) }}
            onUpdateFolder={async (id, n, c) => { await folderHook.updateFolder(id, n, c) }}
            onDeleteFolder={async id => { await folderHook.deleteFolder(id) }}
            onRemoveMaterial={(fid, mid) => folderHook.toggleMaterial(fid, mid)}
            onOpenFile={openFile}
            favIds={favIds}
            onLike={toggleFav}
            FolderFormModal={FolderFormModal}
            HeartBtn={HeartBtn}
            ScalePress={ScalePress}
            SectionHead={SectionHead}
            TagChip={TagChip}
            useScale={useScale}
          />
        )}

        {/* Downloads tab */}
        {activeTab === 'downloads' && (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.listContent}
            stickySectionHeadersEnabled={false}
            onScrollBeginDrag={() => setOpenMenuId(null)}
            // Pull-to-refresh (#10)
            onRefresh={refreshDownloads}
            refreshing={isLoading}

            ListHeaderComponent={
              <View>
                {/* Stats pills */}
                <View style={s.statsRow}>
                  <View style={s.statPill}>
                    <Ionicons name="document-outline" size={11} color={C.textMute} />
                    <Text allowFontScaling={false} style={s.statText}>
                      {downloadsWithLocal.length} file{downloadsWithLocal.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {offlineCount > 0 && (
                    <View style={[s.statPill, s.statPillEmerald]}>
                      <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
                      <Text allowFontScaling={false} style={[s.statText, { color: C.emerald }]}>
                        {offlineCount} offline
                      </Text>
                    </View>
                  )}
                  {storageUsed > 0 && (
                    <View style={s.statPill}>
                      <Ionicons name="server-outline" size={11} color={C.textMute} />
                      <Text allowFontScaling={false} style={s.statText}>
                        {formatBytes(storageUsed)}
                      </Text>
                    </View>
                  )}
                  {isOfflineFallback && (
                    <View style={[s.statPill, s.statPillGold]}>
                      <Ionicons name="cloud-offline-outline" size={11} color={C.gold} />
                      <Text allowFontScaling={false} style={[s.statText, { color: C.gold }]}>
                        Cached
                      </Text>
                    </View>
                  )}
                  {isPremium && (
                    <View style={[s.statPill, s.statPillGold]}>
                      <Ionicons name="star" size={10} color={C.gold} />
                      <Text allowFontScaling={false} style={[s.statText, { color: C.gold }]}>
                        Premium
                      </Text>
                    </View>
                  )}
                </View>

                {/* Filter + sort chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.filtersScroll}
                  contentContainerStyle={s.filtersRow}
                >
                  {FILTERS.map(f => (
                    <TouchableOpacity
                      key={f.value}
                      style={[s.chip, activeFilter === f.value && s.chipActive]}
                      onPress={() => setFilter(f.value)}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityLabel={f.label}
                      accessibilityState={{ checked: activeFilter === f.value }}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[s.chipText, activeFilter === f.value && s.chipTextActive]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <View style={s.chipDivider} />
                  {SORT_OPTIONS.map(so => (
                    <TouchableOpacity
                      key={so.value}
                      style={[s.chip, sortBy === so.value && s.chipSortActive]}
                      onPress={() => setSortBy(so.value)}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityLabel={`Sort by ${so.label}`}
                      accessibilityState={{ checked: sortBy === so.value }}
                    >
                      <Ionicons
                        name="swap-vertical-outline"
                        size={10}
                        color={sortBy === so.value ? C.orange : C.textMute}
                        style={{ marginRight: 3 }}
                      />
                      <Text
                        allowFontScaling={false}
                        style={[s.chipText, sortBy === so.value && s.chipTextSortActive]}
                      >
                        {so.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Result count */}
                {(query || activeFilter || offlineOnly) && (
                  <View style={s.resultRow}>
                    <View style={s.resultDot} />
                    <Text allowFontScaling={false} style={s.resultText}>
                      {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                      {query ? ` for "${query}"` : ''}
                    </Text>
                  </View>
                )}

                {/* Featured grid */}
                {!query && !activeFilter && !offlineOnly && featuredItems.length > 0 && (
                  <View style={s.featuredSection}>
                    <SectionHead title="Top Documents" />
                    <View style={s.featuredGrid}>
                      {featuredItems.map(item => (
                        <View key={item.id} style={{ width: featColW }}>
                          <FeaturedCard
                            item={item}
                            liked={favIds.has(item.material.id)}
                            scale={scale}
                            onPress={() => openFile(item)}
                            onLike={() => toggleFav(item.material.id)}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            }

            renderSectionHeader={({ section }) => (
              <View style={s.sectionHeader}>
                <View style={s.sectionHeaderLeft}>
                  <View style={s.sectionHeaderLine} />
                  <Text allowFontScaling={false} style={s.sectionHeaderTitle}>
                    {section.title.toUpperCase()}
                  </Text>
                </View>
                <View style={s.sectionCountPill}>
                  <Text allowFontScaling={false} style={s.sectionCount}>
                    {section.data.length}
                  </Text>
                </View>
              </View>
            )}

            renderItem={({ item }) => (
              <DocumentRow
                item={item}
                liked={favIds.has(item.material.id)}
                scale={scale}
                onOpen={() => openFile(item)}
                onLike={() => toggleFav(item.material.id)}
                onChat={() => openChat(item)}
                onRemove={() => removeDownload(item)}
                onCacheFile={() => cacheFile(item)}
                onQuiz={() => openQuiz(item)}
                onAddToFolder={() => { setOpenMenuId(null); setFolderTarget(item) }}
                caching={cachingId === item.id}
                selected={selectedIds.has(item.id)}
                onLongPress={() => enterSelectMode(item.id)}
                isPremium={isPremium}
                menuOpen={openMenuId === item.id}
                onToggleMenu={() => setOpenMenuId(prev => prev === item.id ? null : item.id)}
              />
            )}

            ListEmptyComponent={
              <View style={s.empty}>
                <View style={s.emptyIconBox}>
                  <Ionicons
                    name="download-outline"
                    size={Math.round(32 * scale)}
                    color={C.textMute}
                  />
                </View>
                <Text maxFontSizeMultiplier={1.3} style={s.emptyTitle}>
                  {/* Context-aware empty message (#9) */}
                  {offlineOnly
                    ? 'No offline files saved'
                    : downloadsWithLocal.length === 0
                      ? 'No downloads yet'
                      : 'No matches'}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={s.emptySub}>
                  {offlineOnly
                    ? 'Save files offline using the download icon on any file'
                    : downloadsWithLocal.length === 0
                      ? 'Files you download will appear here'
                      : 'Try a different search or filter'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const C_white = '#FFFFFF'

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.void },
  tabContent: { flex: 1 },

  // Error state (#20)
  errorWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  errorIconBox: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  errorTitle:   { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3, textAlign: 'center' },
  errorSub:     { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20 },
  retryBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12, marginTop: 8 },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: C_white },

  listContent:     { paddingHorizontal: BODY_H_PAD, paddingBottom: 60 },
  statsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12, marginBottom: 14 },
  statPill:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  statPillEmerald: { borderColor: C.emerald + '25', backgroundColor: C.emerDim },
  statPillGold:    { borderColor: C.gold + '25', backgroundColor: C.goldDim },
  statText:        { fontSize: 11, color: C.textMute, fontWeight: '600' },

  filtersScroll:      { marginBottom: 8 },
  filtersRow:         { flexDirection: 'row', gap: 7, alignItems: 'center', paddingBottom: 2 },
  chip:               { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 100 },
  chipActive:         { backgroundColor: C.orange, borderColor: C.orange },
  chipSortActive:     { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  chipText:           { fontSize: 11.5, fontWeight: '600', color: C.textSub },
  chipTextActive:     { color: C_white },
  chipTextSortActive: { color: C.orange },
  chipDivider:        { width: 1, height: 18, backgroundColor: C.border, marginHorizontal: 2 },

  resultRow:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  resultDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: C.orange, opacity: 0.7 },
  resultText: { fontSize: 11.5, color: C.textMute, fontWeight: '500' },

  featuredSection: { marginTop: 22, marginBottom: 8 },
  featuredGrid:    { flexDirection: 'row', gap: COL_GAP },

  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 10 },
  sectionHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionHeaderLine:  { width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionHeaderTitle: { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8, textTransform: 'uppercase' },
  sectionCountPill:   { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCount:       { fontSize: 10, fontWeight: '700', color: C.orange },

  empty:        { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIconBox: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  emptySub:     { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
})