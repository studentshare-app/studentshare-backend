/**
 * app/(tabs)/downloads.tsx  — Dark Editorial Redesign
 *
 * Changes in this version
 * ───────────────────────
 * 1. FAVORITES — heart icon on every material card. Tap to like/unlike.
 *    Liked materials appear in the Favorites tab (AsyncStorage-persisted,
 *    no extra DB table needed — just a Set of material IDs).
 *
 * 2. RESPONSIVE CARDS — all card dimensions, icon sizes, font sizes and
 *    padding scale with useWindowDimensions() so the layout looks right
 *    on small phones (≤375 pt), standard phones, and tablets.
 *
 * 3. FOLDERS TAB SCROLL — content now starts below the fixed header
 *    (paddingTop = totalHeaderH) so the section title is never hidden.
 *
 * 4. GLOBAL SEARCH — the search bar in the nav works across ALL three
 *    tabs. Favorites and Folders tab both filter their lists in real-time
 *    as the user types. The offline-only toggle also cross-filters when
 *    on the Downloads tab.
 *
 * Supabase table (same as before — unchanged):
 *   create table download_folders (
 *     id           uuid primary key default gen_random_uuid(),
 *     user_id      uuid references auth.users not null,
 *     name         text not null, color text not null,
 *     created_at   timestamptz default now(),
 *     updated_at   timestamptz default now(),
 *     material_ids text[] default '{}'
 *   );
 *   alter table download_folders enable row level security;
 *   create policy "own folders" on download_folders
 *     using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useRouter } from 'expo-router'
import * as FileSystem from 'expo-file-system/legacy'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import {
  ActivityIndicator, Alert, Animated, Modal, Pressable,
  SectionList, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, useWindowDimensions,
} from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useProfileSync } from '../../hooks/useProfileSync'
import { fetchDownloads, type DownloadRecord } from '../../lib/queries/screens'
import { registryAdd, registryRemove, registrySetAll } from '../../lib/useDownloadRegistry'
import { usePremium } from '../../contexts/PremiumContext'

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
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

const BODY_H_PAD = 22
const COL_GAP    = 10
const TAB_H      = 44

// ─────────────────────────────────────────────────────────────────────────────
// Responsive scale helper
// ─────────────────────────────────────────────────────────────────────────────
/** Returns a scale factor relative to 390pt baseline (iPhone 14 width). */
function useScale() {
  const { width } = useWindowDimensions()
  // clamp between 0.78 (small phones) and 1.20 (tablets)
  return Math.min(1.20, Math.max(0.78, width / 390))
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Download   = DownloadRecord & { localPath?: string; isOffline?: boolean }
type DLSection  = { title: string; data: Download[] }
type SortOption = 'date' | 'title' | 'type'
type TabOption  = 'downloads' | 'favorites' | 'folders'

type Folder = {
  id:           string
  user_id?:     string
  name:         string
  color:        string
  created_at:   string
  updated_at?:  string
  material_ids: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TABS: { label: string; value: TabOption }[] = [
  { label: 'Downloads', value: 'downloads' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Folders',   value: 'folders'   },
]
const FOLDER_COLORS = [C.orange, C.sapphire, C.emerald, C.lavender, C.coral, C.gold, C.sky]

const TYPE_META: Record<string, { label: string; color: string; icon: string; short: string; dimBg: string }> = {
  past_question: { label: 'Past Question', short: 'Past Q',   color: C.sapphire, icon: 'document-text', dimBg: C.sapphDim },
  slide:         { label: 'Slide',         short: 'Slide',    color: C.lavender, icon: 'easel',          dimBg: C.lavDim   },
  book:          { label: 'Book',          short: 'Book',     color: C.emerald,  icon: 'book',           dimBg: C.emerDim  },
  tutorial:      { label: 'Tutorial',      short: 'Tutorial', color: C.orange,   icon: 'play-circle',    dimBg: C.orangeDim},
}
const TYPE_FALLBACK = { label: 'File', short: 'File', color: C.sky, icon: 'document', dimBg: C.skyDim }

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

const DOWNLOAD_DIR        = FileSystem.documentDirectory + 'downloads/'
const EMPTY_DOWNLOADS: DownloadRecord[] = []
const DOWNLOADS_CACHE_KEY = (uid: string) => `downloads_cache_${uid}`
const FOLDERS_CACHE_KEY   = (uid: string) => `folders_cache_${uid}`
const FOLDERS_LEGACY_KEY  = 'studentshare_download_folders'
const FAVORITES_KEY       = (uid: string) => `favorites_material_ids_${uid}`

// ─────────────────────────────────────────────────────────────────────────────
// useFavorites — lightweight local Set of liked material IDs
// ─────────────────────────────────────────────────────────────────────────────
function useFavorites(userId: string | null) {
  const [favIds, setFavIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    AsyncStorage.getItem(FAVORITES_KEY(userId))
      .then(raw => { if (raw) setFavIds(new Set(JSON.parse(raw))) })
      .catch(() => {})
  }, [userId])

  const toggle = useCallback(async (materialId: string) => {
    if (!userId) return
    setFavIds(prev => {
      const next = new Set(prev)
      next.has(materialId) ? next.delete(materialId) : next.add(materialId)
      AsyncStorage.setItem(FAVORITES_KEY(userId), JSON.stringify([...next])).catch(() => {})
      return next
    })
  }, [userId])

  return { favIds, toggle }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE SETUP — run ALL of this in your Supabase SQL Editor once.
// If folders are not syncing, 99% chance one of these is missing.
// ─────────────────────────────────────────────────────────────────────────────
//
//  -- 1. Create table (skip if already exists)
//  create table if not exists download_folders (
//    id           uuid primary key default gen_random_uuid(),
//    user_id      uuid references auth.users not null,
//    name         text not null,
//    color        text not null,
//    created_at   timestamptz default now(),
//    updated_at   timestamptz default now(),
//    material_ids text[] default '{}'
//  );
//
//  -- 2. Enable RLS
//  alter table download_folders enable row level security;
//
//  -- 3. Drop old policies (in case they exist from a previous attempt)
//  drop policy if exists "own folders"          on download_folders;
//  drop policy if exists "own folders select"   on download_folders;
//  drop policy if exists "own folders insert"   on download_folders;
//  drop policy if exists "own folders update"   on download_folders;
//  drop policy if exists "own folders delete"   on download_folders;
//
//  -- 4. Create separate policies for each operation (a single combined
//        policy often fails for INSERT because NEW row doesn't exist yet
//        for the USING check — split policies fix this)
//  create policy "own folders select" on download_folders
//    for select using (auth.uid() = user_id);
//
//  create policy "own folders insert" on download_folders
//    for insert with check (auth.uid() = user_id);
//
//  create policy "own folders update" on download_folders
//    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
//
//  create policy "own folders delete" on download_folders
//    for delete using (auth.uid() = user_id);
//
//  -- 5. Add table to the realtime publication (REQUIRED for postgres_changes)
//  alter publication supabase_realtime add table download_folders;
//
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers — defined OUTSIDE the hook so they are stable references
// and never cause stale-closure issues in Realtime callbacks or useCallback.
// ─────────────────────────────────────────────────────────────────────────────
async function _dbFetchFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('download_folders')
    .select('id,user_id,name,color,created_at,updated_at,material_ids')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[Folders] fetch error:', JSON.stringify(error))
    throw error
  }
  return (data ?? []) as Folder[]
}

async function _dbInsertFolder(userId: string, name: string, color: string): Promise<Folder> {
  const { data, error } = await supabase
    .from('download_folders')
    .insert({ user_id: userId, name, color, material_ids: [] })
    .select()
    .single()
  if (error) {
    console.error('[Folders] insert error:', JSON.stringify(error))
    throw error
  }
  return data as Folder
}

async function _dbUpdateFolder(
  id: string,
  fields: Partial<Pick<Folder, 'name' | 'color' | 'material_ids'>>,
): Promise<void> {
  const { error } = await supabase
    .from('download_folders')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('[Folders] update error:', JSON.stringify(error))
    throw error
  }
}

