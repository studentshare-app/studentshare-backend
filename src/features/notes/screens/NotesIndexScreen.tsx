/**
 * app/notes/index.tsx
 * Notes Home Screen
 *
 * Changes:
 *  - Avatar fetched from studentshare_dashboard_cache (set by home screen)
 *  - Delete notes via trash icon on each card
 *  - "View All" opens a full-screen modal of all the user's notes
 *  - Recent Notes section shows only the top 4 most recent
 *  - "Upload PDF/Image" renamed to "Generate your notes with AI"
 *  - "New Blank Note" hidden when the AI Notes filter tab is active
 *
 * Fixes:
 *  1. AI generation now calls 'generate-notes' instead of 'generate-quizz'
 *  2. Course query filtered by userId (was fetching all courses in DB)
 *  3. Robust response parsing handles all known LLM response shapes
 *  4. Empty-text error now reveals actual response shape for easier debugging
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'
import { useProfileSync } from '@/hooks/useProfileSync'

// ─────────────────────────────────────────────
// Design Tokens
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
  orange:    '#E8692A',
  orangeDim: '#2A1208',
  coral:     '#FF7B7B',
  coralDim:  '#2A0E0E',
  sapphire:  '#5B8DEF',
  sapphDim:  '#0D1A35',
  emerald:   '#44D4A0',
  emerDim:   '#0A2C1E',
  lavender:  '#A78BFA',
  lavDim:    '#1E1040',
  gold:      '#F0C060',
  goldDim:   '#2A1E08',
  sky:       '#38BDF8',
  skyDim:    '#0D1E2A',
  pink:      '#F472B6',
  pinkDim:   '#260830',
} as const

const NOTE_COLORS = [C.orange, C.sapphire, C.emerald, C.lavender, C.gold, C.sky, C.coral, C.pink]
const NOTE_COLOR_DIMS: Record<string, string> = {
  [C.orange]:   C.orangeDim,
  [C.sapphire]: C.sapphDim,
  [C.emerald]:  C.emerDim,
  [C.lavender]: C.lavDim,
  [C.gold]:     C.goldDim,
  [C.sky]:      C.skyDim,
  [C.coral]:    C.coralDim,
  [C.pink]:     C.pinkDim,
}

const NOTES_CACHE_KEY     = 'studentshare_notes_cache'
const DASHBOARD_CACHE_KEY = 'studentshare_dashboard_cache'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type Note = {
  id: string
  user_id: string
  title: string
  body: string
  color: string
  is_starred: boolean
  source: 'manual' | 'ai'
  course_id: string | null
  course_name?: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

type FilterKey = 'all' | 'starred' | 'ai'

type AIGeneratorSheetProps = {
  visible: boolean
  onClose: () => void
  userId: string | null
  onNoteCreated: (note: Note) => void
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function bodyPreview(body: string): string {
  return body
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/- /g, '')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 100)
}

async function fetchNotes(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('id, user_id, title, body, color, is_starred, source, course_id, is_deleted, created_at, updated_at, courses(name)')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data || []).map((n: any) => ({ ...n, course_name: n.courses?.name ?? null }))
}

async function softDeleteNote(noteId: string, userId: string) {
  const { error } = await supabase
    .from('notes')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', noteId).eq('user_id', userId)
  if (error) throw error
}

async function toggleStar(noteId: string, current: boolean) {
  const { error } = await supabase
    .from('notes')
    .update({ is_starred: !current, updated_at: new Date().toISOString() })
    .eq('id', noteId)
  if (error) throw error
}

// ─────────────────────────────────────────────
// ScalePress
// ─────────────────────────────────────────────
function ScalePress({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: any
}) {
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
// Note Thumbnail
// ─────────────────────────────────────────────
function NoteThumbnail({ color, source }: { color: string; source: 'manual' | 'ai' }) {
  const dim = NOTE_COLOR_DIMS[color] || C.raised
  return (
    <View style={[thumb.wrap, { backgroundColor: dim }]}>
      <View style={thumb.overlay} />
      <View style={thumb.lines}>
        <View style={[thumb.line, { width: '75%', backgroundColor: color + '45' }]} />
        <View style={[thumb.line, { width: '50%', backgroundColor: color + '2A' }]} />
        <View style={[thumb.line, { width: '65%', backgroundColor: color + '20' }]} />
      </View>
      {source === 'ai' ? (
        <View style={thumb.aiBadge}>
          <Text allowFontScaling={false} style={thumb.aiBadgeText}>AI Generated</Text>
        </View>
      ) : (
        <View style={[thumb.aiBadge, thumb.draftBadge]}>
          <Text allowFontScaling={false} style={thumb.draftBadgeText}>Draft</Text>
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Note Card
// ─────────────────────────────────────────────
function NoteCard({ note, onPress, onStar, onDelete }: {
  note: Note; onPress: () => void; onStar: () => void; onDelete: () => void
}) {
  const preview = bodyPreview(note.body)
  return (
    <ScalePress onPress={onPress} style={{ flex: 1 }}>
      <View style={nc.card}>
        <NoteThumbnail color={note.color} source={note.source} />
        <View style={nc.body}>
          <Text style={nc.title} numberOfLines={1}>{note.title || 'Untitled'}</Text>
          <Text style={nc.preview} numberOfLines={2}>{preview || 'No content yet.'}</Text>
          <View style={nc.footer}>
            <View style={nc.footerLeft}>
              {note.course_name ? (
                <View style={nc.courseTag}>
                  <Text allowFontScaling={false} style={nc.courseTagText}>{note.course_name}</Text>
                </View>
              ) : null}
            </View>
            <View style={nc.footerActions}>
              <TouchableOpacity onPress={onStar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={note.is_starred ? 'star' : 'star-outline'} size={14} color={note.is_starred ? C.gold : C.textMute} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={13} color={C.textMute} />
              </TouchableOpacity>
            </View>
          </View>
          <Text allowFontScaling={false} style={nc.timestamp}>Edited {relativeTime(note.updated_at)}</Text>
        </View>
      </View>
    </ScalePress>
  )
}

// ─────────────────────────────────────────────
// All Notes Modal
// ─────────────────────────────────────────────
function AllNotesModal({ visible, notes, onClose, onPress, onStar, onDelete }: {
  visible: boolean
  notes: Note[]
  onClose: () => void
  onPress: (note: Note) => void
  onStar: (note: Note) => void
  onDelete: (note: Note) => void
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={all.root}>
        <View style={all.header}>
          <Text style={all.title}>All Notes</Text>
          <TouchableOpacity onPress={onClose} style={all.closeBtn} activeOpacity={0.8}>
            <Ionicons name="close" size={20} color={C.textSub} />
          </TouchableOpacity>
        </View>
        <Text style={all.count}>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</Text>

        {notes.length === 0 ? (
          <View style={all.empty}>
            <Ionicons name="document-text-outline" size={40} color={C.textMute} />
            <Text style={all.emptyText}>No notes yet</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={all.grid}>
            {notes.map(note => (
              <View key={note.id} style={all.cell}>
                <NoteCard
                  note={note}
                  onPress={() => { onClose(); onPress(note) }}
                  onStar={() => onStar(note)}
                  onDelete={() => onDelete(note)}
                />
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// AI Generator Bottom Sheet
// ─────────────────────────────────────────────
function AIGeneratorSheet({ visible, onClose, userId, onNoteCreated }: AIGeneratorSheetProps) {
  const [topic,    setTopic]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [color,    setColor]    = useState(NOTE_COLORS[0])
  const [courses,  setCourses]  = useState<{ id: string; name: string }[]>([])
  const [courseId, setCourseId] = useState<string | null>(null)
  const [length,   setLength]   = useState<'brief' | 'standard' | 'detailed'>('standard')
  const [fmt,      setFmt]      = useState<'bullets' | 'narrative' | 'qa'>('bullets')

  // FIX 2: Filter courses by userId — only show the current user's courses
  useEffect(() => {
    if (!visible || !userId) return
    const loadCourses = async () => {
      const { data } = await supabase
        .from('courses')
        .select('id, name')
        .eq('user_id', userId)
        .limit(30)
      setCourses(data || [])
    }
    loadCourses()
  }, [visible, userId])

  useEffect(() => {
    if (!visible) { setTopic(''); setLength('standard'); setFmt('bullets'); setCourseId(null); setColor(NOTE_COLORS[0]) }
  }, [visible])

  const stylePrompt  = { bullets: 'Use clear headings and bullet points.', narrative: 'Write in flowing prose.', qa: 'Format as Q&A.' }
  const lengthPrompt = { brief: '~150 words.', standard: '~350 words.', detailed: '~600 words.' }
  const fmtLabel     = { bullets: 'Bullet points', narrative: 'Prose', qa: 'Q&A' }
  const lenLabel     = { brief: 'Brief', standard: 'Standard', detailed: 'Detailed' }

  async function handleGenerate() {
    if (!topic.trim()) { Alert.alert('Topic required', 'Enter a topic to generate notes on.'); return }
    if (!userId) { Alert.alert('Not signed in', 'Unable to generate notes before login.'); return }
    setLoading(true)

    try {
      const prompt = `Generate student study notes on: "${topic.trim()}". ${stylePrompt[fmt]} ${lengthPrompt[length]} Use markdown: # title, ## headings, **bold** terms. Start directly with # title.`

      // FIX 1: Call 'generate-notes' instead of 'generate-quizz'
      const { data: apiData, error: funcError } = await supabase.functions.invoke('generate-notes', {
        body: {
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        },
      })

      if (funcError) throw funcError

      // FIX 3: Robust parsing — log raw response, then try all known shapes
      console.log('[generate-notes] raw response:', JSON.stringify(apiData, null, 2))

      const text =
        // Anthropic shape: { content: [{ type: 'text', text: '...' }] }
        apiData?.content?.find((b: any) => b.type === 'text')?.text ||
        // OpenAI / Groq shape: { choices: [{ message: { content: '...' } }] }
        apiData?.choices?.[0]?.message?.content ||
        // Unwrapped proxy shape: { text: '...' }
        apiData?.text ||
        // Legacy shape
        apiData?.completion ||
        ''

      // FIX 4: Error reveals actual response keys so you know exactly what came back
      if (!text.trim()) {
        console.error('[generate-notes] unexpected response shape:', apiData)
        throw new Error(
          `No text returned from AI. Response keys: ${Object.keys(apiData || {}).join(', ') || 'empty'}`
        )
      }

      const match = text.match(/^#\s+(.+)$/m)
      const title = match ? match[1].trim() : topic.trim()
      const body  = text

      const { data: inserted, error: insertError } = await supabase
        .from('notes')
        .insert({
          user_id:    userId,
          title,
          body,
          color,
          is_starred: false,
          source:     'ai',
          course_id:  courseId,
          is_deleted: false,
        })
        .select('id, user_id, title, body, color, is_starred, source, course_id, is_deleted, created_at, updated_at')
        .single()
      if (insertError) throw insertError

      const newNote: Note = { ...inserted, course_name: courses.find(c => c.id === courseId)?.name ?? null }
      const raw = await AsyncStorage.getItem(NOTES_CACHE_KEY).catch(() => null)
      const cached: Note[] = raw ? JSON.parse(raw) : []
      await AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify([newNote, ...cached])).catch(() => {})
      onNoteCreated(newNote)
      onClose()
    } catch (e: any) {
      Alert.alert('Generation failed', e?.message || 'Could not generate notes.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={ai.overlay}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={ai.sheet}>
            <View style={ai.handleRow}><View style={ai.handle} /></View>
            <View style={ai.header}>
              <View style={ai.headerLeft}>
                <View style={ai.sparkBox}>
                  <Ionicons name="sparkles" size={18} color={C.orange} />
                </View>
                <View>
                  <Text style={ai.title}>Generate with AI</Text>
                  <Text style={ai.subtitle}>Instant study notes on any topic</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={ai.closeBtn}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={ai.label}>Topic *</Text>
              <TextInput
                style={ai.input}
                placeholder="e.g. Mitosis, World War II, Thermodynamics"
                placeholderTextColor={C.textMute}
                value={topic}
                onChangeText={setTopic}
                maxLength={120}
                returnKeyType="done"
              />

              {courses.length > 0 && (
                <>
                  <Text style={ai.label}>Course (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ai.chipRow}>
                    <TouchableOpacity style={[ai.chip, !courseId && ai.chipActive]} onPress={() => setCourseId(null)}>
                      <Text style={[ai.chipText, !courseId && ai.chipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {courses.map(c => (
                      <TouchableOpacity key={c.id} style={[ai.chip, courseId === c.id && ai.chipActive]} onPress={() => setCourseId(c.id)}>
                        <Text style={[ai.chipText, courseId === c.id && ai.chipTextActive]} numberOfLines={1}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={ai.label}>Length</Text>
              <View style={ai.toggleRow}>
                {(['brief', 'standard', 'detailed'] as const).map(l => (
                  <TouchableOpacity key={l} style={[ai.toggleBtn, length === l && ai.toggleBtnActive]} onPress={() => setLength(l)} activeOpacity={0.8}>
                    <Text style={[ai.toggleBtnText, length === l && ai.toggleBtnTextActive]}>{lenLabel[l]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={ai.label}>Format</Text>
              <View style={ai.toggleRow}>
                {(['bullets', 'narrative', 'qa'] as const).map(f => (
                  <TouchableOpacity key={f} style={[ai.toggleBtn, fmt === f && ai.toggleBtnActive]} onPress={() => setFmt(f)} activeOpacity={0.8}>
                    <Text style={[ai.toggleBtnText, fmt === f && ai.toggleBtnTextActive]}>{fmtLabel[f]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={ai.label}>Note color</Text>
              <View style={ai.colorRow}>
                {NOTE_COLORS.map(c => (
                  <TouchableOpacity key={c} style={[ai.colorDot, { backgroundColor: c }, color === c && ai.colorDotActive]} onPress={() => setColor(c)} activeOpacity={0.8}>
                    {color === c && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={[ai.generateBtn, loading && { opacity: 0.7 }]} onPress={handleGenerate} disabled={loading} activeOpacity={0.88}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={ai.generateBtnText}>Generate Notes</Text></>
                }
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────
function EmptyState({ onWrite, onGenerate }: { onWrite: () => void; onGenerate: () => void }) {
  return (
    <View style={em.wrap}>
      <View style={em.iconBox}>
        <Ionicons name="document-text-outline" size={36} color={C.orange} />
      </View>
      <Text style={em.title}>No notes yet</Text>
      <Text style={em.sub}>Create your first note or generate one with AI.</Text>
      <View style={em.btnRow}>
        <TouchableOpacity style={em.btnPrimary} onPress={onWrite} activeOpacity={0.85}>
          <Ionicons name="create-outline" size={15} color="#fff" />
          <Text style={em.btnPrimaryText}>New blank note</Text>
        </TouchableOpacity>
        <TouchableOpacity style={em.btnSecondary} onPress={onGenerate} activeOpacity={0.85}>
          <Ionicons name="sparkles-outline" size={15} color={C.orange} />
          <Text style={em.btnSecondaryText}>Generate with AI</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function NotesScreen() {
  const router      = useRouter()
  const insets      = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { userId, profile } = useProfileSync()

  const [search,       setSearch]       = useState('')
  const [filter,       setFilter]       = useState<FilterKey>('all')
  const [showAI,       setShowAI]       = useState(false)
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [cachedNotes,  setCachedNotes]  = useState<Note[]>([])
  const [cacheReady,   setCacheReady]   = useState(false)
  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(null)
  const [userInitial,  setUserInitial]  = useState('?')

  useEffect(() => {
    const loadAvatar = async () => {
      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url)
        if (profile.full_name) setUserInitial(profile.full_name.charAt(0).toUpperCase())
        return
      }
      const raw = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY).catch(() => null)
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          const url  = parsed?.profile?.avatar_url ?? null
          const name = parsed?.profile?.full_name ?? ''
          if (url)  setAvatarUrl(url)
          if (name) setUserInitial(name.charAt(0).toUpperCase())
        } catch {}
      }
    }
    loadAvatar()
  }, [profile])

  useFocusEffect(
    useCallback(() => {
      if (userId) queryClient.invalidateQueries({ queryKey: ['notes', userId] })
    }, [userId, queryClient])
  )

  const { data: notes = cachedNotes, isLoading } = useQuery({
    queryKey:        ['notes', userId],
    queryFn:         () => fetchNotes(userId!),
    enabled:         !!userId && cacheReady,
    staleTime:       30 * 1000,
    gcTime:          5 * 60 * 1000,
    placeholderData: cachedNotes.length ? cachedNotes : undefined,
  })

  const lastWritten = useRef<Note[]>([])
  useEffect(() => {
    if (notes && notes !== lastWritten.current) {
      lastWritten.current = notes
      AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(notes)).catch(() => {})
    }
  }, [notes])

  const filtered = useMemo(() => {
    let base = notes
    if (filter === 'starred') base = base.filter(n => n.is_starred)
    if (filter === 'ai')      base = base.filter(n => n.source === 'ai')
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.course_name || '').toLowerCase().includes(q)
      )
    }
    return base
  }, [notes, filter, search])

  const recentNotes = useMemo(() => filtered.slice(0, 4), [filtered])

  const handleDelete = useCallback((note: Note) => {
    if (!userId) {
      Alert.alert('Unable to delete', 'User not loaded. Please try again shortly.')
      return
    }
    Alert.alert('Delete note', `Delete "${note.title || 'Untitled'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          queryClient.setQueryData<Note[]>(['notes', userId], prev => (prev || []).filter(n => n.id !== note.id))
          try {
            await softDeleteNote(note.id, userId)
            const raw = await AsyncStorage.getItem(NOTES_CACHE_KEY).catch(() => null)
            if (raw) {
              const cached: Note[] = JSON.parse(raw)
              await AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(cached.filter(n => n.id !== note.id))).catch(() => {})
            }
          } catch {
            queryClient.invalidateQueries({ queryKey: ['notes', userId] })
            Alert.alert('Error', 'Could not delete note. Please try again.')
          }
        },
      },
    ])
  }, [userId, queryClient])

  const handleStar = useCallback(async (note: Note) => {
    queryClient.setQueryData<Note[]>(['notes', userId], prev => (prev || []).map(n => n.id === note.id ? { ...n, is_starred: !n.is_starred } : n))
    try { await toggleStar(note.id, note.is_starred) }
    catch { queryClient.invalidateQueries({ queryKey: ['notes', userId] }) }
  }, [userId, queryClient])

  const handleNoteCreated = useCallback((note: Note) => {
    queryClient.setQueryData<Note[]>(['notes', userId], prev => [note, ...(prev || [])])
    router.push(`/notes/${note.id}`)
  }, [userId, queryClient, router])

  const handleNewNote  = useCallback(() => router.push('/notes/new'), [router])
  const handleOpenNote = useCallback((note: Note) => router.push(`/notes/${note.id}`), [router])

  const FILTER_TABS: { key: FilterKey; label: string }[] = [
    { key: 'all',     label: 'All'      },
    { key: 'starred', label: 'Starred'  },
    { key: 'ai',      label: 'AI Notes' },
  ]

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <Ionicons name="book" size={26} color={C.orange} />
            <Text style={s.headerTitle}>My Notes</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.notifBtn} onPress={() => router.push('/notifications')} activeOpacity={0.8}>
              <Ionicons name="notifications-outline" size={20} color={C.textSub} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.85}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
              ) : (
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{userInitial}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={C.textMute} />
          <TextInput
            style={s.searchInput}
            placeholder="Search your knowledge base..."
            placeholderTextColor={C.textMute}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && Platform.OS === 'android' && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={C.textMute} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[s.filterTab, filter === tab.key && s.filterTabActive]}
              onPress={() => setFilter(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterTabText, filter === tab.key && s.filterTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── BODY ── */}
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 110 }]}
      >
        <View style={s.section}>
          <Text style={s.sectionEyebrow}>Quick Actions</Text>

          {filter !== 'ai' && (
            <ScalePress onPress={handleNewNote} style={s.qaCardNew}>
              <View style={s.qaCardIconWrap}>
                <Ionicons name="create-outline" size={26} color={C.orange} />
              </View>
              <Text style={s.qaCardTitle}>New Blank Note</Text>
              <Text style={s.qaCardSub}>Start from a clean slate and build your ideas.</Text>
            </ScalePress>
          )}

          <View style={s.qaAIBorder}>
            <View style={s.qaAICard}>
              <View style={s.qaAIHeader}>
                <Ionicons name="sparkles" size={18} color={C.orange} />
                <Text style={s.qaAITitle}>Generate with AI</Text>
              </View>

              <TouchableOpacity style={s.aiOption} onPress={() => setShowAI(true)} activeOpacity={0.8}>
                <View style={s.aiOptionIcon}>
                  <Ionicons name="sparkles-outline" size={20} color={C.orange} />
                </View>
                <View style={s.aiOptionBody}>
                  <Text style={s.aiOptionTitle}>Generate your notes with AI</Text>
                  <Text style={s.aiOptionSub}>Instant study notes on any topic</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[s.aiOption, { marginBottom: 0 }]} onPress={() => setShowAI(true)} activeOpacity={0.8}>
                <View style={s.aiOptionIcon}>
                  <Ionicons name="clipboard-outline" size={20} color={C.orange} />
                </View>
                <View style={s.aiOptionBody}>
                  <Text style={s.aiOptionTitle}>Paste Text</Text>
                  <Text style={s.aiOptionSub}>Summarize long articles</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.recentHead}>
            <Text style={s.recentTitle}>Recent Notes</Text>
            <TouchableOpacity onPress={() => setShowAllNotes(true)} activeOpacity={0.7} style={s.viewAllBtn}>
              <Text style={s.viewAllText}>View All</Text>
              <Ionicons name="arrow-forward" size={14} color={C.orange} />
            </TouchableOpacity>
          </View>

          {isLoading && notes.length === 0 ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.orange} />
              <Text style={s.loadingText}>Loading notes…</Text>
            </View>
          ) : recentNotes.length === 0 ? (
            <EmptyState onWrite={handleNewNote} onGenerate={() => setShowAI(true)} />
          ) : (
            <View style={s.noteGrid}>
              {recentNotes.map(note => (
                <View key={note.id} style={s.noteCell}>
                  <NoteCard
                    note={note}
                    onPress={() => handleOpenNote(note)}
                    onStar={() => handleStar(note)}
                    onDelete={() => handleDelete(note)}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + 28 }]}
        onPress={handleNewNote}
        activeOpacity={0.88}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <AllNotesModal
        visible={showAllNotes}
        notes={filtered}
        onClose={() => setShowAllNotes(false)}
        onPress={handleOpenNote}
        onStar={handleStar}
        onDelete={handleDelete}
      />

      <AIGeneratorSheet
        visible={showAI}
        onClose={() => setShowAI(false)}
        userId={userId}
        onNoteCreated={handleNoteCreated}
      />
    </View>
  )
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.void },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 22 },

  header: {
    backgroundColor: C.void,
    borderBottomWidth: 1,
    borderBottomColor: C.orange + '1A',
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  headerTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, marginBottom: 18 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notifBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  avatarImg:   { width: 40, height: 40, borderRadius: 20 },
  avatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 14, fontWeight: '700', color: '#fff' },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: C.text },

  filterRow:           { gap: 8, paddingBottom: 4 },
  filterTab:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  filterTabActive:     { backgroundColor: C.orangeDim, borderColor: C.orange + '50' },
  filterTabText:       { fontSize: 12, fontWeight: '600', color: C.textMute },
  filterTabTextActive: { color: C.orange },

  section:        { marginTop: 30 },
  sectionEyebrow: { fontSize: 11, fontWeight: '700', color: C.orange, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 18 },

  qaCardNew:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 22, marginBottom: 14 },
  qaCardIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  qaCardTitle:    { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  qaCardSub:      { fontSize: 13, color: C.textSub, lineHeight: 19 },

  qaAIBorder: { borderRadius: 20, padding: 1.5, backgroundColor: C.orange, marginBottom: 0 },
  qaAICard:   { backgroundColor: C.surface, borderRadius: 19, padding: 20 },
  qaAIHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  qaAITitle:  { fontSize: 18, fontWeight: '700', color: C.text },

  aiOption:      { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  aiOptionIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  aiOptionBody:  { flex: 1 },
  aiOptionTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  aiOptionSub:   { fontSize: 11, color: C.textMute },

  recentHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  recentTitle: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  viewAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { fontSize: 13, fontWeight: '700', color: C.orange },

  noteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  noteCell: { width: '47%' },

  loadingWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 13, color: C.textMute },

  fab: {
    position: 'absolute', right: 22,
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: C.orange,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 18, elevation: 10,
  },
})

