/**
 * src/features/library/utils/libraryConstants.ts
 *
 * Single source of truth for design tokens, type metadata, and pure helpers
 * shared across LibraryScreen, FavoritesTab, FoldersTab, LibraryHeader,
 * and LibraryModals.
 *
 * Previously each file defined its own C palette, TYPE_META, matchesQuery,
 * BODY_H_PAD etc. — causing drift and duplication (fix #34, #35, #36, #39).
 */

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  void:      '#07080C',
  deep:      '#0B0D13',
  surface:   '#10131C',
  raised:    '#161B27',
  border:    'rgba(255,255,255,0.055)',
  borderHi:  'rgba(255,255,255,0.10)',
  text:      '#EEF0F8',
  textSub:   '#6E7A96',
  textMute:  '#353D52',
  orange:    '#E8692A',
  orangeDim: 'rgba(232,105,42,0.10)',
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
} as const

// ── Layout constants ──────────────────────────────────────────────────────────
export const BODY_H_PAD = 22
export const COL_GAP    = 10
export const TAB_H      = 44

// ── Folder colour palette ─────────────────────────────────────────────────────
export const FOLDER_COLORS = [
  C.orange,
  C.sapphire,
  C.emerald,
  C.lavender,
  C.coral,
  C.gold,
  C.sky,
]

// ── Type metadata ─────────────────────────────────────────────────────────────
import type { Ionicons } from '@expo/vector-icons'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

export type TypeMeta = {
  label:  string
  short:  string
  color:  string
  icon:   IoniconsName
  dimBg:  string
}

export const TYPE_META: Record<string, TypeMeta> = {
  past_question: { label: 'Past Question', short: 'Past Q',   color: C.sapphire, icon: 'document-text-outline', dimBg: C.sapphDim  },
  slide:         { label: 'Slide',         short: 'Slide',    color: C.lavender, icon: 'easel-outline',          dimBg: C.lavDim    },
  book:          { label: 'Book',          short: 'Book',     color: C.emerald,  icon: 'book-outline',           dimBg: C.emerDim   },
  tutorial:      { label: 'Tutorial',      short: 'Tutorial', color: C.orange,   icon: 'play-circle-outline',    dimBg: C.orangeDim },
}

export const TYPE_FALLBACK: TypeMeta = {
  label: 'File', short: 'File',
  color: C.sky,  icon: 'document-outline',
  dimBg: C.skyDim,
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
export function matchesQuery(title: string, q: string): boolean {
  return title.toLowerCase().includes(q.toLowerCase().trim())
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024)          return `${bytes} B`
  if (bytes < 1_024 * 1_024)  return `${(bytes / 1_024).toFixed(1)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}