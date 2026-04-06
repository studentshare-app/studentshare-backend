/**
 * app/notes/[id].tsx
 * Note Editor + Viewer
 *
 * - id = 'new'  → blank note, auto-save on exit
 * - id = <uuid> → load existing note, edit in place
 * - Formatting toolbar: bold · italic · heading · bullets
 * - Course linker, color picker, star toggle in header
 * - Auto-saves to Supabase on blur / back navigation
 * - Offline: queues writes to AsyncStorage, syncs on reconnect
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
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
import { useProfileSync } from '@/hooks/useProfileSync'
import { supabase } from '@/lib/supabase'
// ─────────────────────────────────────────────
// Note type (duplicated here to avoid same-folder
// import issues with Expo Router's file-based routing)
// ─────────────────────────────────────────────
type Note = {
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

// ─────────────────────────────────────────────
// Design tokens (mirror index.tsx)
// ─────────────────────────────────────────────
const C = {
  void:      '#08090C',
  deep:      '#0C0E14',
  surface:   '#111318',
  raised:    '#161A22',
  border:    '#1E2330',
  text:      '#EEF0F6',
  textSub:   '#8B93A8',
  textMute:  '#4A5168',
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
} as const

const NOTE_COLORS = [
  '#FF7B7B', '#5B8DEF', '#44D4A0', '#A78BFA',
  '#F0C060', '#38BDF8', '#FB923C', '#E879F9',
]

const NOTES_CACHE_KEY = 'studentshare_notes_cache'
const NOTES_QUEUE_KEY = 'studentshare_notes_queue'

// ─────────────────────────────────────────────
// Markdown formatting helpers
// ─────────────────────────────────────────────
function wrapSelection(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
  suffix: string = prefix,
): { newText: string; newStart: number; newEnd: number } {
  const selected = text.slice(selStart, selEnd)
  const before   = text.slice(0, selStart)
  const after    = text.slice(selEnd)
  const newText  = before + prefix + selected + suffix + after
  return {
    newText,
    newStart: selStart + prefix.length,
    newEnd:   selEnd   + prefix.length,
  }
}

function insertAtLineStart(
  text: string,
  selStart: number,
  marker: string,
): { newText: string; newStart: number; newEnd: number } {
  const lineStart = text.lastIndexOf('\n', selStart - 1) + 1
  const before    = text.slice(0, lineStart)
  const rest      = text.slice(lineStart)
  // Toggle: if line already starts with marker, remove it
  if (rest.startsWith(marker)) {
    const newText = before + rest.slice(marker.length)
    return { newText, newStart: selStart - marker.length, newEnd: selStart - marker.length }
  }
  const newText = before + marker + rest
  return { newText, newStart: selStart + marker.length, newEnd: selStart + marker.length }
}

// ─────────────────────────────────────────────
// Save to Supabase (upsert)
// ─────────────────────────────────────────────
async function saveNote(note: Partial<Note> & { user_id: string }): Promise<Note | null> {
  const payload = {
    user_id:    note.user_id,
    title:      note.title      || '',
    body:       note.body       || '',
    color:      note.color      || '#FF7B7B',
    is_starred: note.is_starred ?? false,
    source:     note.source     || 'manual',
    course_id:  note.course_id  || null,
    is_deleted: false,
    updated_at: new Date().toISOString(),
  }

  if (note.id && note.id !== 'new') {
    const { data, error } = await supabase
      .from('notes')
      .update(payload)
      .eq('id', note.id)
      .select('id, user_id, title, body, color, is_starred, source, course_id, is_deleted, created_at, updated_at')
      .single()
    if (error) throw error
    return data as Note
  } else {
    const { data, error } = await supabase
      .from('notes')
      .insert(payload)
      .select('id, user_id, title, body, color, is_starred, source, course_id, is_deleted, created_at, updated_at')
      .single()
    if (error) throw error
    return data as Note
  }
}

async function queueOfflineWrite(note: Partial<Note> & { user_id: string }) {
  try {
    const raw = await AsyncStorage.getItem(NOTES_QUEUE_KEY)
    const queue: any[] = raw ? JSON.parse(raw) : []
    const existing = queue.findIndex(q => q.note_id === note.id)
    const entry = { operation: 'upsert', note_id: note.id || 'new', payload: note, queued_at: Date.now() }
    if (existing >= 0) queue[existing] = entry
    else queue.push(entry)
    await AsyncStorage.setItem(NOTES_QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

// ─────────────────────────────────────────────
// Formatting toolbar button
// ─────────────────────────────────────────────
function ToolbarBtn({
  icon, label, onPress, active = false,
}: {
  icon: string; label: string; onPress: () => void; active?: boolean
}) {
  const scale = useRef(new Animated.Value(1)).current
  const onIn  = () => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 50, bounciness: 5 }).start()

  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[
        tb.btn,
        active && tb.btnActive,
        { transform: [{ scale }] },
      ]}>
        <Text style={[tb.icon, active && { color: C.coral }]}>{icon}</Text>
      </Animated.View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────
// MAIN EDITOR SCREEN
// ─────────────────────────────────────────────
export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { userId, isOnline } = useProfileSync()
  const queryClient = useQueryClient()

  const isNew = id === 'new'

  const [title,     setTitle]     = useState('')
  const [body,      setBody]      = useState('')
  const [color,     setColor]     = useState('#FF7B7B')
  const [isStarred, setIsStarred] = useState(false)
  const [source,    setSource]    = useState<'manual' | 'ai'>('manual')
  const [courseId,  setCourseId]  = useState<string | null>(null)
  const [courseName,setCourseName]= useState<string | null>(null)
  const [courses,   setCourses]   = useState<{ id: string; name: string }[]>([])
  const [loading,   setLoading]   = useState(!isNew)
  const [saving,    setSaving]    = useState(false)
  const [noteId,    setNoteId]    = useState<string | null>(isNew ? null : id)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showCoursePicker,setShowCoursePicker]= useState(false)

  const bodyRef        = useRef<TextInput>(null)
  const selStart       = useRef(0)
  const selEnd         = useRef(0)
  const isDirty        = useRef(false)
  const savedOnce      = useRef(false)
  const debounceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestTitle    = useRef('')
  const latestBody     = useRef('')
  const latestColor    = useRef('#FF7B7B')
  const latestStarred  = useRef(false)
  const latestCourseId = useRef<string | null>(null)
  const latestNoteId   = useRef<string | null>(null)

  // Keep latest-value refs in sync so the debounce callback always
  // has fresh data without needing to be re-created on every keystroke
  latestTitle.current    = title
  latestBody.current     = body
  latestColor.current    = color
  latestStarred.current  = isStarred
  latestCourseId.current = courseId
  latestNoteId.current   = noteId

  // Load existing note
  useEffect(() => {
    if (isNew) { setLoading(false); return }
    const load = async () => {
      // Try cache first
      try {
        const raw = await AsyncStorage.getItem(NOTES_CACHE_KEY)
        if (raw) {
          const cached: Note[] = JSON.parse(raw)
          const found = cached.find(n => n.id === id)
          if (found) {
            setTitle(found.title)
            setBody(found.body)
            setColor(found.color)
            setIsStarred(found.is_starred)
            setSource(found.source)
            setCourseId(found.course_id)
            setCourseName(found.course_name || null)
            setLoading(false)
          }
        }
      } catch {}

      // Then fetch fresh from Supabase
      try {
        const { data } = await supabase
          .from('notes')
          .select('id, user_id, title, body, color, is_starred, source, course_id, is_deleted, created_at, updated_at, courses(name)')
          .eq('id', id)
          .single()
        if (data) {
          setTitle((data as any).title)
          setBody((data as any).body)
          setColor((data as any).color)
          setIsStarred((data as any).is_starred)
          setSource((data as any).source)
          setCourseId((data as any).course_id)
          setCourseName((data as any).courses?.name || null)
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [id, isNew])

  // Load courses for picker
  useEffect(() => {
    if (!userId) return
    supabase.from('courses').select('id, name').limit(30)
      .then(({ data }: { data: any }) => setCourses(data || []))
  }, [userId])

  // ── Core save function — always uses latest refs, stable identity ──
  const handleSave = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return
    const currentTitle = latestTitle.current
    const currentBody  = latestBody.current
    if (!currentTitle.trim() && !currentBody.trim()) return

    setSaving(true)
    const payload = {
      id:         latestNoteId.current || undefined,
      user_id:    userId,
      title:      currentTitle.trim() || 'Untitled',
      body:       currentBody,
      color:      latestColor.current,
      is_starred: latestStarred.current,
      source,
      course_id:  latestCourseId.current,
    }

    try {
      if (isOnline) {
        const saved = await saveNote(payload)
        if (saved) {
          latestNoteId.current = saved.id
          setNoteId(saved.id)
          savedOnce.current = true
          isDirty.current   = false
          const raw = await AsyncStorage.getItem(NOTES_CACHE_KEY).catch(() => null)
          const cached: Note[] = raw ? JSON.parse(raw) : []
          const idx = cached.findIndex(n => n.id === saved.id)
          const updated = { ...saved, course_name: courseName }
          if (idx >= 0) cached[idx] = updated
          else cached.unshift(updated)
          await AsyncStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(cached)).catch(() => {})

          queryClient.setQueryData<Note[]>(['notes', userId], prev => {
            const next = prev ? [...prev] : []
            const existingIndex = next.findIndex(n => n.id === saved.id)
            if (existingIndex >= 0) {
              next[existingIndex] = updated
            } else {
              next.unshift(updated)
            }
            return next
          })
        }
      } else {
        await queueOfflineWrite(payload)
        isDirty.current = false
        if (!opts?.silent) Alert.alert('Saved offline', 'Your note will sync when you reconnect.')
      }
    } catch (e: any) {
      if (!opts?.silent) Alert.alert('Save failed', e?.message || 'Could not save note.')
    } finally {
      setSaving(false)
    }
  }, [userId, source, courseName, isOnline])

  // Mark dirty + schedule debounced auto-save (1.5s after last keystroke)
  useEffect(() => {
    isDirty.current = true
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      if (isDirty.current) handleSave({ silent: true })
    }, 1500)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [title, body, color, isStarred, courseId])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (isDirty.current) handleSave({ silent: true })
    }
  }, [handleSave])

  // ── Formatting actions ───────────────────────
  function applyFormat(type: 'bold' | 'italic' | 'h2' | 'bullet') {
    const s = selStart.current
    const e = selEnd.current
    let result: { newText: string; newStart: number; newEnd: number }

    switch (type) {
      case 'bold':   result = wrapSelection(body, s, e, '**');   break
      case 'italic': result = wrapSelection(body, s, e, '*');    break
      case 'h2':     result = insertAtLineStart(body, s, '## '); break
      case 'bullet': result = insertAtLineStart(body, s, '- ');  break
    }

    setBody(result.newText)
    // Re-focus and restore selection after state update
    setTimeout(() => {
      bodyRef.current?.focus()
      bodyRef.current?.setNativeProps({
        selection: { start: result.newStart, end: result.newEnd },
      })
    }, 50)
  }

  const handleBack = useCallback(async () => {
    if (isDirty.current && (title.trim() || body.trim())) {
      await handleSave({ silent: true })
    }

    // Ensure notes list refreshes immediately after returning
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] })
    }

    router.back()
  }, [handleSave, router, title, body, queryClient, userId])

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.coral} />
      </View>
    )
  }

  const accentDim = color + '12'

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={handleBack} style={s.headerBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={19} color={C.textSub} />
        </TouchableOpacity>

        <View style={s.headerMeta}>
          {/* Color dot */}
          <TouchableOpacity
            style={[s.colorDotBtn, { backgroundColor: color }]}
            onPress={() => { setShowColorPicker(p => !p); setShowCoursePicker(false) }}
            activeOpacity={0.85}
          />

          {/* Source badge */}
          {source === 'ai' && (
            <View style={s.aiBadge}>
              <Text allowFontScaling={false} style={s.aiBadgeText}>✦ AI</Text>
            </View>
          )}

          {/* Course pill */}
          <TouchableOpacity
            style={[s.coursePill, courseId && { backgroundColor: C.sapphDim, borderColor: C.sapphire + '35' }]}
            onPress={() => { setShowCoursePicker(p => !p); setShowColorPicker(false) }}
            activeOpacity={0.8}
          >
            <Ionicons name="book-outline" size={11} color={courseId ? C.sapphire : C.textMute} />
            <Text style={[s.coursePillText, courseId && { color: C.sapphire }]} numberOfLines={1}>
              {courseName || 'Course'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.headerRight}>
          {/* Star */}
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => setIsStarred(p => !p)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isStarred ? 'star' : 'star-outline'}
              size={20}
              color={isStarred ? C.gold : C.textMute}
            />
          </TouchableOpacity>

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => handleSave()}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving
              ? <ActivityIndicator size="small" color={C.void} />
              : <Text style={s.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Color picker dropdown */}
      {showColorPicker && (
        <View style={s.colorPickerRow}>
          {NOTE_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[s.colorPickerDot, { backgroundColor: c }, color === c && s.colorPickerDotActive]}
              onPress={() => { setColor(c); setShowColorPicker(false) }}
              activeOpacity={0.85}
            >
              {color === c && <Ionicons name="checkmark" size={12} color="#fff" />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Course picker dropdown */}
      {showCoursePicker && (
        <ScrollView
          style={s.courseDropdown}
          contentContainerStyle={{ gap: 2 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <TouchableOpacity
            style={[s.courseOption, !courseId && s.courseOptionActive]}
            onPress={() => { setCourseId(null); setCourseName(null); setShowCoursePicker(false) }}
          >
            <Text style={[s.courseOptionText, !courseId && { color: C.sapphire }]}>No course</Text>
          </TouchableOpacity>
          {courses.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[s.courseOption, courseId === c.id && s.courseOptionActive]}
              onPress={() => { setCourseId(c.id); setCourseName(c.name); setShowCoursePicker(false) }}
            >
              <Text style={[s.courseOptionText, courseId === c.id && { color: C.sapphire }]}
                numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Color accent bar */}
      <View style={[s.accentBar, { backgroundColor: color }]} />

      {/* Editor area */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <TextInput
          style={s.titleInput}
          placeholder="Note title…"
          placeholderTextColor={C.textMute}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          returnKeyType="next"
          onSubmitEditing={() => bodyRef.current?.focus()}
          multiline={false}
        />

        {/* Divider */}
        <View style={s.divider} />

        {/* Body */}
        <TextInput
          ref={bodyRef}
          style={s.bodyInput}
          placeholder={
            source === 'ai'
              ? 'AI-generated content. Tap to edit…'
              : 'Start writing…\n\nTip: use the toolbar below to format with bold, bullets, and headings.'
          }
          placeholderTextColor={C.textMute}
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
          onSelectionChange={({ nativeEvent: { selection } }) => {
            selStart.current = selection.start
            selEnd.current   = selection.end
          }}
        />
      </ScrollView>

      {/* Formatting toolbar */}
      <View style={[s.toolbar, { paddingBottom: insets.bottom + 8 }]}>
        <ToolbarBtn icon="B" label="Bold"    onPress={() => applyFormat('bold')}   />
        <ToolbarBtn icon="I" label="Italic"  onPress={() => applyFormat('italic')} />
        <ToolbarBtn icon="H" label="Heading" onPress={() => applyFormat('h2')}     />
        <ToolbarBtn icon="•" label="Bullet"  onPress={() => applyFormat('bullet')} />
        <View style={s.toolbarSpacer} />
        <Text allowFontScaling={false} style={s.wordCount}>
          {body.trim().split(/\s+/).filter(Boolean).length} words
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.void },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  headerBtn:      { width: 36, height: 36, borderRadius: 11, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  headerMeta:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },

  colorDotBtn:    { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', flexShrink: 0 },

  aiBadge:        { backgroundColor: C.lavDim, borderWidth: 1, borderColor: C.lavender + '30', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  aiBadgeText:    { fontSize: 10, fontWeight: '700', color: C.lavender },

  coursePill:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 140 },
  coursePillText: { fontSize: 11, fontWeight: '600', color: C.textMute, flexShrink: 1 },

  saveBtn:     { backgroundColor: C.coral, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: C.void },

  colorPickerRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  colorPickerDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  colorPickerDotActive: { borderWidth: 2.5, borderColor: '#fff' },

  courseDropdown:    { maxHeight: 180, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16, paddingVertical: 8 },
  courseOption:      { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 },
  courseOptionActive:{ backgroundColor: C.sapphDim },
  courseOptionText:  { fontSize: 13, fontWeight: '600', color: C.textSub },

  accentBar:   { height: 2, width: '100%' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  titleInput:  { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.6, lineHeight: 30, marginBottom: 14 },
  divider:     { height: 1, backgroundColor: C.border, marginBottom: 16 },
  bodyInput:   { fontSize: 15, color: C.textSub, lineHeight: 24, minHeight: 300 },

  toolbar:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingTop: 10, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  toolbarSpacer:{ flex: 1 },
  wordCount:    { fontSize: 11, color: C.textMute, paddingRight: 4 },
})

const tb = StyleSheet.create({
  btn:       { width: 38, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: C.raised },
  btnActive: { backgroundColor: C.coralDim },
  icon:      { fontSize: 14, fontWeight: '800', color: C.textSub },
})
