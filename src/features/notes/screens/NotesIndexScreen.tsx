/**
 * NotesIndexScreen.tsx — Notes Home Screen
 * 
 * Rebuilt for WatermelonDB offline-first architecture.
 */

import { Ionicons } from '@expo/vector-icons'
import database from '@/database'
import { createNote, deleteNote, updateNote } from '@/database/actions'
import { useNotes, usePendingSyncCount } from '@/hooks/useLocalQueries'
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
import { OfflineBanner } from '@/components/OfflineBanner'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

// ─── Design Tokens ───────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function relativeTime(ts: number | Date): string {
  const time = typeof ts === 'number' ? ts : ts.getTime()
  const diff  = Date.now() - time
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function bodyPreview(body: string): string {
  return (body || '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/- /g, '')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 100)
}

// ─── ScalePress ──────────────────────────────────────────────────────────────
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

// ─── Note Thumbnail ──────────────────────────────────────────────────────────
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

// ─── AI Generator Sheet ──────────────────────────────────────────────────────
function AIGeneratorSheet({ visible, onClose, userId, onNoteCreated }: {
  visible: boolean; onClose: () => void; userId: string | null; onNoteCreated: (note: any) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string>(C.orange)
  const insets = useSafeAreaInsets()

  const generate = async () => {
    if (!prompt.trim() || !userId) return
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-notes', {
        body: { prompt, user_id: userId }
      })
      if (error) throw error
      
      const newNote = await createNote(userId, {
        title: data.title || 'AI Generated Note',
        body: data.body || '',
        color: selectedColor,
        source: 'ai'
      })
      
      onNoteCreated(newNote)
      setPrompt('')
      onClose()
    } catch (err: any) {
      Alert.alert('Generation failed', err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={ai.overlay} onPress={onClose}>
        <View style={[ai.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={ai.handleRow}><View style={ai.handle} /></View>
            <View style={ai.header}>
              <View style={ai.headerLeft}>
                <View style={ai.sparkBox}><Ionicons name="sparkles" size={20} color={C.orange} /></View>
                <View>
                  <Text style={ai.title}>AI Note Generator</Text>
                  <Text style={ai.subtitle}>Describe what you want to create</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={ai.closeBtn}>
                <Ionicons name="close" size={20} color={C.textMute} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={ai.input}
              placeholder="e.g. A summary of neuroplasticity..."
              placeholderTextColor={C.textMute}
              multiline
              value={prompt}
              onChangeText={setPrompt}
              autoFocus
            />

            <Text style={ai.label}>Note Color</Text>
            <View style={ai.colorRow}>
              {NOTE_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setSelectedColor(color)}
                  style={[ai.colorDot, { backgroundColor: color }, selectedColor === color && ai.colorDotActive]}
                >
                  {selectedColor === color && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[ai.generateBtn, (!prompt.trim() || loading) && { opacity: 0.5 }]}
              onPress={generate}
              disabled={!prompt.trim() || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={ai.generateBtnText}>Generate Note</Text>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function NotesIndexScreen() {
  const { userId } = useProfileSync()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { isOnline } = useNetworkStatus()
  const pendingCount = usePendingSyncCount()

  const { records: notes, loading } = useNotes(userId || undefined)
  
  const [filter, setFilter] = useState<'all' | 'starred' | 'ai'>('all')
  const [search, setSearch] = useState('')
  const [isGeneratorVisible, setIsGeneratorVisible] = useState(false)

  const filtered = useMemo(() => {
    let base = notes
    if (filter === 'starred') base = base.filter(n => n.isStarred)
    if (filter === 'ai')      base = base.filter(n => n.source === 'ai')
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(n => 
        (n.title || '').toLowerCase().includes(q) || 
        (n.body || '').toLowerCase().includes(q)
      )
    }
    return base
  }, [notes, filter, search])

  const handleDelete = (note: any) => {
    if (!userId) return
    Alert.alert('Delete Note', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNote(note, userId!) }
    ])
  }

  const toggleStarred = (note: any) => {
    if (!userId) return
    updateNote(note, userId!, { 
      title: note.title,
      body: note.body,
      isStarred: !note.isStarred 
    })
  }

  return (
    <View style={s.container}>
      <OfflineBanner />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.title}>My Library</Text>
            <View style={s.syncRow}>
              <View style={[s.dot, { backgroundColor: isOnline ? C.emerald : C.textMute }]} />
              <Text style={s.syncText}>{isOnline ? 'Cloud Synced' : 'Offline Mode'}</Text>
              {pendingCount > 0 && (
                <Text style={s.pendingText}> • {pendingCount} pending</Text>
              )}
            </View>
          </View>
          <TouchableOpacity style={s.searchBtn} onPress={() => setIsGeneratorVisible(true)}>
            <Ionicons name="sparkles" size={20} color={C.orange} />
          </TouchableOpacity>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color={C.textMute} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Search your notes..."
            placeholderTextColor={C.textMute}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {(['all', 'starred', 'ai'] as const).map(f => (
            <TouchableOpacity 
              key={f} 
              onPress={() => setFilter(f)} 
              style={[s.filterChip, filter === f && s.filterChipActive]}
            >
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 100 }]}>
        {loading && notes.length === 0 ? (
          <ActivityIndicator color={C.orange} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color={C.textMute} />
            <Text style={s.emptyText}>No notes found</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {filtered.map((n, i) => (
              <ScalePress 
                key={n.id} 
                style={s.cell}
                onPress={() => router.push({ pathname: '/notes/[id]', params: { id: n.id } })}
              >
                <View style={nc.card}>
                  <NoteThumbnail color={n.color} source={n.source} />
                  <View style={nc.content}>
                    <Text style={nc.title} numberOfLines={1}>{n.title || 'Untitled'}</Text>
                    <Text style={nc.body} numberOfLines={3}>{bodyPreview(n.body)}</Text>
                    <View style={nc.footer}>
                      <Text style={nc.time}>{relativeTime(n.updatedAt)}</Text>
                      <View style={nc.actions}>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleStarred(n); }}>
                          <Ionicons name={n.isStarred ? "star" : "star-outline"} size={16} color={n.isStarred ? C.gold : C.textMute} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(n); }}>
                          <Ionicons name="trash-outline" size={16} color={C.textMute} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              </ScalePress>
            ))}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={[s.fab, { bottom: insets.bottom + 20 }]} 
        onPress={() => router.push('/notes/new')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <AIGeneratorSheet 
        visible={isGeneratorVisible} 
        onClose={() => setIsGeneratorVisible(false)} 
        userId={userId}
        onNoteCreated={(note) => {
          router.push({ pathname: '/notes/[id]', params: { id: note.id } })
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.void },
  header:     { backgroundColor: C.deep, borderBottomWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingBottom: 16 },
  headerTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title:      { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  syncRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot:        { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  syncText:   { fontSize: 11, fontWeight: '600', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.5 },
  pendingText:{ fontSize: 11, fontWeight: '600', color: C.orange },
  searchBtn:  { width: 44, height: 44, borderRadius: 14, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  searchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 14, height: 48, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  searchIcon: { marginRight: 10 },
  searchInput:{ flex: 1, fontSize: 15, color: C.text },
  filterRow:  { gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.orange, borderColor: C.orange },
  filterText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  filterTextActive: { color: '#fff' },
  list:       { padding: 20 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 },
  cell:       { width: '47%' },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyText:  { fontSize: 15, color: C.textMute },
  fab:        { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
})

const nc = StyleSheet.create({
  card:       { backgroundColor: C.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  content:    { padding: 12 },
  title:      { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  body:       { fontSize: 13, color: C.textSub, lineHeight: 18, marginBottom: 10 },
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderColor: C.border },
  time:       { fontSize: 11, color: C.textMute },
  actions:    { flexDirection: 'row', gap: 10 },
})

const thumb = StyleSheet.create({
  wrap:       { height: 80, padding: 12, overflow: 'hidden' },
  overlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.05)' },
  lines:      { gap: 6 },
  line:       { height: 4, borderRadius: 2 },
  aiBadge:    { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  aiBadgeText:{ fontSize: 8, fontWeight: '800', color: '#fff', textTransform: 'uppercase' },
  draftBadge: { backgroundColor: 'rgba(232,105,42,0.2)' },
  draftBadgeText: { color: C.orange },
})

const ai = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:               { backgroundColor: C.surface, position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
  handleRow:           { alignItems: 'center', marginBottom: 22 },
  handle:              { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  header:              { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 },
  headerLeft:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sparkBox:            { width: 40, height: 40, borderRadius: 13, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '35', justifyContent: 'center', alignItems: 'center' },
  title:               { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  subtitle:            { fontSize: 13, color: C.textMute, marginTop: 2 },
  closeBtn:            { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  label:               { fontSize: 11, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  input:               { backgroundColor: C.raised, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 20, minHeight: 80, textAlignVertical: 'top' },
  colorRow:            { flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  colorDot:            { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  colorDotActive:      { borderWidth: 2, borderColor: '#fff' },
  generateBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 15 },
  generateBtnText:     { fontSize: 15, fontWeight: '800', color: '#fff' },
})