async function _dbDeleteFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('download_folders')
    .delete()
    .eq('id', id)
  if (error) {
    console.error('[Folders] delete error:', JSON.stringify(error))
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useFolders — offline-first Supabase sync
// ─────────────────────────────────────────────────────────────────────────────
function useFolders(userId: string | null) {
  const [folders,  setFolders]  = useState<Folder[]>([])
  const [syncing,  setSyncing]  = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  // Keep a ref to the latest userId so the Realtime callback always reads
  // the current value even after re-renders.
  const userIdRef  = useRef(userId)
  const cancelRef  = useRef(false)
  useEffect(() => { userIdRef.current = userId }, [userId])

  // ── Persist cache ──────────────────────────────────────────────────────
  const persist = useCallback(async (uid: string, list: Folder[]) => {
    try { await AsyncStorage.setItem(FOLDERS_CACHE_KEY(uid), JSON.stringify(list)) } catch {}
  }, [])

  // ── Fetch from Supabase and update state + cache ───────────────────────
  const fetchAndApply = useCallback(async (uid: string) => {
    const fresh = await _dbFetchFolders(uid)
    setFolders(fresh)
    setIsOnline(true)
    await persist(uid, fresh)
    return fresh
  }, [persist])

  // ── Bootstrap on mount / userId change ────────────────────────────────
  useEffect(() => {
    if (!userId) return
    cancelRef.current = false

    const init = async () => {
      // 1. Show cache immediately (offline-first, zero flicker)
      try {
        const raw = await AsyncStorage.getItem(FOLDERS_CACHE_KEY(userId))
        if (raw && !cancelRef.current) setFolders(JSON.parse(raw))
      } catch {}

      // 2. Migrate any legacy local-only folders (one-time)
      try {
        const lr = await AsyncStorage.getItem(FOLDERS_LEGACY_KEY)
        if (lr) {
          const legacy: Folder[] = JSON.parse(lr)
          await AsyncStorage.removeItem(FOLDERS_LEGACY_KEY)
          for (const lf of legacy) {
            try { await _dbInsertFolder(userId, lf.name, lf.color) } catch {}
          }
        }
      } catch {}

      // 3. Fetch fresh data from Supabase
      setSyncing(true)
      try {
        if (!cancelRef.current) {
          const fresh = await fetchAndApply(userId)
          console.log('[Folders] synced', fresh.length, 'folders for user', userId)
        }
      } catch (e) {
        console.error('[Folders] initial fetch failed:', e)
        if (!cancelRef.current) setIsOnline(false)
      } finally {
        if (!cancelRef.current) setSyncing(false)
      }
    }

    init()
    return () => { cancelRef.current = true }
  }, [userId, fetchAndApply])

  // ── Realtime subscription ─────────────────────────────────────────────
  // Uses userIdRef so the callback always has the current userId even if
  // the component re-renders.
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`folders-rt-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'download_folders',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          const uid = userIdRef.current
          if (!uid) return
          try { await fetchAndApply(uid) } catch {}
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsOnline(true)
      })

    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchAndApply])

  // ── Mutations ─────────────────────────────────────────────────────────

  const createFolder = useCallback(async (name: string, color: string): Promise<Folder | null> => {
    if (!userId) return null
    const optimistic: Folder = {
      id:           `__pending_${Date.now()}`,
      user_id:      userId,
      name,
      color,
      created_at:   new Date().toISOString(),
      material_ids: [],
    }
    setFolders(prev => [...prev, optimistic])
    try {
      const saved = await _dbInsertFolder(userId, name, color)
      console.log('[Folders] created:', saved.id, saved.name)
      setFolders(prev => {
        const without = prev.filter(f => f.id !== optimistic.id)
        return [...without, saved].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      })
      const latest = await _dbFetchFolders(userId)
      await persist(userId, latest)
      setIsOnline(true)
      return saved
    } catch (e: any) {
      // Surface the exact error so you can diagnose RLS / table issues
      const msg = e?.message ?? JSON.stringify(e)
      console.error('[Folders] createFolder failed:', msg)
      Alert.alert(
        'Folder sync failed',
        `Could not save folder to Supabase.\n\nError: ${msg}\n\nCheck that the download_folders table exists and RLS policies are set up correctly (see code comments at top of useFolders).`,
      )
      setFolders(prev => prev.filter(f => f.id !== optimistic.id))
      setIsOnline(false)
      return null
    }
  }, [userId, persist])

  const updateFolder = useCallback(async (id: string, name: string, color: string) => {
    if (!userId) return
    // Optimistic
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name, color } : f))
    try {
      await _dbUpdateFolder(id, { name, color })
      setIsOnline(true)
    } catch (e) {
      console.warn('[useFolders] updateFolder failed:', e)
      setIsOnline(false)
      // Re-fetch to restore truth
      try { await fetchAndApply(userId) } catch {}
    }
  }, [userId, fetchAndApply])

  const deleteFolder = useCallback(async (id: string) => {
    if (!userId) return
    // Optimistic
    setFolders(prev => prev.filter(f => f.id !== id))
    try {
      await _dbDeleteFolder(id)
      const latest = await _dbFetchFolders(userId)
      await persist(userId, latest)
      setIsOnline(true)
    } catch (e) {
      console.warn('[useFolders] deleteFolder failed:', e)
      setIsOnline(false)
      try { await fetchAndApply(userId) } catch {}
    }
  }, [userId, persist, fetchAndApply])

  const toggleMaterial = useCallback(async (folderId: string, materialId: string) => {
    if (!userId) return
    let newMids: string[] = []
    // Optimistic
    setFolders(prev => prev.map(f => {
      if (f.id !== folderId) return f
      const has = f.material_ids.includes(materialId)
      newMids = has
        ? f.material_ids.filter(id => id !== materialId)
        : [...f.material_ids, materialId]
      return { ...f, material_ids: newMids }
    }))
    try {
      await _dbUpdateFolder(folderId, { material_ids: newMids })
      setIsOnline(true)
    } catch (e) {
      console.warn('[useFolders] toggleMaterial failed:', e)
      setIsOnline(false)
      try { await fetchAndApply(userId) } catch {}
    }
  }, [userId, fetchAndApply])

  const removeMaterialFromAll = useCallback(async (materialId: string) => {
    if (!userId) return
    // Collect affected folder ids before optimistic update
    const affected: string[] = []
    setFolders(prev => prev.map(f => {
      if (!f.material_ids.includes(materialId)) return f
      affected.push(f.id)
      return { ...f, material_ids: f.material_ids.filter(id => id !== materialId) }
    }))
    // Persist each affected folder
    for (const fid of affected) {
      // Read current mids from latest state via a fresh fetch to be safe
      try {
        const current = await _dbFetchFolders(userId)
        const target  = current.find(f => f.id === fid)
        if (target) {
          await _dbUpdateFolder(fid, {
            material_ids: target.material_ids.filter(id => id !== materialId),
          })
        }
      } catch (e) {
        console.warn('[useFolders] removeMaterialFromAll failed for', fid, e)
      }
    }
  }, [userId])

  return {
    folders,
    syncing,
    isOnline,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleMaterial,
    removeMaterialFromAll,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeLocalPath(materialId: string, fileUrl: string) {
  const ext = fileUrl.split('.').pop()?.split('?')[0] || 'pdf'
  return DOWNLOAD_DIR + materialId + '.' + ext
}
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR)
  if (!info.exists) await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true })
}
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function groupByDate(downloads: Download[], sort: SortOption): DLSection[] {
  const DAY = 86400000
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const groups: Record<string, Download[]> = {
    Today: [], Yesterday: [], 'This Week': [], 'This Month': [], Older: [],
  }
  downloads.forEach(d => {
    const t = new Date(d.downloaded_at).setHours(0, 0, 0, 0)
    if      (t >= todayStart.getTime())               groups['Today'].push(d)
    else if (t >= todayStart.getTime() - DAY)         groups['Yesterday'].push(d)
    else if (t >= todayStart.getTime() - 7  * DAY)   groups['This Week'].push(d)
    else if (t >= todayStart.getTime() - 30 * DAY)   groups['This Month'].push(d)
    else                                              groups['Older'].push(d)
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
async function calcStorageUsed(downloads: Download[]): Promise<number> {
  let total = 0
  for (const d of downloads) {
    if (d.isOffline && d.localPath) {
      const info = await FileSystem.getInfoAsync(d.localPath)
      if (info.exists && 'size' in info) total += (info as any).size ?? 0
    }
  }
  return total
}
function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function matchesQuery(title: string, q: string) {
  return title.toLowerCase().includes(q.toLowerCase().trim())
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────────────────────────────────────
function ScalePress({ children, onPress, onLongPress }: {
  children: ReactNode; onPress?: () => void; onLongPress?: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  )
}

function TagChip({ label, color, bg, scale = 1 }: { label: string; color: string; bg: string; scale?: number }) {
  return (
    <View style={[mc.tagChip, { backgroundColor: bg, borderColor: color + '30', paddingHorizontal: Math.round(8 * scale), paddingVertical: Math.round(3 * scale) }]}>
      <Text allowFontScaling={false} style={[mc.tagChipText, { color, fontSize: Math.round(10 * scale) }]}>{label}</Text>
    </View>
  )
}

function SectionHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return (
    <View style={mc.sectionHead}>
      <View style={mc.labelRow}>
        <View style={mc.orangeLine} />
        <Text maxFontSizeMultiplier={1.3} style={mc.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {onLink && (
        <TouchableOpacity onPress={onLink} activeOpacity={0.7}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Heart button — animated like toggle
// ─────────────────────────────────────────────────────────────────────────────
function HeartBtn({ liked, onPress, size = 18 }: { liked: boolean; onPress: () => void; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 8 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 50, bounciness: 4 }),
    ]).start()
    onPress()
  }
  return (
    <TouchableOpacity onPress={handlePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={size}
          color={liked ? C.coral : C.textMute}
        />
      </Animated.View>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.3)).current
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ])).start()
  }, [])
  return (
    <Animated.View style={[sk.row, { opacity }]}>
      <View style={sk.icon} />
      <View style={{ flex: 1, gap: 9 }}>
        <View style={{ height: 13, width: '60%', backgroundColor: C.raised, borderRadius: 6 }} />
        <View style={{ height: 10, width: '35%', backgroundColor: C.surface, borderRadius: 6 }} />
      </View>
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.surface }} />
    </Animated.View>
  )
}
const sk = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: C.surface, borderRadius: 18, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.raised },
})

// ─────────────────────────────────────────────────────────────────────────────
// Locked icon
// ─────────────────────────────────────────────────────────────────────────────
function LockedIcon({ name, size, color, locked }: { name: string; size: number; color: string; locked: boolean }) {
  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={name as any} size={size} color={color} />
      {locked && <View style={li.badge}><Ionicons name="lock-closed" size={7} color="#fff" /></View>}
    </View>
  )
}
const li = StyleSheet.create({
  badge: { position: 'absolute', bottom: -3, right: -4, width: 13, height: 13, borderRadius: 7, backgroundColor: C.gold, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: C.void },
})

// ─────────────────────────────────────────────────────────────────────────────
// Premium Gate Modal
// ─────────────────────────────────────────────────────────────────────────────
function PremiumGateModal({ visible, onClose, onUpgrade }: {
  visible: boolean; onClose: () => void; onUpgrade: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen">
      <View style={pg.overlay}>
        <View style={pg.sheet}>
          <View style={pg.handleRow}><View style={pg.handle} /></View>
          <View style={pg.iconBox}>
            <LinearGradient colors={[C.gold, C.orange]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="star" size={30} color="#fff" />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={pg.title}>Premium Required</Text>
          <Text maxFontSizeMultiplier={1.3} style={pg.sub}>
            Offline downloads are a{'\n'}
            <Text style={{ color: C.gold, fontWeight: '700' }}>Premium-only</Text> feature.{'\n\n'}
            Upgrade to save files to your device and{'\n'}access them without internet.
          </Text>
          <TouchableOpacity style={pg.upgradeBtn} onPress={onUpgrade} activeOpacity={0.85}>
            <LinearGradient colors={[C.orange, '#F07840']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
            <Ionicons name="star" size={15} color="#fff" />
            <Text maxFontSizeMultiplier={1.3} style={pg.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
          <TouchableOpacity style={pg.cancelBtn} onPress={onClose}>
            <Text maxFontSizeMultiplier={1.3} style={pg.cancelBtnText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
const pg = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 44, alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: C.border },
  handleRow:      { alignItems: 'center', marginBottom: 16, width: '100%' },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  iconBox:        { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8, overflow: 'hidden' },
  title:          { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  sub:            { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 23 },
  upgradeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 28, marginTop: 12, width: '100%', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:      { paddingVertical: 12 },
  cancelBtnText:  { fontSize: 14, color: C.textMute, fontWeight: '600' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Folder Form Modal
// ─────────────────────────────────────────────────────────────────────────────
function FolderFormModal({ visible, onClose, initial, onSave, saving }: {
  visible: boolean; onClose: () => void
  initial?: { name: string; color: string }
  onSave: (name: string, color: string) => Promise<void>
  saving: boolean
}) {
  const [name,  setName]  = useState(initial?.name  ?? '')
  const [color, setColor] = useState(initial?.color ?? FOLDER_COLORS[0])
  useEffect(() => { if (visible) { setName(initial?.name ?? ''); setColor(initial?.color ?? FOLDER_COLORS[0]) } }, [visible])

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <Pressable style={ff.overlay} onPress={onClose}>
        <Pressable style={ff.sheet} onPress={e => e.stopPropagation()}>
          <View style={ff.handleRow}><View style={ff.handle} /></View>
          <Text maxFontSizeMultiplier={1.3} style={ff.title}>{initial ? 'Rename Folder' : 'New Folder'}</Text>
          <Text maxFontSizeMultiplier={1.3} style={ff.label}>Folder Name</Text>
          <TextInput style={ff.input} value={name} onChangeText={setName} placeholder="e.g. Finals Week" placeholderTextColor={C.textMute} autoFocus maxLength={40} />
          <Text maxFontSizeMultiplier={1.3} style={ff.label}>Colour</Text>
          <View style={ff.colorRow}>
            {FOLDER_COLORS.map(col => (
              <TouchableOpacity key={col} style={[ff.colorDot, { backgroundColor: col }, color === col && ff.colorDotActive]} onPress={() => setColor(col)}>
                {color === col && <Ionicons name="checkmark" size={12} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[ff.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
            onPress={async () => { if (name.trim() && !saving) { await onSave(name.trim(), color); onClose() } }}
            disabled={!name.trim() || saving}
          >
            <LinearGradient colors={[C.orange, '#F07840']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Ionicons name="folder-open" size={16} color="#fff" /><Text maxFontSizeMultiplier={1.3} style={ff.saveBtnText}>{initial ? 'Save Changes' : 'Create Folder'}</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={ff.cancelBtn} onPress={onClose}>
            <Text maxFontSizeMultiplier={1.3} style={ff.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
const ff = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.80)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, gap: 12, borderTopWidth: 1, borderTopColor: C.border },
  handleRow:     { alignItems: 'center', marginBottom: 4 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  title:         { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3, marginBottom: 4 },
  label:         { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.8 },
  input:         { backgroundColor: C.raised, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border },
  colorRow:      { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot:      { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  colorDotActive:{ borderWidth: 2.5, borderColor: '#fff' },
  saveBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15, marginTop: 8, overflow: 'hidden', position: 'relative', minHeight: 52 },
  saveBtnText:   { fontSize: 15, fontWeight: '800', color: '#fff' },
  cancelBtn:     { alignItems: 'center', paddingVertical: 12 },
  cancelText:    { fontSize: 14, color: C.textMute, fontWeight: '600' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Add-to-Folder Sheet
// ─────────────────────────────────────────────────────────────────────────────
function AddToFolderSheet({ visible, onClose, item, folders, onToggle, onCreateAndAdd }: {
  visible: boolean; onClose: () => void; item: Download | null
  folders: Folder[]; onToggle: (fid: string, mid: string) => void
  onCreateAndAdd: (name: string, color: string, mid: string) => Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0])
  const [saving,   setSaving]   = useState(false)
  useEffect(() => { if (!visible) { setCreating(false); setNewName(''); setNewColor(FOLDER_COLORS[0]) } }, [visible])
  if (!item) return null
  const mid = item.material.id
  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <Pressable style={af.overlay} onPress={onClose}>
        <Pressable style={af.sheet} onPress={e => e.stopPropagation()}>
          <View style={af.handleRow}><View style={af.handle} /></View>
          <View style={af.header}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={af.title}>Add to Folder</Text>
              <Text maxFontSizeMultiplier={1.3} style={af.sub} numberOfLines={1}>{item.material.title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={af.closeBtn}><Ionicons name="close" size={17} color={C.textSub} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <View style={af.syncNote}>
              <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
              <Text allowFontScaling={false} style={af.syncNoteText}>Folders sync across all your devices</Text>
            </View>
            {folders.length > 0 && (
              <View style={af.folderList}>
                {folders.map(folder => {
                  const isIn = folder.material_ids.includes(mid)
                  return (
                    <TouchableOpacity key={folder.id}
                      style={[af.folderRow, isIn && { borderColor: folder.color + '50', backgroundColor: folder.color + '0D' }]}
                      onPress={() => onToggle(folder.id, mid)} activeOpacity={0.8}>
                      <View style={[af.folderIcon, { backgroundColor: folder.color + '18' }]}>
                        <Ionicons name="folder" size={20} color={folder.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={1.3} style={af.folderName}>{folder.name}</Text>
                        <Text allowFontScaling={false} style={af.folderCount}>{folder.material_ids.length} file{folder.material_ids.length !== 1 ? 's' : ''}</Text>
                      </View>
                      <View style={[af.checkbox, isIn && { backgroundColor: folder.color, borderColor: folder.color }]}>
                        {isIn && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
            {creating ? (
              <View style={af.createBox}>
                <Text maxFontSizeMultiplier={1.3} style={af.createLabel}>Folder Name</Text>
                <TextInput style={af.createInput} value={newName} onChangeText={setNewName} placeholder="e.g. Finals Week" placeholderTextColor={C.textMute} autoFocus maxLength={40} />
                <Text maxFontSizeMultiplier={1.3} style={af.createLabel}>Colour</Text>
                <View style={af.colorRow}>
                  {FOLDER_COLORS.map(col => (
                    <TouchableOpacity key={col} style={[af.colorDot, { backgroundColor: col }, newColor === col && af.colorDotActive]} onPress={() => setNewColor(col)}>
                      {newColor === col && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={af.createBtns}>
                  <TouchableOpacity style={af.createCancelBtn} onPress={() => setCreating(false)}>
                    <Text maxFontSizeMultiplier={1.3} style={af.createCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[af.createConfirmBtn, (!newName.trim() || saving) && { opacity: 0.4 }]}
                    disabled={!newName.trim() || saving}
                    onPress={async () => {
                      if (!newName.trim() || saving) return
                      setSaving(true)
                      await onCreateAndAdd(newName.trim(), newColor, mid)
                      setSaving(false); setCreating(false); setNewName('')
                    }}>
                    {saving ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="folder-open" size={14} color="#fff" /><Text maxFontSizeMultiplier={1.3} style={af.createConfirmText}>Create & Add</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={af.newFolderBtn} onPress={() => setCreating(true)} activeOpacity={0.8}>
                <View style={af.newFolderIconBox}><Ionicons name="add" size={18} color={C.orange} /></View>
                <Text maxFontSizeMultiplier={1.3} style={af.newFolderText}>New Folder</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
const af = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40, maxHeight: '80%', borderTopWidth: 1, borderTopColor: C.border },
  handleRow:        { alignItems: 'center', paddingVertical: 14 },
  handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title:            { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  sub:              { fontSize: 12, color: C.textMute, marginTop: 3, maxWidth: 260 },
  closeBtn:         { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  syncNote:         { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  syncNoteText:     { fontSize: 11, color: C.emerald, fontWeight: '600' },
  folderList:       { gap: 8, marginBottom: 14 },
  folderRow:        { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 },
  folderIcon:       { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  folderName:       { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  folderCount:      { fontSize: 11, color: C.textMute },
  checkbox:         { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  newFolderBtn:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  newFolderIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  newFolderText:    { fontSize: 14, fontWeight: '700', color: C.orange },
  createBox:        { backgroundColor: C.raised, borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: C.border },
  createLabel:      { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.8 },
  createInput:      { backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border },
  colorRow:         { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot:         { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  colorDotActive:   { borderWidth: 2.5, borderColor: '#fff' },
  createBtns:       { flexDirection: 'row', gap: 10, marginTop: 4 },
  createCancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  createCancelText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  createConfirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 12, backgroundColor: C.orange, minHeight: 44 },
  createConfirmText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Featured card — responsive
// ─────────────────────────────────────────────────────────────────────────────
function FeaturedCard({ item, liked, onPress, onLike }: {
  item: Download; liked: boolean; onPress: () => void; onLike: () => void
}) {
  const scale = useScale()
  const meta  = TYPE_META[item.material.type] ?? TYPE_FALLBACK
  const iconSz    = Math.round(20 * scale)
  const iconBox   = Math.round(44 * scale)
  const titleSize = Math.round(13.5 * scale)
  const minH      = Math.round(150 * scale)

  return (
    <ScalePress onPress={onPress}>
      <View style={[fCard.card, { borderColor: meta.color + '22', flex: 1, minHeight: minH }]}>
        <View style={[fCard.glow, { backgroundColor: meta.color + '14' }]} />
        <View style={fCard.top}>
          <View style={[fCard.iconBox, { backgroundColor: meta.dimBg, width: iconBox, height: iconBox, borderRadius: Math.round(14 * scale) }]}>
            <Ionicons name={meta.icon as any} size={iconSz} color={meta.color} />
          </View>
          {/* Heart + arrow in top-right */}
          <View style={fCard.topRight}>
            <HeartBtn liked={liked} onPress={onLike} size={Math.round(16 * scale)} />
            <View style={fCard.arrowChip}><Text style={fCard.arrowText}>↗</Text></View>
          </View>
        </View>
        <View>
          <Text maxFontSizeMultiplier={1.3} style={[fCard.title, { fontSize: titleSize }]} numberOfLines={2}>{item.material.title}</Text>
          <View style={fCard.metaRow}>
            <TagChip label={meta.short} color={meta.color} bg={meta.dimBg} scale={scale} />
            {item.isOffline && (
              <View style={fCard.offlinePip}>
                <Ionicons name="cloud-done-outline" size={Math.round(10 * scale)} color={C.emerald} />
              </View>
            )}
          </View>
          <View style={[fCard.badge, { backgroundColor: meta.dimBg }]}>
            <Text allowFontScaling={false} style={[fCard.badgeText, { color: meta.color, fontSize: Math.round(10 * scale) }]}>{timeAgo(item.downloaded_at)}</Text>
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

// ─────────────────────────────────────────────────────────────────────────────
// Document row — responsive, with heart button
// ─────────────────────────────────────────────────────────────────────────────
function DocumentRow({ item, liked, onOpen, onChat, onRemove, onCacheFile, onQuiz, onAddToFolder, onLike, caching, selected, onLongPress, isPremium, menuOpen, onToggleMenu }: {
  item: Download; liked: boolean
  onOpen: () => void; onChat: () => void; onRemove: () => void
  onCacheFile: () => void; onQuiz: () => void; onAddToFolder: () => void; onLike: () => void
  caching: boolean; selected: boolean; onLongPress: () => void
  isPremium: boolean; menuOpen: boolean; onToggleMenu: () => void
}) {
  const scale = useScale()
  const meta  = TYPE_META[item.material.type] ?? TYPE_FALLBACK
  const iconSz   = Math.round(19 * scale)
  const iconBox  = Math.round(44 * scale)
  const titleSz  = Math.round(13.5 * scale)

  return (
    <ScalePress onPress={onOpen} onLongPress={onLongPress}>
      <View style={[drow.wrap, selected && drow.wrapSelected]}>
        <View style={[drow.accentLine, { backgroundColor: meta.color }]} />
        {selected && <View style={drow.checkWrap}><Ionicons name="checkmark-circle" size={Math.round(15 * scale)} color={C.orange} /></View>}
        <View style={[drow.iconBox, { backgroundColor: meta.dimBg, borderColor: meta.color + '20', width: iconBox, height: iconBox, minWidth: iconBox, borderRadius: Math.round(13 * scale) }]}>
          <Ionicons name={meta.icon as any} size={iconSz} color={meta.color} />
        </View>
        <View style={drow.info}>
          <Text maxFontSizeMultiplier={1.3} style={[drow.title, { fontSize: titleSz }]} numberOfLines={1}>{item.material.title}</Text>
          {/* metaRow: no wrap — single line, items shrink gracefully */}
          <View style={[drow.metaRow, { gap: Math.round(4 * scale) }]}>
            <TagChip label={meta.short} color={meta.color} bg={meta.dimBg} scale={scale} />
            <Text allowFontScaling={false} style={[drow.dot, { fontSize: Math.round(10 * scale) }]}>·</Text>
            <Text allowFontScaling={false} style={[drow.time, { fontSize: Math.round(10 * scale) }]} numberOfLines={1}>{timeAgo(item.downloaded_at)}</Text>
            {item.isOffline && (
              <>
                <Text allowFontScaling={false} style={[drow.dot, { fontSize: Math.round(10 * scale) }]}>·</Text>
                <Ionicons name="cloud-done-outline" size={Math.round(11 * scale)} color={C.emerald} />
                <Text allowFontScaling={false} style={[drow.time, { fontSize: Math.round(10 * scale), color: C.emerald }]} numberOfLines={1}>Offline</Text>
              </>
            )}
          </View>
        </View>
        {/* Heart always visible */}
        <HeartBtn liked={liked} onPress={onLike} size={Math.round(18 * scale)} />
        {/* Expand menu */}
        {menuOpen ? (
          <View style={drow.actionMenu}>
            <TouchableOpacity style={drow.miniBtn} onPress={onCacheFile} hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}>
              {caching ? <ActivityIndicator size="small" color={C.orange} />
                : item.isOffline ? <Ionicons name="checkmark-circle" size={17} color={C.emerald} />
                : <LockedIcon name="download-outline" size={17} color={C.textSub} locked={!isPremium} />}
            </TouchableOpacity>
            <TouchableOpacity style={drow.miniBtn} onPress={onChat} hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}>
              <Ionicons name="sparkles" size={15} color={C.lavender} />
            </TouchableOpacity>
            <TouchableOpacity style={drow.miniBtn} onPress={onQuiz} hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}>
              <Ionicons name={"school-outline" as any} size={15} color={C.sapphire} />
            </TouchableOpacity>
            <TouchableOpacity style={drow.miniBtn} onPress={onAddToFolder} hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}>
              <Ionicons name="folder-open-outline" size={15} color={C.gold} />
            </TouchableOpacity>
            <TouchableOpacity style={drow.miniBtn} onPress={onRemove} hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}>
              <Ionicons name="trash-outline" size={15} color={C.coral} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={drow.moreBtn} onPress={onToggleMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Folder card — responsive
// ─────────────────────────────────────────────────────────────────────────────
function FolderCard({ folder, count, onPress, onLongPress }: {
  folder: Folder; count: number; onPress: () => void; onLongPress: () => void
}) {
  const scale   = useScale()
  const iconSz  = Math.round(26 * scale)
  const iconBox = Math.round(52 * scale)
  const minH    = Math.round(150 * scale)
  const nameSz  = Math.round(14 * scale)

  return (
    <ScalePress onPress={onPress} onLongPress={onLongPress}>
      <View style={[fold.card, { borderColor: folder.color + '25', minHeight: minH }]}>
        <View style={[fold.glow, { backgroundColor: folder.color + '12' }]} />
        <View style={[fold.iconBox, { backgroundColor: folder.color + '18', width: iconBox, height: iconBox, borderRadius: Math.round(16 * scale) }]}>
          <Ionicons name="folder" size={iconSz} color={folder.color} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[fold.name, { fontSize: nameSz }]} numberOfLines={2}>{folder.name}</Text>
        <View style={[fold.countPill, { backgroundColor: folder.color + '15' }]}>
          <Text allowFontScaling={false} style={[fold.countText, { color: folder.color, fontSize: Math.round(11 * scale) }]}>
            {count} file{count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </ScalePress>
  )
}
const fold = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, padding: 18, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' },
  glow:      { position: 'absolute', top: -28, right: -28, width: 90, height: 90, borderRadius: 45, opacity: 0.6 },
  iconBox:   { justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  name:      { fontWeight: '700', color: C.text, lineHeight: 19, letterSpacing: -0.1, marginBottom: 8 },
  countPill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  countText: { fontWeight: '700' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Favorites Tab — shows liked materials filtered by global search query
// ─────────────────────────────────────────────────────────────────────────────
function FavoritesTab({ downloads, favIds, query, onOpen, onLike, onAddToFolder }: {
  downloads:    Download[]
  favIds:       Set<string>
  query:        string
  onOpen:       (item: Download) => void
  onLike:       (materialId: string) => void
  onAddToFolder:(item: Download) => void
}) {
  const scale = useScale()
  const liked = useMemo(() => {
    let list = downloads.filter(d => favIds.has(d.material.id))
    if (query.trim()) list = list.filter(d => matchesQuery(d.material.title, query))
    return list
  }, [downloads, favIds, query])

  if (liked.length === 0) {
    return (
      <View style={fav.empty}>
        <View style={fav.iconBox}>
          <Ionicons name="heart-outline" size={Math.round(30 * scale)} color={C.coral} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={fav.title}>
          {query.trim() ? 'No matches' : 'No favorites yet'}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={fav.sub}>
          {query.trim()
            ? `No liked files match "${query}"`
            : 'Tap the ♥ on any file to save it here'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={fav.list} showsVerticalScrollIndicator={false}>
      <SectionHead title={`Favorites · ${liked.length}`} />
      {liked.map(item => (
        <DocumentRow
          key={item.id}
          item={item}
          liked={true}
          onOpen={() => onOpen(item)}
          onLike={() => onLike(item.material.id)}
          onChat={() => {}}
          onRemove={() => {}}
          onCacheFile={() => {}}
          onQuiz={() => {}}
          onAddToFolder={() => onAddToFolder(item)}
          caching={false}
          selected={false}
          onLongPress={() => {}}
          isPremium={false}
          menuOpen={false}
          onToggleMenu={() => {}}
        />
      ))}
    </ScrollView>
  )
}
const fav = StyleSheet.create({
  empty:   { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  iconBox: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.coralDim, borderWidth: 1, borderColor: C.coral + '25', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  title:   { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  sub:     { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  list:    { paddingHorizontal: BODY_H_PAD, paddingBottom: 60 },
})

// ─────────────────────────────────────────────────────────────────────────────
// Folders Tab — query-filtered, fixed paddingTop
// ─────────────────────────────────────────────────────────────────────────────
function FoldersTab({ folders, downloads, syncing, query, totalHeaderH, onCreateFolder, onUpdateFolder, onDeleteFolder, onRemoveMaterial, onOpenFile, favIds, onLike }: {
  folders:          Folder[]
  downloads:        Download[]
  syncing:          boolean
  query:            string
  totalHeaderH:     number
  onCreateFolder:   (name: string, color: string) => Promise<void>
  onUpdateFolder:   (id: string, name: string, color: string) => Promise<void>
  onDeleteFolder:   (id: string) => Promise<void>
  onRemoveMaterial: (folderId: string, materialId: string) => void
  onOpenFile:       (item: Download) => void
  favIds:           Set<string>
  onLike:           (materialId: string) => void
}) {
  const [showForm,   setShowForm]   = useState(false)
  const [editFolder, setEditFolder] = useState<Folder | null>(null)
  const [openFolder, setOpenFolder] = useState<Folder | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const scale = useScale()

  const liveOpenFolder = openFolder ? (folders.find(f => f.id === openFolder.id) ?? openFolder) : null

  // Filter folders list by search query
  const filteredFolders = useMemo(() => {
    if (!query.trim()) return folders
    const q = query.toLowerCase().trim()
    return folders.filter(f =>
      f.name.toLowerCase().includes(q) ||
      downloads.some(d => f.material_ids.includes(d.material.id) && matchesQuery(d.material.title, q))
    )
  }, [folders, downloads, query])

  async function handleSave(name: string, color: string) {
    setFormSaving(true)
    try { editFolder ? await onUpdateFolder(editFolder.id, name, color) : await onCreateFolder(name, color) }
    finally { setFormSaving(false) }
  }

  function confirmDelete(folder: Folder) {
    Alert.alert('Delete Folder', `Delete "${folder.name}"? Files inside won't be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await onDeleteFolder(folder.id)
        if (openFolder?.id === folder.id) setOpenFolder(null)
      }},
    ])
  }

  // ── All hooks must be unconditional (Rules of Hooks) ─────────────────
  // Compute folder items for open-folder view regardless of which view is shown
  const openFolderItems = useMemo(() => {
    if (!liveOpenFolder) return []
    let list = downloads.filter(d => liveOpenFolder.material_ids.includes(d.material.id))
    if (query.trim()) list = list.filter(d => matchesQuery(d.material.title, query))
    return list
  }, [downloads, liveOpenFolder, query])

  // Grid column width — always computed
  const { width } = useWindowDimensions()
  const colW = (width - BODY_H_PAD * 2 - COL_GAP) / 2

  // ── Open folder view ──────────────────────────────────────────────────
  if (liveOpenFolder) {
    const items = openFolderItems
    return (
      <View style={{ flex: 1 }}>
        <View style={ft.folderHeader}>
          <TouchableOpacity onPress={() => setOpenFolder(null)} style={ft.backBtn}>
            <Ionicons name="chevron-back" size={Math.round(18 * scale)} color={C.textSub} />
          </TouchableOpacity>
          <View style={[ft.folderHeaderIcon, { backgroundColor: liveOpenFolder.color + '18' }]}>
            <Ionicons name="folder" size={Math.round(18 * scale)} color={liveOpenFolder.color} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={ft.folderHeaderName} numberOfLines={1}>{liveOpenFolder.name}</Text>
          <View style={{ flex: 1 }} />
          <View style={ft.syncChip}>
            <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
            <Text allowFontScaling={false} style={ft.syncChipText}>Synced</Text>
          </View>
          <TouchableOpacity style={ft.folderEditBtn} onPress={() => { setEditFolder(liveOpenFolder); setShowForm(true) }}>
            <Ionicons name="pencil" size={14} color={C.textSub} />
          </TouchableOpacity>
          <TouchableOpacity style={ft.folderDeleteBtn} onPress={() => confirmDelete(liveOpenFolder)}>
            <Ionicons name="trash-outline" size={14} color={C.coral} />
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View style={ft.emptyFolder}>
            <View style={[ft.emptyIconBox, { backgroundColor: liveOpenFolder.color + '12' }]}>
              <Ionicons name="folder-open-outline" size={Math.round(30 * scale)} color={liveOpenFolder.color} />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyTitle}>
              {query.trim() ? 'No matches' : 'Folder is empty'}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptySub}>
              {query.trim()
                ? `No files in this folder match "${query}"`
                : 'Tap ⋮ on any download and choose "Add to folder"'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={ft.folderItemList} showsVerticalScrollIndicator={false}>
            {items.map(item => {
              const meta = TYPE_META[item.material.type] ?? TYPE_FALLBACK
              const iSz  = Math.round(18 * scale)
              const iBox = Math.round(42 * scale)
              return (
                <ScalePress key={item.id} onPress={() => onOpenFile(item)}>
                  <View style={ft.folderItem}>
                    <View style={[ft.folderItemLine, { backgroundColor: meta.color }]} />
                    <View style={[ft.folderItemIcon, { backgroundColor: meta.dimBg, borderColor: meta.color + '20', width: iBox, height: iBox, minWidth: iBox, borderRadius: Math.round(12 * scale) }]}>
                      <Ionicons name={meta.icon as any} size={iSz} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text maxFontSizeMultiplier={1.3} style={[ft.folderItemTitle, { fontSize: Math.round(13.5 * scale) }]} numberOfLines={1}>{item.material.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <TagChip label={meta.short} color={meta.color} bg={meta.dimBg} scale={scale} />
                        <Text allowFontScaling={false} style={ft.folderItemTime}>{timeAgo(item.downloaded_at)}</Text>
                        {item.isOffline && <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />}
                      </View>
                    </View>
                    <HeartBtn liked={favIds.has(item.material.id)} onPress={() => onLike(item.material.id)} size={Math.round(17 * scale)} />
                    <TouchableOpacity onPress={() => onRemoveMaterial(liveOpenFolder.id, item.material.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={ft.removeBtn}>
                      <Ionicons name="remove-circle-outline" size={Math.round(18 * scale)} color={C.coral} />
                    </TouchableOpacity>
                  </View>
                </ScalePress>
              )
            })}
          </ScrollView>
        )}
        <FolderFormModal visible={showForm} onClose={() => { setShowForm(false); setEditFolder(null) }} initial={editFolder ? { name: editFolder.name, color: editFolder.color } : undefined} onSave={handleSave} saving={formSaving} />
      </View>
    )
  }

  // ── Grid view ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* paddingTop: 12 — the parent View already has paddingTop: totalHeaderH */}
      <ScrollView contentContainerStyle={[ft.grid, { paddingTop: 12 }]} showsVerticalScrollIndicator={false}>
        <SectionHead
          title="My Folders"
          link={syncing ? 'Syncing…' : 'New Folder'}
          onLink={syncing ? undefined : () => { setEditFolder(null); setShowForm(true) }}
        />

        <View style={ft.syncBanner}>
          <Ionicons name="cloud-done-outline" size={13} color={C.emerald} />
          <Text maxFontSizeMultiplier={1.3} style={ft.syncBannerText}>Folders sync across all your devices in real-time</Text>
          {syncing && <ActivityIndicator size="small" color={C.emerald} style={{ marginLeft: 4 }} />}
        </View>

        {filteredFolders.length === 0 && query.trim() ? (
          <View style={ft.emptyFolder}>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyTitle}>No folders match "{query}"</Text>
          </View>
        ) : folders.length === 0 ? (
          <TouchableOpacity style={ft.emptyCreate} onPress={() => { setEditFolder(null); setShowForm(true) }} activeOpacity={0.85}>
            <View style={ft.emptyCreateIcon}><Ionicons name="folder-open-outline" size={Math.round(30 * scale)} color={C.orange} /></View>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyCreateTitle}>No folders yet</Text>
            <Text maxFontSizeMultiplier={1.3} style={ft.emptyCreateSub}>Create folders to organise your downloads.{'\n'}They'll appear on all your devices instantly.</Text>
            <View style={ft.emptyCreateBtn}><Ionicons name="add" size={15} color="#fff" /><Text maxFontSizeMultiplier={1.3} style={ft.emptyCreateBtnText}>Create Folder</Text></View>
          </TouchableOpacity>
        ) : (
          <View style={ft.gridCols}>
            {filteredFolders.map(folder => {
              const count = downloads.filter(d => folder.material_ids.includes(d.material.id)).length
              return (
                <View key={folder.id} style={{ width: colW }}>
                  <FolderCard
                    folder={folder} count={count}
                    onPress={() => setOpenFolder(folder)}
                    onLongPress={() => Alert.alert(folder.name, 'What would you like to do?', [
                      { text: 'Rename', onPress: () => { setEditFolder(folder); setShowForm(true) } },
                      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(folder) },
                      { text: 'Cancel', style: 'cancel' },
                    ])}
                  />
                </View>
              )
            })}
            {!query.trim() && (
              <TouchableOpacity style={{ width: colW }} onPress={() => { setEditFolder(null); setShowForm(true) }} activeOpacity={0.8}>
                <View style={[ft.newFolderCard, { minHeight: Math.round(150 * scale) }]}>
                  <View style={[ft.newFolderCardIcon, { width: Math.round(52 * scale), height: Math.round(52 * scale), borderRadius: Math.round(16 * scale) }]}>
                    <Ionicons name="add" size={Math.round(24 * scale)} color={C.orange} />
                  </View>
                  <Text maxFontSizeMultiplier={1.3} style={[ft.newFolderCardLabel, { fontSize: Math.round(13 * scale) }]}>New Folder</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <FolderFormModal visible={showForm} onClose={() => { setShowForm(false); setEditFolder(null) }} initial={editFolder ? { name: editFolder.name, color: editFolder.color } : undefined} onSave={handleSave} saving={formSaving} />
    </View>
  )
}
const ft = StyleSheet.create({
  // FIX: paddingTop is set inline dynamically — no static value here
  grid:            { paddingHorizontal: BODY_H_PAD, paddingBottom: 60 },
  gridCols:        { flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP },

  syncBanner:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.emerDim, borderWidth: 1, borderColor: C.emerald + '25', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 20 },
  syncBannerText:  { flex: 1, fontSize: 12, color: C.emerald, fontWeight: '600' },

  folderHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: BODY_H_PAD, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:          { width: 34, height: 34, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  folderHeaderIcon: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  folderHeaderName: { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.2, flexShrink: 1 },
  syncChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.emerDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  syncChipText:     { fontSize: 10, fontWeight: '700', color: C.emerald },
  folderEditBtn:    { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  folderDeleteBtn:  { width: 32, height: 32, borderRadius: 10, backgroundColor: C.coralDim, borderWidth: 1, borderColor: C.coral + '30', justifyContent: 'center', alignItems: 'center' },

  folderItemList:   { paddingHorizontal: BODY_H_PAD, paddingTop: 12, paddingBottom: 60 },
  folderItem:       { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 14, marginBottom: 8, position: 'relative', overflow: 'hidden' },
  folderItemLine:   { position: 'absolute', left: 0, top: 12, bottom: 12, width: 2, borderRadius: 1, opacity: 0.75 },
  folderItemIcon:   { borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  folderItemTitle:  { fontWeight: '600', color: C.text, marginBottom: 6, lineHeight: 18 },
  folderItemTime:   { fontSize: 11, color: C.textMute },
  removeBtn:        { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  emptyFolder:     { flex: 1, alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconBox:    { width: 72, height: 72, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  emptySub:        { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },

  emptyCreate:        { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyCreateIcon:    { width: 80, height: 80, borderRadius: 24, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '25', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyCreateTitle:   { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  emptyCreateSub:     { fontSize: 13, color: C.textMute, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  emptyCreateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, marginTop: 4 },
  emptyCreateBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  newFolderCard:      { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 18 },
  newFolderCardIcon:  { backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  newFolderCardLabel: { fontWeight: '700', color: C.orange },
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function DownloadsScreen() {
  const router        = useRouter()
  const queryClient   = useQueryClient()
  const { userId }    = useProfileSync()
  const { isPremium } = usePremium()
  const insets        = useSafeAreaInsets()
  const scale         = useScale()
  const { width }     = useWindowDimensions()

  const folderHook  = useFolders(userId)
  const { favIds, toggle: toggleFav } = useFavorites(userId)

  const [activeTab,          setActiveTab]          = useState<TabOption>('downloads')
  const [downloadsWithLocal, setDownloadsWithLocal] = useState<Download[]>([])
  const [query,              setQuery]              = useState('')
  const [activeFilter,       setFilter]             = useState('')
  const [cachingId,          setCachingId]          = useState<string | null>(null)
  const [offlineOnly,        setOffline]            = useState(false)
  const [sortBy,             setSortBy]             = useState<SortOption>('date')
  const [storageUsed,        setStorageUsed]        = useState(0)
  const [selectedIds,        setSelectedIds]        = useState<Set<string>>(new Set())
  const [selectMode,         setSelectMode]         = useState(false)
  const [isOfflineFallback,  setIsOfflineFallback]  = useState(false)
  const [showPremModal,      setShowPremModal]      = useState(false)
  const [openMenuId,         setOpenMenuId]         = useState<string | null>(null)
  const [showSearch,         setShowSearch]         = useState(false)
  const [folderTarget,       setFolderTarget]       = useState<Download | null>(null)

  // Header height maths
  const navPaddingTop = insets.top + 10
  const navRowH       = 34 + 12
  const totalHeaderH  = navPaddingTop + navRowH + TAB_H

  useEffect(() => { ensureDir() }, [])

  // ── Downloads query ───────────────────────────────────────────────────
  const { data: rawDownloads = EMPTY_DOWNLOADS, isLoading } = useQuery({
    queryKey: ['downloads', userId],
    queryFn: async () => {
      try {
        const data = await fetchDownloads(userId!)
        await AsyncStorage.setItem(DOWNLOADS_CACHE_KEY(userId!), JSON.stringify(data))
        setIsOfflineFallback(false)
        return data
      } catch {
        const cached = await AsyncStorage.getItem(DOWNLOADS_CACHE_KEY(userId!))
        if (cached) { setIsOfflineFallback(true); return JSON.parse(cached) as DownloadRecord[] }
        throw new Error('No cache available')
      }
    },
    enabled: !!userId, staleTime: 2 * 60 * 1000,
  })

  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`downloads:user:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'downloads', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ['downloads', userId] }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, queryClient])

  useEffect(() => {
    if (rawDownloads.length === 0) { setDownloadsWithLocal([]); registrySetAll([]); return }
    let cancelled = false
    ;(async () => {
      const withLocal = await Promise.all(rawDownloads.map(async d => {
        const path = makeLocalPath(d.material.id, d.material.file_url)
        const info = await FileSystem.getInfoAsync(path)
        return { ...d, localPath: path, isOffline: info.exists }
      }))
      if (cancelled) return
      setDownloadsWithLocal(withLocal)
      registrySetAll(withLocal.filter(d => d.isOffline).map(d => d.material.id))
    })()
    return () => { cancelled = true }
  }, [rawDownloads])

  useEffect(() => { calcStorageUsed(downloadsWithLocal).then(setStorageUsed) }, [downloadsWithLocal])

  const lastFocusRef = useRef(0)
  useFocusEffect(useCallback(() => {
    const now = Date.now()
    if (userId && now - lastFocusRef.current > 30_000) {
      lastFocusRef.current = now
      queryClient.invalidateQueries({ queryKey: ['downloads', userId] })
    }
  }, [userId, queryClient]))

  // ── Actions ───────────────────────────────────────────────────────────
  async function cacheFile(item: Download) {
    if (!isPremium) { setShowPremModal(true); return }
    if (item.isOffline) return
    try {
      setCachingId(item.id)
      await ensureDir()
      const path = makeLocalPath(item.material.id, item.material.file_url)
      const existing = await FileSystem.getInfoAsync(path)
      if (existing.exists) {
        setDownloadsWithLocal(prev => prev.map(d => d.id === item.id ? { ...d, localPath: path, isOffline: true } : d))
        registryAdd(item.material.id); return
      }
      const result = await FileSystem.downloadAsync(item.material.file_url, path)
      if (result.status === 200) {
        setDownloadsWithLocal(prev => prev.map(d => d.id === item.id ? { ...d, localPath: path, isOffline: true } : d))
        registryAdd(item.material.id)
      } else Alert.alert('Download failed', 'Could not save the file offline.')
    } catch { Alert.alert('Error', 'Failed to download file for offline use.') }
    finally { setCachingId(null) }
  }

  function openFile(item: Download) {
    if (selectMode) { toggleSelect(item.id); return }
    setOpenMenuId(null)
    router.push({
      pathname: '/viewer',
      params: {
        file_url:    item.isOffline && item.localPath ? item.localPath : item.material.file_url,
        title:       item.material.title,
        material_id: item.material.id,
        is_local:    item.isOffline ? '1' : '0',
        from:        '/(tabs)/downloads',
      },
    })
  }

  async function removeDownload(item: Download) {
    setOpenMenuId(null)
    Alert.alert('Remove Download', `Remove "${item.material.title}" from your downloads?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('downloads').delete().eq('id', item.id)
        if (error) { Alert.alert('Error', 'Could not remove download.'); return }
        if (item.localPath) await FileSystem.deleteAsync(item.localPath, { idempotent: true })
        registryRemove(item.material.id)
        await folderHook.removeMaterialFromAll(item.material.id)
        setDownloadsWithLocal(prev => prev.filter(d => d.id !== item.id))
        queryClient.invalidateQueries({ queryKey: ['downloads', userId] })
      }},
    ])
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    Alert.alert('Remove Downloads', `Remove ${selectedIds.size} download${selectedIds.size > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const toDelete = downloadsWithLocal.filter(d => selectedIds.has(d.id))
        const { error } = await supabase.from('downloads').delete().in('id', toDelete.map(d => d.id))
        if (error) { Alert.alert('Error', 'Could not remove some downloads.'); return }
        for (const item of toDelete) {
          if (item.localPath) await FileSystem.deleteAsync(item.localPath, { idempotent: true })
          registryRemove(item.material.id)
          await folderHook.removeMaterialFromAll(item.material.id)
        }
        setDownloadsWithLocal(prev => prev.filter(d => !selectedIds.has(d.id)))
        setSelectedIds(new Set()); setSelectMode(false)
        queryClient.invalidateQueries({ queryKey: ['downloads', userId] })
      }},
    ])
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      if (next.size === 0) setSelectMode(false)
      return next
    })
  }
  function enterSelectMode(id: string) { setSelectMode(true); setSelectedIds(new Set([id])) }
  function exitSelectMode()            { setSelectMode(false); setSelectedIds(new Set()) }
  function openChat(item: Download) {
    setOpenMenuId(null)
    router.push({ pathname: '/chat', params: { material_title: item.material.title, file_url: item.isOffline && item.localPath ? item.localPath : item.material.file_url, conversation_id: 'new' } })
  }
  function openQuiz(item: Download) {
    setOpenMenuId(null)
    router.push({ pathname: '/quiz-flashcards' as any, params: { material_id: item.material.id, title: item.material.title, file_url: item.isOffline && item.localPath ? item.localPath : item.material.file_url, type: item.material.type, auto_generate: '1' } })
  }

  // ── Downloads tab filtered list ───────────────────────────────────────
  const filtered = useMemo(() => {
    let list = downloadsWithLocal
    if (offlineOnly)  list = list.filter(d => d.isOffline)
    if (activeFilter) list = list.filter(d => d.material.type === activeFilter)
    if (query.trim()) list = list.filter(d => matchesQuery(d.material.title, query))
    return list
  }, [downloadsWithLocal, offlineOnly, activeFilter, query])

  const sections      = useMemo(() => groupByDate(filtered, sortBy), [filtered, sortBy])
  const offlineCount  = downloadsWithLocal.filter(d => d.isOffline).length
  const featuredItems = downloadsWithLocal.slice(0, 2)
  const favCount      = useMemo(() => downloadsWithLocal.filter(d => favIds.has(d.material.id)).length, [downloadsWithLocal, favIds])

  // Responsive featured grid column width
  const featColW = (width - BODY_H_PAD * 2 - COL_GAP) / 2

  // ── Nav bar ───────────────────────────────────────────────────────────
  const NavBar = () => (
    <View style={[s.navShell, { paddingTop: navPaddingTop }]}>
      <View style={s.orbOrange} />
      <View style={s.orbBlue}   />
      <View style={s.navRow}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={exitSelectMode} style={s.navCancelBtn}>
              <Ionicons name="close" size={16} color={C.textSub} />
              <Text maxFontSizeMultiplier={1.3} style={s.navCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text maxFontSizeMultiplier={1.3} style={s.navSelectCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={bulkDelete} style={s.navDeleteBtn}>
              <Ionicons name="trash-outline" size={14} color={C.coral} />
              <Text maxFontSizeMultiplier={1.3} style={s.navDeleteText}>Delete</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.navBrand}>
              <View style={s.navLogo}><Text style={{ fontSize: Math.round(16 * scale) }}>📥</Text></View>
              <Text maxFontSizeMultiplier={1.3} style={[s.navWordmark, { fontSize: Math.round(19 * scale) }]}>
                My <Text style={s.navWordmarkAccent}>Library</Text>
              </Text>
            </View>
            {/* Search bar — always shown when showSearch, works on all tabs */}
            {showSearch ? (
              <View style={s.navSearchBox}>
                <Ionicons name="search-outline" size={13} color={C.textMute} />
                <TextInput
                  style={s.navSearchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${activeTab}…`}
                  placeholderTextColor={C.textMute}
                  autoFocus
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <Ionicons name="close-circle" size={14} color={C.textMute} />
                  </TouchableOpacity>
                )}
              </View>
            ) : <View style={{ flex: 1 }} />}
            {activeTab === 'downloads' && (
              <TouchableOpacity style={[s.navBtn, offlineOnly && s.navBtnActive]} onPress={() => setOffline(v => !v)} activeOpacity={0.8}>
                <Ionicons name="cloud-offline-outline" size={16} color={offlineOnly ? C.emerald : C.textSub} />
                {offlineOnly && <View style={s.navBtnDot} />}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.navBtn, showSearch && s.navBtnActive]} onPress={() => { setShowSearch(v => !v); if (showSearch) setQuery('') }} activeOpacity={0.8}>
              <Ionicons name="search" size={16} color={showSearch ? C.orange : C.textSub} />
            </TouchableOpacity>
          </>
        )}
      </View>
      {/* Tab strip */}
      <View style={s.tabBorderTop}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.value}
              style={[s.tab, activeTab === tab.value && s.tabActive]}
              onPress={() => { setActiveTab(tab.value); setOpenMenuId(null) }}
              activeOpacity={0.75}
            >
              <Text maxFontSizeMultiplier={1.3} style={[s.tabText, activeTab === tab.value && s.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.value === 'downloads' && downloadsWithLocal.length > 0 && (
                <View style={s.tabBadge}><Text allowFontScaling={false} style={s.tabBadgeText}>{downloadsWithLocal.length}</Text></View>
              )}
              {tab.value === 'favorites' && favCount > 0 && (
                <View style={[s.tabBadge, { backgroundColor: C.coralDim, borderColor: C.coral + '30' }]}>
                  <Text allowFontScaling={false} style={[s.tabBadgeText, { color: C.coral }]}>{favCount}</Text>
                </View>
              )}
              {tab.value === 'folders' && folderHook.folders.length > 0 && (
                <View style={s.tabBadge}><Text allowFontScaling={false} style={s.tabBadgeText}>{folderHook.folders.length}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  )

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.container}>
        <NavBar />
        <View style={{ paddingTop: totalHeaderH + 16, paddingHorizontal: BODY_H_PAD, gap: 8 }}>
          {[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}
        </View>
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <PremiumGateModal visible={showPremModal} onClose={() => setShowPremModal(false)} onUpgrade={() => { setShowPremModal(false); router.push('/subscription' as any) }} />

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

      <NavBar />

      <View style={[s.tabContent, { paddingTop: totalHeaderH }]}>

        {/* ── Favorites tab ── */}
        {activeTab === 'favorites' && (
          <FavoritesTab
            downloads={downloadsWithLocal}
            favIds={favIds}
            query={query}
            onOpen={openFile}
            onLike={toggleFav}
            onAddToFolder={item => { setFolderTarget(item) }}
          />
        )}

        {/* ── Folders tab ── */}
        {activeTab === 'folders' && (
          <FoldersTab
            folders={folderHook.folders}
            downloads={downloadsWithLocal}
            syncing={folderHook.syncing}
            query={query}
            totalHeaderH={totalHeaderH}
            onCreateFolder={async (n, c) => { await folderHook.createFolder(n, c) }}
            onUpdateFolder={async (id, n, c) => { await folderHook.updateFolder(id, n, c) }}
            onDeleteFolder={async id => { await folderHook.deleteFolder(id) }}
            onRemoveMaterial={(fid, mid) => folderHook.toggleMaterial(fid, mid)}
            onOpenFile={openFile}
            favIds={favIds}
            onLike={toggleFav}
          />
        )}

        {/* ── Downloads tab ── */}
        {activeTab === 'downloads' && (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.listContent}
            stickySectionHeadersEnabled={false}
            onScrollBeginDrag={() => setOpenMenuId(null)}

            ListHeaderComponent={
              <View>
                {/* Stats pills */}
                <View style={s.statsRow}>
                  <View style={s.statPill}>
                    <Ionicons name="document-outline" size={11} color={C.textMute} />
                    <Text allowFontScaling={false} style={s.statText}>{downloadsWithLocal.length} file{downloadsWithLocal.length !== 1 ? 's' : ''}</Text>
                  </View>
                  {offlineCount > 0 && (
                    <View style={[s.statPill, s.statPillEmerald]}>
                      <Ionicons name="cloud-done-outline" size={11} color={C.emerald} />
                      <Text allowFontScaling={false} style={[s.statText, { color: C.emerald }]}>{offlineCount} offline</Text>
                    </View>
                  )}
                  {storageUsed > 0 && (
                    <View style={s.statPill}>
                      <Ionicons name="server-outline" size={11} color={C.textMute} />
                      <Text allowFontScaling={false} style={s.statText}>{formatBytes(storageUsed)}</Text>
                    </View>
                  )}
                  {isOfflineFallback && (
                    <View style={[s.statPill, s.statPillGold]}>
                      <Ionicons name="cloud-offline-outline" size={11} color={C.gold} />
                      <Text allowFontScaling={false} style={[s.statText, { color: C.gold }]}>Cached</Text>
                    </View>
                  )}
                  {isPremium && (
                    <View style={[s.statPill, s.statPillGold]}>
                      <Ionicons name="star" size={10} color={C.gold} />
                      <Text allowFontScaling={false} style={[s.statText, { color: C.gold }]}>Premium</Text>
                    </View>
                  )}
                </View>

                {/* Filter + sort */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersScroll} contentContainerStyle={s.filtersRow}>
                  {FILTERS.map(f => (
                    <TouchableOpacity key={f.value} style={[s.chip, activeFilter === f.value && s.chipActive]} onPress={() => setFilter(f.value)} activeOpacity={0.75}>
                      <Text allowFontScaling={false} style={[s.chipText, activeFilter === f.value && s.chipTextActive]}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={s.chipDivider} />
                  {SORT_OPTIONS.map(so => (
                    <TouchableOpacity key={so.value} style={[s.chip, sortBy === so.value && s.chipSortActive]} onPress={() => setSortBy(so.value)} activeOpacity={0.75}>
                      <Ionicons name="swap-vertical-outline" size={10} color={sortBy === so.value ? C.orange : C.textMute} style={{ marginRight: 3 }} />
                      <Text allowFontScaling={false} style={[s.chipText, sortBy === so.value && s.chipTextSortActive]}>{so.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Result count */}
                {(query || activeFilter || offlineOnly) && (
                  <View style={s.resultRow}>
                    <View style={s.resultDot} />
                    <Text allowFontScaling={false} style={s.resultText}>
                      {filtered.length} result{filtered.length !== 1 ? 's' : ''}{query ? ` for "${query}"` : ''}
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
                  <Text allowFontScaling={false} style={s.sectionHeaderTitle}>{section.title.toUpperCase()}</Text>
                </View>
                <View style={s.sectionCountPill}>
                  <Text allowFontScaling={false} style={s.sectionCount}>{section.data.length}</Text>
                </View>
              </View>
            )}

            renderItem={({ item }) => (
              <DocumentRow
                item={item}
                liked={favIds.has(item.material.id)}
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
                  <Ionicons name="download-outline" size={Math.round(32 * scale)} color={C.textMute} />
                </View>
                <Text maxFontSizeMultiplier={1.3} style={s.emptyTitle}>
                  {downloadsWithLocal.length === 0 ? 'No downloads yet' : 'No matches'}
                </Text>
                <Text maxFontSizeMultiplier={1.3} style={s.emptySub}>
                  {downloadsWithLocal.length === 0 ? 'Files you download will appear here' : 'Try a different search or filter'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.void },
  tabContent: { flex: 1 },

  navShell: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: C.deep, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  orbOrange: { position: 'absolute', top: -80, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,105,42,0.08)' },
  orbBlue:   { position: 'absolute', top:  20, left: -40,  width: 150, height: 150, borderRadius: 75,  backgroundColor: 'rgba(75,140,245,0.05)' },

  navRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: BODY_H_PAD, paddingBottom: 12 },
  navBrand:          { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 0 },
  navLogo:           { width: 34, height: 34, borderRadius: 11, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 18, elevation: 8 },
  navWordmark:       { fontWeight: '700', color: C.text, letterSpacing: -0.4, fontFamily: 'serif' },
  navWordmarkAccent: { color: C.orange, fontStyle: 'italic' },
  navSearchBox:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  navSearchInput:    { flex: 1, fontSize: 12, color: C.text, fontWeight: '500' },
  navBtn:            { width: 38, height: 38, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  navBtnActive:      { backgroundColor: C.raised, borderColor: C.borderHi },
  navBtnDot:         { position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: C.emerald },
  navCancelBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navCancelText:     { fontSize: 14, fontWeight: '600', color: C.textSub },
  navSelectCount:    { flex: 1, fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
  navDeleteBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.coralDim, borderWidth: 1, borderColor: C.coral + '30', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7 },
  navDeleteText:     { fontSize: 12, fontWeight: '700', color: C.coral },

  tabBorderTop:  { borderTopWidth: 1, borderTopColor: C.border, height: TAB_H },
  tabRow:        { flexDirection: 'row', paddingHorizontal: BODY_H_PAD, alignItems: 'stretch', height: TAB_H },
  tab:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent', height: TAB_H },
  tabActive:     { borderBottomColor: C.orange },
  tabText:       { fontSize: 13, fontWeight: '600', color: C.textMute, letterSpacing: 0.1 },
  tabTextActive: { color: C.text },
  tabBadge:      { minWidth: 18, height: 18, borderRadius: 6, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  tabBadgeText:  { fontSize: 9.5, fontWeight: '800', color: C.orange },

  listContent:    { paddingHorizontal: BODY_H_PAD, paddingBottom: 60 },
  statsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12, marginBottom: 14 },
  statPill:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  statPillEmerald:{ borderColor: C.emerald + '25', backgroundColor: C.emerDim },
  statPillGold:   { borderColor: C.gold + '25', backgroundColor: C.goldDim },
  statText:       { fontSize: 11, color: C.textMute, fontWeight: '600' },

  filtersScroll:      { marginBottom: 8 },
  filtersRow:         { flexDirection: 'row', gap: 7, alignItems: 'center', paddingBottom: 2 },
  chip:               { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 100 },
  chipActive:         { backgroundColor: C.orange, borderColor: C.orange },
  chipSortActive:     { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  chipText:           { fontSize: 11.5, fontWeight: '600', color: C.textSub },
  chipTextActive:     { color: '#fff' },
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