const thumb = StyleSheet.create({
  wrap:          { height: 120, position: 'relative', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  overlay:       { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, backgroundColor: 'rgba(0,0,0,0.14)' },
  lines:         { position: 'absolute', top: 18, left: 16, right: 16, gap: 9 },
  line:          { height: 7, borderRadius: 4 },
  aiBadge:       { position: 'absolute', top: 10, right: 10, backgroundColor: C.orange, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  aiBadgeText:   { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
  draftBadge:    { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border },
  draftBadgeText:{ fontSize: 9, fontWeight: '700', color: C.textMute, letterSpacing: 0.8, textTransform: 'uppercase' },
})

const nc = StyleSheet.create({
  card:          { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden' },
  body:          { padding: 14 },
  title:         { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 6, letterSpacing: -0.2 },
  preview:       { fontSize: 12, color: C.textSub, lineHeight: 17, marginBottom: 12 },
  footer:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  footerLeft:    { flexDirection: 'row', gap: 6 },
  footerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  courseTag:     { backgroundColor: C.raised, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  courseTagText: { fontSize: 10, color: C.textMute, fontWeight: '500' },
  timestamp:     { fontSize: 10, color: C.textMute },
})

const em = StyleSheet.create({
  wrap:             { alignItems: 'center', paddingVertical: 48, gap: 12 },
  iconBox:          { width: 72, height: 72, borderRadius: 22, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  title:            { fontSize: 18, fontWeight: '800', color: C.text },
  sub:              { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
  btnRow:           { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnPrimary:       { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  btnPrimaryText:   { fontSize: 13, fontWeight: '800', color: '#fff' },
  btnSecondary:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  btnSecondaryText: { fontSize: 13, fontWeight: '700', color: C.orange },
})

const all = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.void },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 },
  title:     { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  closeBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  count:     { fontSize: 12, color: C.textMute, paddingHorizontal: 22, marginBottom: 16 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 22, paddingBottom: 40 },
  cell:      { width: '47%' },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 15, color: C.textMute },
})

const ai = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:               { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  handleRow:           { alignItems: 'center', marginBottom: 22 },
  handle:              { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header:              { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  headerLeft:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sparkBox:            { width: 40, height: 40, borderRadius: 13, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '35', justifyContent: 'center', alignItems: 'center' },
  title:               { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle:            { fontSize: 13, color: C.textMute, marginTop: 2 },
  closeBtn:            { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  label:               { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  input:               { backgroundColor: C.raised, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  chipRow:             { paddingBottom: 20, gap: 7 },
  chip:                { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.raised },
  chipActive:          { backgroundColor: C.orangeDim, borderColor: C.orange + '40' },
  chipText:            { fontSize: 12, fontWeight: '600', color: C.textMute },
  chipTextActive:      { color: C.orange },
  toggleRow:           { flexDirection: 'row', gap: 8, marginBottom: 20 },
  toggleBtn:           { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  toggleBtnActive:     { backgroundColor: C.orangeDim, borderColor: C.orange + '50' },
  toggleBtnText:       { fontSize: 12, fontWeight: '700', color: C.textMute, textAlign: 'center' },
  toggleBtnTextActive: { color: C.orange },
  colorRow:            { flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  colorDot:            { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  colorDotActive:      { borderWidth: 3, borderColor: '#fff' },
  generateBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 15 },
  generateBtnText:     { fontSize: 15, fontWeight: '800', color: '#fff' },
})
