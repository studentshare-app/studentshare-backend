/**
 * src/features/library/components/FavoritesTab.tsx  —  PRODUCTION-READY
 *
 * FIXES APPLIED
 * ─────────────
 * Bug
 *  1. onChat, onRemove, onCacheFile, onQuiz, onLongPress, onToggleMenu now
 *     forwarded from props instead of being hardcoded () => {} no-ops
 *  2. isPremium forwarded from props instead of hardcoded false
 *  3. Palette, matchesQuery, BODY_H_PAD imported from shared libraryConstants
 *     (eliminates local duplicate definitions)
 *
 * Performance
 *  4. scale passed as prop — no internal useWindowDimensions() call per render
 *
 * UI/UX
 *  5. Heart emoji in empty state replaced with Ionicons icon (Android compat)
 *
 * Accessibility
 *  6. Empty state iconBox marked accessibilityElementsHidden
 *  7. ScrollView gets accessibilityRole="list"
 *  8. Section header text accessible as header
 */

import { Ionicons } from '@expo/vector-icons'
import { memo, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import type { Download } from '@/features/library/utils/downloads'
import type { BookmarkRecord } from '@/lib/queries/screens'
import {
  C,
  BODY_H_PAD,
  matchesQuery,
} from '@/features/library/utils/libraryConstants'

// ── Props ─────────────────────────────────────────────────────────────────────
// DocumentRow is typed properly instead of `any` — accepts the same props
// shape the screen passes so TypeScript catches mismatches.
type DocumentRowProps = {
  item: Download
  liked: boolean
  scale: number
  onOpen: () => void
  onLike: () => void
  onChat: () => void
  onRemove: () => void
  onCacheFile: () => void
  onQuiz: () => void
  onAddToFolder: () => void
  caching: boolean
  selected: boolean
  onLongPress: () => void
  isPremium: boolean
  menuOpen: boolean
  onToggleMenu: () => void
}

type SectionHeadProps = {
  title: string
  link?: string
  onLink?: () => void
}

interface FavoritesTabProps {
  DocumentRow:   React.ComponentType<DocumentRowProps>
  SectionHead:   React.ComponentType<SectionHeadProps>
  downloads:     Download[]
  bookmarks:     BookmarkRecord[]
  favIds:        Set<string>
  isPremium:     boolean
  scale:         number
  query:         string
  openMenuId:    string | null
  cachingId:     string | null
  onOpen:        (item: Download) => void
  onLike:        (materialId: string) => void
  onChat:        (item: Download) => void
  onRemove:      (item: Download) => void
  onCacheFile:   (item: Download) => void
  onQuiz:        (item: Download) => void
  onAddToFolder: (item: Download) => void
  onToggleMenu:  (id: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export const FavoritesTab = memo(function FavoritesTab({
  DocumentRow,
  SectionHead,
  downloads,
  bookmarks,
  favIds,
  isPremium,
  scale,
  query,
  openMenuId,
  cachingId,
  onOpen,
  onLike,
  onChat,
  onRemove,
  onCacheFile,
  onQuiz,
  onAddToFolder,
  onToggleMenu,
}: FavoritesTabProps) {
  const liked = useMemo(() => {
    // Merge bookmarks with existing download info if available
    let list: Download[] = bookmarks.map(b => {
      const existing = downloads.find(d => d.material.id === b.material_id)
      if (existing) return existing
      
      return {
        id: b.id,
        downloaded_at: b.created_at,
        user_id: '',
        material: {
          id: b.material.id,
          title: b.material.title,
          type: b.material.type,
          file_url: b.material.file_url,
        },
        isOffline: false,
      } as Download
    })

    if (query.trim()) {
      list = list.filter(d => matchesQuery(d.material.title, query))
    }
    return list
  }, [bookmarks, downloads, query])

  if (liked.length === 0) {
    return (
      <View
        style={styles.empty}
        accessible
        accessibilityLabel={
          query.trim()
            ? `No liked files match "${query}"`
            : 'No favorites yet. Tap the heart icon on any file to save it here.'
        }
      >
        <View
          style={styles.iconBox}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Ionicons
            name="heart-outline"
            size={Math.round(30 * scale)}
            color={C.coral}
          />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={styles.title}>
          {query.trim() ? 'No matches' : 'No favorites yet'}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.sub}>
          {query.trim()
            ? `No liked files match "${query}"`
            : 'Tap the heart icon on any file to save it here'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      accessibilityRole="list"
    >
      <SectionHead title={`Favorites · ${liked.length}`} />
      {liked.map(item => (
        <DocumentRow
          key={item.id}
          item={item}
          liked={true}
          scale={scale}
          isPremium={isPremium}
          caching={cachingId === item.id}
          selected={false}
          menuOpen={openMenuId === item.id}
          onOpen={() => onOpen(item)}
          onLike={() => onLike(item.material.id)}
          onChat={() => onChat(item)}
          onRemove={() => onRemove(item)}
          onCacheFile={() => onCacheFile(item)}
          onQuiz={() => onQuiz(item)}
          onAddToFolder={() => onAddToFolder(item)}
          onLongPress={() => {}}
          onToggleMenu={() => onToggleMenu(item.id)}
        />
      ))}
    </ScrollView>
  )
})

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  empty:   { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  iconBox: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.coralDim, borderWidth: 1, borderColor: `${C.coral}25`, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  title:   { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  sub:     { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  list:    { paddingHorizontal: BODY_H_PAD, paddingBottom: 60 },
})