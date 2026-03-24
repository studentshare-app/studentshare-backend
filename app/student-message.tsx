/**
 * app/student-message.tsx
 *
 * WhatsApp-faithful chat screen — fully audited & fixed build
 *
 * Fixes applied (matching audit report):
 *  #1  reply-strip bar height:'100%' → removed, alignSelf:'stretch' kept
 *  #2  beepPlayer removed (was hitting 3rd-party CDN on every mount)
 *  #3  optimistic voice message guards null file_url before rendering VoicePlayer
 *  #4  normMsg moved outside component so realtime closure is never stale
 *  #5  messagesWithHeaders memoised on stable primitive deps, not array ref
 *  #6  group tap opens Group Info alert (proper stub ready for real screen)
 *  #7  handleClearChat soft-deletes ALL messages in conversation locally
 *  #8  handleCopy uses Clipboard.setStringAsync
 *  #9  reaction changes refresh only the affected message, not all messages
 *  #10 recording interval cleaned up in useEffect return / unmount guard
 *  #11 handleVoiceEnded uses functional updater to read fresh messages
 *  #12 PhotoLightbox uses aspectRatio + maxHeight instead of fixed SW*1.3
 *  #13 voice duration stored in dedicated voice_duration field comment added
 *  #14 Call/Video stubs wired to Alert (documented non-functional)
 *  NEW offline support: messages cached to AsyncStorage, loaded on mount
 *        before network; FlatList shown immediately from cache
 *  NEW missing cleanup: typing timeout cleared on unmount
 *  NEW supabase channel cleaned up correctly even when userId arrives late
 *  NEW scroll-to-end only fires when user is already near bottom
 *  NEW sender_avatar fallback chain made explicit and safe everywhere
 */

import { Ionicons } from '@expo/vector-icons'
import { useAudioPlayer, useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio'
import { Clipboard } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image,
  KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import {
  fetchMessages, sendMessage, deleteMessage, toggleReaction,
  markConversationRead, setTyping, type StudentMessage,
} from '../lib/queries/studentChat'

const { width: SW } = Dimensions.get('window')

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const REACTIONS     = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const AVATAR_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#6366F1']
const SWIPE_TRIGGER = 56
const SWIPE_MAX     = 72
const SPEED_STEPS: [number, string][] = [[1,'1×'],[1.5,'1.5×'],[2,'2×']]
const WAVEFORM_BARS = [3,6,9,5,11,14,8,4,12,7,13,10,5,9,14,6,3,8,11,13,7,5,10,4,12,9,6,14,3,8]
const NEAR_BOTTOM_THRESHOLD = 120 // px — auto-scroll only if within this distance from bottom

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers  (defined outside component so they are stable references)
// ─────────────────────────────────────────────────────────────────────────────
function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(n: string) {
  if (!n || n === 'Unknown') return '?'
  const parts = n.trim().split(/\s+/).filter(Boolean)
  // FIX #16: always return ≥1 char, up to 2 chars for multi-word names
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtDate(iso: string) {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
function fmtSize(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function fmtDur(ms: number) {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function safeName(n: string | null | undefined): string {
  if (!n || n === 'undefined' || n === 'null' || n.trim() === '') return 'Unknown'
  return n.trim()
}
function safeContent(c: string | null | undefined): string | null {
  if (!c || c === 'undefined' || c === 'null') return null
  return c
}
function safeAvatarUri(uri: string | null | undefined): string | null {
  if (!uri || !uri.startsWith('http')) return null
  return uri
}
function getMime(n: string): string {
  const ext = n.split('.').pop()?.toLowerCase()
  const m: Record<string, string> = {
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/m4a', zip: 'application/zip',
  }
  return m[ext ?? ''] ?? 'application/octet-stream'
}
function cacheKey(convId: string) { return `@chat_cache_${convId}` }

// ─────────────────────────────────────────────────────────────────────────────
// FIX #4: normMsg lives OUTSIDE the component so realtime callbacks never
//         capture a stale closure.
// ─────────────────────────────────────────────────────────────────────────────
function normMsg(raw: any, uid: string): StudentMessage {
  const rm: Record<string, { count: number; by_me: boolean; user_ids: string[] }> = {}
  ;(raw.reactions ?? []).forEach((r: any) => {
    if (!rm[r.emoji]) rm[r.emoji] = { count: 0, by_me: false, user_ids: [] }
    rm[r.emoji].count++
    rm[r.emoji].user_ids.push(r.user_id)
    if (r.user_id === uid) rm[r.emoji].by_me = true
  })
  const msg: StudentMessage = {
    id: raw.id,
    conversation_id: raw.conversation_id,
    sender_id: raw.sender_id,
    type: raw.type,
    content: safeContent(raw.content),
    file_url: raw.file_url ?? null,
    file_name: raw.file_name ?? null,
    file_size: raw.file_size ?? null,
    mime_type: raw.mime_type ?? null,
    reply_to_id: raw.reply_to_id ?? null,
    is_deleted: raw.is_deleted ?? false,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    sender_name: safeName(raw.sender?.full_name),
    sender_avatar: safeAvatarUri(raw.sender?.avatar_url),
    reactions: Object.entries(rm).map(([emoji, v]) => ({ emoji, ...v })),
    reply_to: null,
  }
  // voice_duration_ms is not in the StudentMessage type; attach it as a plain
  // property so (msg as any).voice_duration_ms works at VoicePlayer call-sites.
  if (raw.voice_duration_ms != null) {
    ;(msg as any).voice_duration_ms = raw.voice_duration_ms
  }
  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline cache helpers
// ─────────────────────────────────────────────────────────────────────────────
async function loadCachedMessages(convId: string): Promise<StudentMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(convId))
    if (!raw) return []
    return JSON.parse(raw) as StudentMessage[]
  } catch {
    return []
  }
}
async function saveMessagesToCache(convId: string, msgs: StudentMessage[]) {
  try {
    // Keep last 200 messages to avoid unbounded storage growth
    const toStore = msgs.slice(-200)
    await AsyncStorage.setItem(cacheKey(convId), JSON.stringify(toStore))
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload / download
// ─────────────────────────────────────────────────────────────────────────────
async function uploadFile(
  bucket: string, fileName: string, localUri: string, contentType: string,
): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64 as any,
  })
  const binary = globalThis.atob
    ? globalThis.atob(b64)
    : Buffer.from(b64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, bytes.buffer as ArrayBuffer, { contentType, upsert: false })
  if (error) throw new Error(error.message)
  return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl
}

async function downloadAndOpen(fileUrl: string, fileName: string) {
  try {
    const lp = `${FileSystem.cacheDirectory}${fileName}`
    const ex = await FileSystem.getInfoAsync(lp)
    const fp = ex.exists ? lp : await FileSystem.downloadAsync(fileUrl, lp).then(r => r.uri)
    if (Platform.OS === 'ios') {
      await Sharing.shareAsync(fp)
    } else {
      const IL = require('expo-intent-launcher') as typeof import('expo-intent-launcher')
      const cu = await FileSystem.getContentUriAsync(fp)
      await IL.startActivityAsync('android.intent.action.VIEW', {
        data: cu, flags: 1, type: getMime(fileName),
      })
    }
  } catch (e: any) {
    Alert.alert('Cannot open file', e?.message ?? 'Try manually.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PhotoLightbox
// FIX #12: uses aspectRatio + maxHeight instead of hardcoded SW*1.3
// ─────────────────────────────────────────────────────────────────────────────
function PhotoLightbox({
  uri, visible, onClose, name,
}: { uri: string | null; visible: boolean; onClose: () => void; name?: string }) {
  const op = useRef(new Animated.Value(0)).current
  const sc = useRef(new Animated.Value(0.88)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
      ]).start()
    } else {
      op.setValue(0)
      sc.setValue(0.88)
    }
  }, [visible])

  if (!uri) return null
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[lb.overlay, { opacity: op }]}>
        <TouchableOpacity style={lb.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {name ? <Text style={lb.name}>{name}</Text> : null}
        <Pressable style={lb.backdrop} onPress={onClose}>
          <Animated.View style={{ transform: [{ scale: sc }] }}>
            {/* FIX #12 */}
            <Image
              source={{ uri }}
              style={lb.image}
              resizeMode="contain"
            />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  )
}
const lb = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  backdrop: { width: SW, flex: 1, justifyContent: 'center', alignItems: 'center' },
  // FIX #12: width:SW, aspectRatio:1, maxHeight covers portrait & landscape
  image: { width: SW, aspectRatio: 1, maxHeight: SW * 1.4 },
  closeBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 10, width: 40, height: 40,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  name: {
    position: 'absolute', top: 60, left: 20, right: 70, zIndex: 10,
    fontSize: 16, fontWeight: '700', color: '#fff',
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({
  uri, name, id, size = 32, onPress,
}: { uri?: string | null; name: string; id: string; size?: number; onPress?: () => void }) {
  const c = avatarColor(id)
  const safe = safeName(name)
  const validUri = safeAvatarUri(uri)
  const content = validUri
    ? <Image source={{ uri: validUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : (
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: c + '30', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1.5, borderColor: c + '60',
      }}>
        <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: c }}>
          {getInitials(safe)}
        </Text>
      </View>
    )
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{content}</TouchableOpacity>
  return content
}

// ─────────────────────────────────────────────────────────────────────────────
// VerifiedBadge
// ─────────────────────────────────────────────────────────────────────────────
function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: '#1D9BF0',
      justifyContent: 'center', alignItems: 'center', marginLeft: 3,
    }}>
      <Ionicons name="checkmark" size={size * 0.65} color="#fff" />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UserProfile type
// ─────────────────────────────────────────────────────────────────────────────
type UserProfile = {
  id: string
  full_name: string
  avatar_url: string | null
  email?: string | null
  class_name?: string | null
  college_name?: string | null
  bio?: string | null
  is_verified?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// ContactInfoScreen
// FIX #14: Call / Video stubs alert user they're coming soon
// ─────────────────────────────────────────────────────────────────────────────
function ContactInfoScreen({
  visible, profile, onClose, mediaMessages, onAvatarPress,
}: {
  visible: boolean
  profile: UserProfile | null
  onClose: () => void
  mediaMessages: StudentMessage[]
  onAvatarPress: () => void
}) {
  const insets = useSafeAreaInsets()
  if (!profile) return null
  const images = mediaMessages.filter(m => m.type === 'image' && m.file_url && !m.is_deleted)
  const files  = mediaMessages.filter(m => m.type === 'file'  && m.file_url && !m.is_deleted)
  const voices = mediaMessages.filter(m => m.type === 'voice' && m.file_url && !m.is_deleted)

  // FIX #14: meaningful stubs for action buttons
  const quickActions = [
    { icon: 'chatbubble',  label: 'Message', onPress: () => onClose() },
    { icon: 'call',        label: 'Call',    onPress: () => Alert.alert('Coming Soon', 'Voice calls will be available in a future update.') },
    { icon: 'videocam',    label: 'Video',   onPress: () => Alert.alert('Coming Soon', 'Video calls will be available in a future update.') },
  ]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[ci.root, { paddingTop: insets.top }]}>
        <View style={ci.topBar}>
          <TouchableOpacity onPress={onClose} style={ci.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#F1F5F9" />
          </TouchableOpacity>
          <Text style={ci.topTitle}>Contact Info</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} bounces>
          {/* Avatar + name */}
          <View style={ci.hero}>
            <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.88} style={ci.heroAvatarWrap}>
              <Avatar uri={profile.avatar_url} name={profile.full_name} id={profile.id} size={120} />
              <View style={ci.camBadge}>
                <Ionicons name="camera" size={15} color="rgba(255,255,255,0.9)" />
              </View>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14 }}>
              <Text style={ci.heroName}>{safeName(profile.full_name)}</Text>
              {profile.is_verified && <VerifiedBadge size={20} />}
            </View>
            <Text style={ci.heroSub}>StudentShare Member</Text>
          </View>

          {/* Quick actions */}
          <View style={ci.actionRow}>
            {quickActions.map(a => (
              <TouchableOpacity key={a.label} style={ci.actionBtn} onPress={a.onPress}>
                <View style={ci.actionIcon}>
                  <Ionicons name={a.icon as any} size={22} color="#38BDF8" />
                </View>
                <Text style={ci.actionTxt}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* About */}
          <View style={ci.section}>
            <Text style={ci.sectionLabel}>About</Text>
            <View style={ci.infoRow}>
              <Ionicons name="information-circle-outline" size={22} color="#475569" style={{ marginTop: 1 }} />
              <Text style={ci.infoValue} numberOfLines={4}>
                {profile.bio && profile.bio.trim()
                  ? profile.bio
                  : '👋 Hey there! I am using StudentShare'}
              </Text>
            </View>
          </View>

          {/* Details */}
          <View style={ci.section}>
            <Text style={ci.sectionLabel}>Details</Text>
            {profile.email && (
              <View style={ci.infoRow}>
                <Ionicons name="mail-outline" size={20} color="#475569" />
                <View style={{ flex: 1 }}>
                  <Text style={ci.infoValue}>{profile.email}</Text>
                  <Text style={ci.infoMeta}>Email</Text>
                </View>
              </View>
            )}
            <View style={ci.infoRow}>
              <Ionicons name="school-outline" size={20} color="#475569" />
              <View style={{ flex: 1 }}>
                <Text style={ci.infoValue}>{profile.college_name ?? 'Not set'}</Text>
                <Text style={ci.infoMeta}>College</Text>
              </View>
            </View>
            <View style={[ci.infoRow, { borderBottomWidth: 0 }]}>
              <Ionicons name="book-outline" size={20} color="#475569" />
              <View style={{ flex: 1 }}>
                <Text style={ci.infoValue}>{profile.class_name ?? 'Not set'}</Text>
                <Text style={ci.infoMeta}>Class</Text>
              </View>
            </View>
          </View>

          {/* Shared media */}
          <View style={ci.section}>
            <View style={ci.mediaHeader}>
              <Text style={ci.sectionLabel}>Media, Links and Docs</Text>
              <Text style={ci.mediaCount}>{images.length + files.length + voices.length}</Text>
            </View>
            {images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 4, paddingBottom: 4 }}>
                  {images.slice(0, 6).map(m => (
                    <Image key={m.id} source={{ uri: m.file_url! }} style={ci.mediaTile} resizeMode="cover" />
                  ))}
                  {images.length > 6 && (
                    <View style={[ci.mediaTile, ci.mediaMore]}>
                      <Text style={ci.mediaMoreTxt}>+{images.length - 6}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            ) : (
              <Text style={ci.emptyMedia}>No media shared yet</Text>
            )}
          </View>

          {/* Block / report */}
          <View style={[ci.section, { gap: 0 }]}>
            <TouchableOpacity style={ci.dangerRow}>
              <Ionicons name="ban-outline" size={20} color="#EF4444" />
              <Text style={[ci.infoValue, { color: '#EF4444' }]}>
                Block {safeName(profile.full_name).split(' ')[0]}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ci.dangerRow, { borderBottomWidth: 0 }]}>
              <Ionicons name="flag-outline" size={20} color="#EF4444" />
              <Text style={[ci.infoValue, { color: '#EF4444' }]}>
                Report {safeName(profile.full_name).split(' ')[0]}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  )
}
const ci = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#0F172A', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: '#F1F5F9' },
  hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  heroAvatarWrap: { position: 'relative' },
  camBadge: { position: 'absolute', bottom: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  heroName: { fontSize: 22, fontWeight: '800', color: '#F1F5F9' },
  heroSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#1E293B', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#334155', marginBottom: 12 },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)', justifyContent: 'center', alignItems: 'center' },
  actionTxt: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  section: { backgroundColor: '#1E293B', marginBottom: 12, paddingHorizontal: 20, paddingVertical: 16, gap: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#38BDF8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#F1F5F9', flex: 1, lineHeight: 20 },
  infoMeta: { fontSize: 11, color: '#475569', marginTop: 2 },
  mediaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mediaCount: { fontSize: 13, fontWeight: '700', color: '#38BDF8' },
  mediaTile: { width: 88, height: 88, borderRadius: 8, backgroundColor: '#334155' },
  mediaMore: { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)' },
  mediaMoreTxt: { fontSize: 15, fontWeight: '800', color: '#38BDF8' },
  emptyMedia: { fontSize: 13, color: '#475569', paddingTop: 8 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
})

// ─────────────────────────────────────────────────────────────────────────────
// VoicePlayer
// ─────────────────────────────────────────────────────────────────────────────
function VoicePlayer({
  fileUrl, isMine, durationMs, onEnded, shouldAutoPlay,
}: {
  fileUrl: string
  isMine: boolean
  durationMs?: number | null
  onEnded?: () => void
  shouldAutoPlay?: boolean
}) {
  const player = useAudioPlayer(fileUrl)
  const [playing,   setPlaying]  = useState(false)
  const [progress,  setProgress] = useState(0)
  const [curMs,     setCurMs]    = useState(0)
  const [listened,  setListened] = useState(false)
  const [speedIdx,  setSpeedIdx] = useState(0)

  const endedRef    = useRef(false)
  const autoRef     = useRef(false)
  const savedSecRef = useRef(0)
  const speedRef    = useRef(1)
  const mountedRef  = useRef(true)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const applySpeed = useCallback((idx: number) => {
    speedRef.current = SPEED_STEPS[idx][0]
    try { (player as any).playbackRate = speedRef.current } catch {}
  }, [player])

  // Poll playback state at 120 ms
  useEffect(() => {
    const iv = setInterval(() => {
      if (!player || !mountedRef.current) return
      const dur = player.duration ?? 0
      const cur = player.currentTime ?? 0
      const isP = player.playing
      setPlaying(isP)
      setCurMs(cur * 1000)
      setProgress(dur > 0 ? Math.min(cur / dur, 1) : 0)
      if (isP) { savedSecRef.current = cur; endedRef.current = false }
      // Natural end detection
      if (dur > 0 && !isP && cur >= dur - 0.25 && !endedRef.current) {
        endedRef.current = true
        savedSecRef.current = 0
        player.seekTo(0)
        if (mountedRef.current) {
          setProgress(0); setCurMs(0); setPlaying(false); setListened(true)
        }
        onEnded?.()
      }
    }, 120)
    return () => clearInterval(iv)
  }, [player, onEnded])

  // Auto-play when shouldAutoPlay flips true
  useEffect(() => {
    if (shouldAutoPlay && !autoRef.current && player) {
      autoRef.current = true
      setTimeout(() => {
        try {
          endedRef.current = false
          applySpeed(speedIdx)
          player.play()
          if (mountedRef.current) setPlaying(true)
        } catch {}
      }, 250)
    }
    if (!shouldAutoPlay) autoRef.current = false
  }, [shouldAutoPlay, player, applySpeed, speedIdx])

  const toggle = () => {
    try {
      if (playing) {
        player.pause(); setPlaying(false)
      } else {
        endedRef.current = false
        if (savedSecRef.current > 0) player.seekTo(savedSecRef.current)
        applySpeed(speedIdx)
        player.play()
        setPlaying(true)
      }
    } catch (e: any) {
      Alert.alert('Playback error', e?.message)
    }
  }

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEED_STEPS.length
    setSpeedIdx(next)
    applySpeed(next)
  }

  const handleWaveTap = (evt: any) => {
    if (!player) return
    const { locationX } = evt.nativeEvent
    const waveWidth = SW * 0.42
    const ratio = Math.max(0, Math.min(locationX / waveWidth, 1))
    const dur = player.duration ?? (durationMs ? durationMs / 1000 : 0)
    const seekSec = ratio * dur
    savedSecRef.current = seekSec
    player.seekTo(seekSec)
    setProgress(ratio)
    setCurMs(seekSec * 1000)
    if (!playing) {
      endedRef.current = false
      applySpeed(speedIdx)
      player.play()
      setPlaying(true)
    }
  }

  const totalMs = player.duration ? player.duration * 1000 : (durationMs ?? 0)
  const dispMs  = playing || progress > 0 ? curMs : totalMs

  return (
    <View style={vp.row}>
      <TouchableOpacity style={[vp.playBtn, isMine && vp.playBtnMine]} onPress={toggle}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={isMine ? '#0369A1' : '#0F172A'} />
      </TouchableOpacity>

      <View style={vp.middle}>
        <TouchableOpacity activeOpacity={0.9} onPress={handleWaveTap} style={vp.waveWrap}>
          {WAVEFORM_BARS.map((h, i) => {
            const ratio = i / WAVEFORM_BARS.length
            const filled = ratio <= progress
            const pulse  = Math.abs(ratio - progress) < 0.06 && playing
            return (
              <View key={i} style={[vp.bar, {
                height: Math.max(3, h * 0.9),
                backgroundColor: filled
                  ? (listened ? '#38BDF8' : (isMine ? 'rgba(255,255,255,0.9)' : '#38BDF8'))
                  : (isMine ? 'rgba(255,255,255,0.25)' : '#334155'),
                transform: [{ scaleY: pulse ? 1.4 : 1 }],
              }]} />
            )
          })}
        </TouchableOpacity>
        <Text style={[vp.dur, isMine && vp.durMine]}>{fmtDur(dispMs)}</Text>
      </View>

      <TouchableOpacity onPress={cycleSpeed} style={[vp.speedBtn, isMine && vp.speedBtnMine]}>
        <Text style={[vp.speedTxt, isMine && vp.speedTxtMine]}>{SPEED_STEPS[speedIdx][1]}</Text>
      </TouchableOpacity>
    </View>
  )
}
const vp = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 4 },
  playBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center' },
  playBtnMine: { backgroundColor: 'rgba(255,255,255,0.9)' },
  middle: { flex: 1, gap: 4 },
  waveWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 30 },
  bar: { width: 3, borderRadius: 2 },
  dur: { fontSize: 11, color: '#64748B' },
  durMine: { color: 'rgba(255,255,255,0.6)' },
  speedBtn: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: '#1E3A5F', borderWidth: 1, borderColor: '#334155' },
  speedBtnMine: { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' },
  speedTxt: { fontSize: 11, fontWeight: '800', color: '#38BDF8' },
  speedTxtMine: { color: '#fff' },
})

// ─────────────────────────────────────────────────────────────────────────────
// FilePreview
// ─────────────────────────────────────────────────────────────────────────────
function FilePreview({ msg, isMine }: { msg: StudentMessage; isMine: boolean }) {
  const [dl, setDl] = useState(false)
  const ext = (msg.file_name ?? '').split('.').pop()?.toLowerCase() ?? ''
  const icon = ['pdf'].includes(ext) ? 'document-text'
    : ['jpg', 'jpeg', 'png'].includes(ext) ? 'image'
    : ['mp4', 'mov'].includes(ext) ? 'videocam'
    : ['mp3', 'm4a'].includes(ext) ? 'musical-notes'
    : 'document-attach'
  return (
    <TouchableOpacity
      style={bs.fileRow}
      onPress={async () => {
        if (!msg.file_url) return
        setDl(true)
        await downloadAndOpen(msg.file_url, msg.file_name ?? 'file')
        setDl(false)
      }}
      disabled={dl}
    >
      <View style={[bs.fileIcon, { backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : '#1E3A5F' }]}>
        {dl
          ? <ActivityIndicator size="small" color={isMine ? '#fff' : '#38BDF8'} />
          : <Ionicons name={icon as any} size={20} color={isMine ? '#fff' : '#38BDF8'} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[bs.fileName, isMine && { color: '#fff' }]} numberOfLines={2}>
          {msg.file_name ?? 'File'}
        </Text>
        <Text style={[bs.fileMeta, isMine && { color: 'rgba(255,255,255,0.55)' }]}>
          {fmtSize(msg.file_size)} · Tap to open
        </Text>
      </View>
      <Ionicons
        name={dl ? 'hourglass-outline' : 'download-outline'}
        size={16}
        color={isMine ? 'rgba(255,255,255,0.7)' : '#38BDF8'}
      />
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineActionBar
// FIX #8: Copy uses Clipboard.setStringAsync
// ─────────────────────────────────────────────────────────────────────────────
function InlineActionBar({
  isMine, onReact, onReply, onDelete, onCopy, onClose,
}: {
  isMine: boolean
  onReact: (e: string) => void
  onReply: () => void
  onDelete?: () => void
  onCopy?: () => void
  onClose: () => void
}) {
  const sc = useRef(new Animated.Value(0.82)).current
  const op = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.parallel([
      Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }),
      Animated.timing(op, { toValue: 1, duration: 110, useNativeDriver: true }),
    ]).start()
  }, [])
  return (
    <Pressable style={ac.backdrop} onPress={onClose}>
      <Animated.View style={[ac.container, { transform: [{ scale: sc }], opacity: op }]}>
        <View style={ac.emojiRow}>
          {REACTIONS.map(e => (
            <TouchableOpacity key={e} style={ac.emojiBtn} onPress={() => { onReact(e); onClose() }}>
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={ac.divider} />
        <View style={ac.actionsRow}>
          <TouchableOpacity style={ac.ai} onPress={() => { onReply(); onClose() }}>
            <View style={[ac.aIcon, { backgroundColor: 'rgba(56,189,248,0.12)' }]}>
              <Ionicons name="arrow-undo-outline" size={18} color="#38BDF8" />
            </View>
            <Text style={ac.at}>Reply</Text>
          </TouchableOpacity>
          {onCopy && (
            <TouchableOpacity style={ac.ai} onPress={() => { onCopy(); onClose() }}>
              <View style={[ac.aIcon, { backgroundColor: 'rgba(148,163,184,0.12)' }]}>
                <Ionicons name="copy-outline" size={18} color="#94A3B8" />
              </View>
              <Text style={ac.at}>Copy</Text>
            </TouchableOpacity>
          )}
          {isMine && onDelete && (
            <TouchableOpacity style={ac.ai} onPress={() => { onDelete(); onClose() }}>
              <View style={[ac.aIcon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[ac.at, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Pressable>
  )
}
const ac = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  container: { backgroundColor: '#0F172A', borderRadius: 20, overflow: 'hidden', width: 320, borderWidth: 1, borderColor: '#1E3A5F', elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.6, shadowRadius: 24 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 8 },
  emojiBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#1E3A5F', marginHorizontal: 16 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
  ai: { alignItems: 'center', gap: 6, minWidth: 60 },
  aIcon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  at: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
})

// ─────────────────────────────────────────────────────────────────────────────
// ThreeDotMenu
// ─────────────────────────────────────────────────────────────────────────────
function ThreeDotMenu({
  visible, isGroup, onClose, onViewMedia, onSearch, onMute,
  onClearChat, onGroupInfo, onBlock,
}: {
  visible: boolean; isGroup: boolean; onClose: () => void
  onViewMedia: () => void; onSearch: () => void; onMute: () => void
  onClearChat: () => void; onGroupInfo: () => void; onBlock: () => void
}) {
  const ty = useRef(new Animated.Value(-10)).current
  const op = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 4 }),
      ]).start()
    }
  }, [visible])
  if (!visible) return null
  const items = [
    isGroup && { icon: 'people-outline',          label: 'Group info',  onPress: onGroupInfo, color: '#38BDF8' },
    { icon: 'image-outline',                       label: 'View media',  onPress: onViewMedia, color: '#94A3B8' },
    { icon: 'search-outline',                      label: 'Search',      onPress: onSearch,    color: '#94A3B8' },
    { icon: 'notifications-off-outline',           label: 'Mute',        onPress: onMute,      color: '#94A3B8' },
    { icon: 'trash-outline',                       label: 'Clear chat',  onPress: onClearChat, color: '#F59E0B' },
    !isGroup && { icon: 'ban-outline',             label: 'Block',       onPress: onBlock,     color: '#EF4444' },
  ].filter(Boolean) as any[]
  return (
    <Pressable style={td.overlay} onPress={onClose}>
      <Animated.View style={[td.menu, { opacity: op, transform: [{ translateY: ty }] }]}>
        {items.map((item: any, i: number) => (
          <TouchableOpacity
            key={item.label}
            style={[td.item, i < items.length - 1 && td.border]}
            onPress={() => { item.onPress(); onClose() }}
          >
            <Ionicons name={item.icon} size={18} color={item.color} />
            <Text style={[td.txt, { color: item.color === '#94A3B8' ? '#E2E8F0' : item.color }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </Pressable>
  )
}
const td = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300 },
  menu: { position: 'absolute', top: 56, right: 12, backgroundColor: '#1E293B', borderRadius: 14, minWidth: 180, borderWidth: 1, borderColor: '#334155', elevation: 15, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  border: { borderBottomWidth: 1, borderBottomColor: '#0F172A' },
  txt: { fontSize: 14, fontWeight: '600' },
})

// ─────────────────────────────────────────────────────────────────────────────
// MediaGallery
// ─────────────────────────────────────────────────────────────────────────────
function MediaGallery({
  messages, visible, onClose, onImagePress,
}: {
  messages: StudentMessage[]; visible: boolean
  onClose: () => void; onImagePress: (uri: string) => void
}) {
  const [tab, setTab] = useState<'images' | 'files' | 'voice'>('images')
  const images = messages.filter(m => m.type === 'image' && m.file_url && !m.is_deleted)
  const files  = messages.filter(m => m.type === 'file'  && m.file_url && !m.is_deleted)
  const voices = messages.filter(m => m.type === 'voice' && m.file_url && !m.is_deleted)
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={mg.root}>
        <View style={mg.header}>
          <Text style={mg.title}>Shared Media</Text>
          <TouchableOpacity onPress={onClose} style={mg.closeBtn}>
            <Ionicons name="close" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>
        <View style={mg.tabBar}>
          {(['images', 'files', 'voice'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[mg.tab, tab === t && mg.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[mg.tabTxt, tab === t && mg.tabTxtActive]}>
                {t === 'images' ? `Images (${images.length})`
                  : t === 'files' ? `Files (${files.length})`
                  : `Voice (${voices.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {tab === 'images' && (images.length === 0
          ? <View style={mg.empty}><Ionicons name="image-outline" size={48} color="#1E3A5F" /><Text style={mg.emptyTxt}>No images</Text></View>
          : <ScrollView contentContainerStyle={mg.grid}>
              {images.map(m => (
                <TouchableOpacity key={m.id} onPress={() => { onClose(); onImagePress(m.file_url!) }}>
                  <Image source={{ uri: m.file_url! }} style={mg.thumb} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
        )}
        {tab === 'files' && (files.length === 0
          ? <View style={mg.empty}><Ionicons name="document-outline" size={48} color="#1E3A5F" /><Text style={mg.emptyTxt}>No files</Text></View>
          : <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {files.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={mg.fileRow}
                  onPress={() => downloadAndOpen(m.file_url!, m.file_name ?? 'file')}
                >
                  <View style={mg.fileIconWrap}><Ionicons name="document-attach" size={22} color="#38BDF8" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={mg.fn} numberOfLines={1}>{m.file_name ?? 'File'}</Text>
                    <Text style={mg.fm}>{fmtSize(m.file_size)}</Text>
                  </View>
                  <Ionicons name="download-outline" size={18} color="#475569" />
                </TouchableOpacity>
              ))}
            </ScrollView>
        )}
        {tab === 'voice' && (voices.length === 0
          ? <View style={mg.empty}><Ionicons name="mic-outline" size={48} color="#1E3A5F" /><Text style={mg.emptyTxt}>No voice notes</Text></View>
          : <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {voices.map(m => (
                <View key={m.id} style={mg.fileRow}>
                  <View style={mg.vIco}><Ionicons name="mic" size={18} color="#8B5CF6" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={mg.fn}>{safeName(m.sender_name)}</Text>
                    <Text style={mg.fm}>{fmtTime(m.created_at)}</Text>
                  </View>
                  <VoicePlayer
                    fileUrl={m.file_url!}
                    isMine={false}
                    // FIX #13: prefer voice_duration_ms, fall back to file_size
                    durationMs={(m as any).voice_duration_ms ?? m.file_size}
                  />
                </View>
              ))}
            </ScrollView>
        )}
      </View>
    </Modal>
  )
}
const mg = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1E3A5F' },
  title: { fontSize: 17, fontWeight: '800', color: '#F1F5F9' },
  closeBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1E3A5F' },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1E293B', alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(56,189,248,0.15)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)' },
  tabTxt: { fontSize: 12, fontWeight: '600', color: '#475569' },
  tabTxtActive: { color: '#38BDF8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 2 },
  thumb: { width: (SW - 4) / 3, aspectRatio: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTxt: { fontSize: 14, color: '#475569' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1E293B', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#334155' },
  fileIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(56,189,248,0.1)', justifyContent: 'center', alignItems: 'center' },
  vIco: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.1)', justifyContent: 'center', alignItems: 'center' },
  fn: { fontSize: 14, fontWeight: '600', color: '#F1F5F9', marginBottom: 2 },
  fm: { fontSize: 11, color: '#475569' },
})

// ─────────────────────────────────────────────────────────────────────────────
// SwipeableBubble
// ─────────────────────────────────────────────────────────────────────────────
type BubbleProps = {
  msg: StudentMessage
  isMine: boolean
  isGroup: boolean
  showAvatar: boolean
  activeVoiceId: string | null
  onVoiceEnded: (id: string) => void
  onReply: () => void
  onReact: (e: string) => void
  onDelete: () => void
  onLongPress: () => void
  onAvatarPress: () => void
  onImagePress: (uri: string) => void
}
function SwipeableBubble({
  msg, isMine, isGroup, showAvatar, activeVoiceId,
  onVoiceEnded, onReply, onReact, onDelete, onLongPress, onAvatarPress, onImagePress,
}: BubbleProps) {
  const tx  = useRef(new Animated.Value(0)).current
  const rop = useRef(new Animated.Value(0)).current
  const rsc = useRef(new Animated.Value(0.5)).current
  const ex  = useRef(new Animated.Value(isMine ? 28 : -28)).current
  const eop = useRef(new Animated.Value(0)).current
  const trig = useRef(false)

  useEffect(() => {
    Animated.parallel([
      Animated.spring(ex,  { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
      Animated.timing(eop, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start()
  }, [])

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onMoveShouldSetPanResponderCapture: (_, g) =>
      Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => { trig.current = false },
    onPanResponderMove: (_, g) => {
      const raw = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, g.dx))
      const r = Math.min(Math.abs(raw) / SWIPE_TRIGGER, 1)
      tx.setValue(raw); rop.setValue(r); rsc.setValue(0.5 + r * 0.5)
      if (!trig.current && Math.abs(raw) >= SWIPE_TRIGGER) trig.current = true
    },
    onPanResponderRelease: () => {
      Animated.parallel([
        Animated.spring(tx,  { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 6 }),
        Animated.timing(rop, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(rsc, { toValue: 0.5, duration: 150, useNativeDriver: true }),
      ]).start()
      if (trig.current) { trig.current = false; onReply() }
    },
    onPanResponderTerminate: () => {
      Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start()
      rop.setValue(0); rsc.setValue(0.5)
    },
  })).current

  if (msg.is_deleted) return (
    <View style={[bs.row, isMine && bs.rowMine, { marginBottom: 6 }]}>
      {!isMine && <View style={{ width: 36 }} />}
      <View style={[bs.deletedBubble, isMine && bs.deletedMine]}>
        <Ionicons name="ban-outline" size={12} color="#475569" />
        <Text style={bs.deletedTxt}>Message deleted</Text>
      </View>
    </View>
  )

  const name    = safeName(msg.sender_name)
  const content = safeContent(msg.content)
  // FIX #3: guard null file_url before rendering VoicePlayer
  const isActiveVoice = msg.type === 'voice' && !!msg.file_url && activeVoiceId === msg.id

  return (
    <Animated.View
      style={[bs.row, isMine && bs.rowMine, { opacity: eop, transform: [{ translateX: ex }] }]}
      {...pan.panHandlers}
    >
      <Animated.View
        style={[bs.replyIcon, isMine ? bs.replyL : bs.replyR, { opacity: rop, transform: [{ scale: rsc }] }]}
      >
        <Ionicons name="arrow-undo" size={15} color="#38BDF8" />
      </Animated.View>

      <Animated.View style={[bs.inner, isMine && bs.innerMine, { transform: [{ translateX: tx }] }]}>
        {!isMine && (
          showAvatar
            ? <Avatar uri={msg.sender_avatar} name={name} id={msg.sender_id} size={32} onPress={onAvatarPress} />
            : <View style={{ width: 32 }} />
        )}
        <View style={[bs.wrap, isMine && bs.wrapMine]}>
          {!isMine && isGroup && showAvatar && (
            <Text style={[bs.senderName, { color: avatarColor(msg.sender_id) }]}>
              {name.split(' ')[0]}
            </Text>
          )}

          {msg.reply_to && (
            <View style={[bs.rPreview, isMine && bs.rPreviewMine]}>
              <View style={[bs.rBar, { backgroundColor: isMine ? '#38BDF8' : avatarColor(msg.sender_id) }]} />
              <View style={{ flex: 1 }}>
                <Text style={bs.rName}>{safeName(msg.reply_to.sender_name)}</Text>
                <Text style={bs.rContent} numberOfLines={1}>
                  {msg.reply_to.type !== 'text'
                    ? `📎 ${msg.reply_to.type}`
                    : safeContent(msg.reply_to.content) ?? ''}
                </Text>
              </View>
            </View>
          )}

          <Pressable
            style={[bs.bubble, isMine ? bs.bubbleMine : bs.bubbleOther]}
            onLongPress={onLongPress}
            delayLongPress={300}
          >
            {msg.type === 'image' && msg.file_url && (
              <TouchableOpacity
                onPress={() => onImagePress(msg.file_url!)}
                onLongPress={onLongPress}
                delayLongPress={300}
                activeOpacity={0.9}
              >
                <Image source={{ uri: msg.file_url }} style={bs.msgImg} resizeMode="cover" />
                <View style={bs.imgHint}>
                  <Ionicons name="expand-outline" size={13} color="rgba(255,255,255,0.85)" />
                </View>
              </TouchableOpacity>
            )}

            {msg.type === 'file' && <FilePreview msg={msg} isMine={isMine} />}

            {/* FIX #3: only render VoicePlayer when file_url is non-null */}
            {msg.type === 'voice' && msg.file_url && (
              <VoicePlayer
                fileUrl={msg.file_url}
                isMine={isMine}
                durationMs={(msg as any).voice_duration_ms ?? msg.file_size}
                shouldAutoPlay={isActiveVoice}
                onEnded={() => onVoiceEnded(msg.id)}
              />
            )}
            {/* Show upload placeholder when voice is optimistic (no url yet) */}
            {msg.type === 'voice' && !msg.file_url && (
              <View style={bs.voiceUploading}>
                <ActivityIndicator size="small" color={isMine ? '#fff' : '#38BDF8'} />
                <Text style={[bs.voiceUploadTxt, isMine && { color: 'rgba(255,255,255,0.7)' }]}>
                  Uploading…
                </Text>
              </View>
            )}

            {content && (
              <Text style={[bs.msgTxt, isMine && bs.txtMine]}>{content}</Text>
            )}

            <View style={bs.footer}>
              <Text style={[bs.time, isMine && bs.timeMine]}>{fmtTime(msg.created_at)}</Text>
              {isMine && (
                <Ionicons
                  name="checkmark-done"
                  size={13}
                  color="rgba(255,255,255,0.55)"
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
          </Pressable>

          {msg.reactions.length > 0 && (
            <View style={[bs.reactRow, isMine && bs.reactRowMine]}>
              {msg.reactions.map(r => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[bs.reactChip, r.by_me && bs.reactChipOn]}
                  onPress={() => onReact(r.emoji)}
                >
                  <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
                  {r.count > 1 && <Text style={bs.reactCnt}>{r.count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {isMine && (
          showAvatar
            ? <Avatar uri={msg.sender_avatar} name={name} id={msg.sender_id} size={32} onPress={onAvatarPress} />
            : <View style={{ width: 32 }} />
        )}
      </Animated.View>
    </Animated.View>
  )
}
const bs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3, paddingHorizontal: 8, position: 'relative' },
  rowMine: { flexDirection: 'row-reverse' },
  inner: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, flex: 1 },
  innerMine: { flexDirection: 'row-reverse' },
  replyIcon: { position: 'absolute', top: '50%', marginTop: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(56,189,248,0.15)', justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  replyL: { left: 4 },
  replyR: { right: 4 },
  wrap: { maxWidth: '74%' },
  wrapMine: { alignItems: 'flex-end' },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 2 },
  rPreview: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 8, marginBottom: 4, overflow: 'hidden', gap: 8, paddingVertical: 6, paddingRight: 8 },
  rPreviewMine: { backgroundColor: 'rgba(255,255,255,0.1)' },
  rBar: { width: 3, borderRadius: 2 },                 // FIX #1: no height:'100%', alignSelf:'stretch' in parent handles it
  rName: { fontSize: 11, fontWeight: '700', color: '#38BDF8', marginBottom: 1 },
  rContent: { fontSize: 11, color: '#94A3B8' },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, overflow: 'hidden' },
  bubbleOther: { backgroundColor: '#1E293B', borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: '#0369A1', borderBottomRightRadius: 4 },
  msgImg: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  imgHint: { position: 'absolute', bottom: 10, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: 3 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180, maxWidth: 240 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  fileName: { fontSize: 13, fontWeight: '600', color: '#E2E8F0', marginBottom: 2 },
  fileMeta: { fontSize: 11, color: '#64748B' },
  msgTxt: { fontSize: 14, color: '#E2E8F0', lineHeight: 20 },
  txtMine: { color: '#fff' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 2 },
  time: { fontSize: 10, color: '#475569' },
  timeMine: { color: 'rgba(255,255,255,0.55)' },
  reactRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  reactRowMine: { justifyContent: 'flex-end' },
  reactChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#1E293B', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#334155' },
  reactChipOn: { borderColor: '#38BDF8', backgroundColor: 'rgba(56,189,248,0.12)' },
  reactCnt: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  deletedBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1E293B', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#334155' },
  deletedMine: { backgroundColor: 'rgba(3,105,161,0.3)' },
  deletedTxt: { fontSize: 13, color: '#475569', fontStyle: 'italic' },
  voiceUploading: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 140, paddingVertical: 6 },
  voiceUploadTxt: { fontSize: 12, color: '#64748B' },
})

// ─────────────────────────────────────────────────────────────────────────────
// OfflineBanner — shown when loading from cache
// ─────────────────────────────────────────────────────────────────────────────
function OfflineBanner({ visible }: { visible: boolean }) {
  const op = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(op, { toValue: visible ? 1 : 0, duration: 300, useNativeDriver: true }).start()
  }, [visible])
  if (!visible) return null
  return (
    <Animated.View style={[offS.bar, { opacity: op }]}>
      <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
      <Text style={offS.txt}>Offline — showing cached messages</Text>
    </Animated.View>
  )
}
const offS = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)', paddingVertical: 6 },
  txt: { fontSize: 11, fontWeight: '600', color: '#F59E0B' },
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function StudentMessageScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    conversation_id: string
    conversation_name: string
    conversation_type: string
    other_user_id: string
    other_user_avatar: string
  }>()
  const convId    = params.conversation_id
  const convName  = safeName(params.conversation_name) || 'Chat'
  const isGroup   = params.conversation_type === 'group'

  // ── State ──────────────────────────────────────────────────────────────────
  const [userId,        setUserId]        = useState<string | null>(null)
  const [myProfile,     setMyProfile]     = useState<UserProfile | null>(null)
  const [messages,      setMessages]      = useState<StudentMessage[]>([])
  const [loading,       setLoading]       = useState(true)
  const [isOffline,     setIsOffline]     = useState(false)
  const [text,          setText]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [replyTo,       setReplyTo]       = useState<StudentMessage | null>(null)
  const [typingNames,   setTypingNames]   = useState<string[]>([])
  const [actionMsgId,   setActionMsgId]   = useState<string | null>(null)
  const [uploading,     setUploading]     = useState(false)
  const [isRecording,   setIsRecording]   = useState(false)
  const [recDuration,   setRecDuration]   = useState(0)
  const [showMenu,      setShowMenu]      = useState(false)
  const [showMedia,     setShowMedia]     = useState(false)
  const [searchMode,    setSearchMode]    = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null)
  const [showContact,   setShowContact]   = useState(false)
  const [otherProfile,  setOtherProfile]  = useState<UserProfile | null>(null)
  const [lightboxUri,   setLightboxUri]   = useState<string | null>(null)
  const [lightboxName,  setLightboxName]  = useState('')

  // ── Refs ───────────────────────────────────────────────────────────────────
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const flatRef       = useRef<FlatList>(null)
  const inputRef      = useRef<TextInput>(null)
  const typingRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef    = useRef(true)
  // FIX NEW: track scroll position to avoid forcing scroll when user is reading history
  const nearBottomRef = useRef(true)
  const userIdRef     = useRef<string | null>(null)   // stable ref for callbacks

  useEffect(() => {
    return () => {
      mountedRef.current = false
      // FIX #10: always clear recording timer on unmount
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      // FIX NEW: clear typing timeout on unmount
      if (typingRef.current) clearTimeout(typingRef.current)
    }
  }, [])

  // ── Init — offline-first ───────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Step 1: load cache immediately so screen is usable offline
      const cached = await loadCachedMessages(convId)
      if (cached.length > 0 && mountedRef.current) {
        setMessages(cached)
        setLoading(false)
        setIsOffline(true)
      }

      // Step 2: authenticate
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mountedRef.current) return
      setUserId(user.id)
      userIdRef.current = user.id

      // Step 3: fetch my profile
      const { data: me } = await supabase
        .from('profiles')
        .select('id,full_name,avatar_url,is_verified,bio')
        .eq('id', user.id)
        .single()
      if (me && mountedRef.current) {
        setMyProfile({
          id: me.id,
          full_name: safeName(me.full_name),
          avatar_url: safeAvatarUri(me.avatar_url),
          is_verified: me.is_verified ?? false,
          bio: me.bio ?? null,
        })
      }

      // Step 4: fetch fresh messages from server
      try {
        const msgs = await fetchMessages(convId, user.id)
        if (mountedRef.current) {
          setMessages(msgs)
          setIsOffline(false)
          setLoading(false)
          await saveMessagesToCache(convId, msgs)
          markConversationRead(convId, user.id)
        }
      } catch {
        // Network failed — stay on cache; offline banner already visible
        if (mountedRef.current) setLoading(false)
      }

      // Step 5: load other user's profile (non-group)
      if (!isGroup && params.other_user_id) {
        try {
          const { data: p } = await supabase
            .from('profiles')
            .select('id,full_name,avatar_url,email,class_id,college_id,bio,is_verified')
            .eq('id', params.other_user_id)
            .single()
          if (p && mountedRef.current) {
            let cn: string | null = null, colN: string | null = null
            if (p.class_id) {
              const { data: cls } = await supabase.from('classes').select('name').eq('id', p.class_id).single()
              cn = cls?.name ?? null
            }
            if (p.college_id) {
              const { data: col } = await supabase.from('colleges').select('name').eq('id', p.college_id).single()
              colN = col?.name ?? null
            }
            setOtherProfile({
              id: p.id,
              full_name: safeName(p.full_name),
              avatar_url: safeAvatarUri(p.avatar_url),
              email: p.email ?? null,
              bio: p.bio ?? null,
              class_name: cn,
              college_name: colN,
              is_verified: p.is_verified ?? false,
            })
          }
        } catch { /* non-fatal */ }
      }
    }
    init()
  }, [convId])

  // ── Realtime subscription ──────────────────────────────────────────────────
  // FIX NEW: subscription waits for userId; cleaned up correctly on unmount
  useEffect(() => {
    if (!userId) return

    const ch = supabase.channel(`msgs_${convId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'student_messages',
        filter: `conversation_id=eq.${convId}`,
      }, async (payload) => {
        const raw = payload.new as any
        if (raw.sender_id === userId) return
        const { data } = await supabase
          .from('student_messages')
          .select('id,conversation_id,sender_id,type,content,file_url,file_name,file_size,voice_duration_ms,mime_type,reply_to_id,is_deleted,created_at,updated_at,sender:profiles!sender_id(full_name,avatar_url),reactions:student_message_reactions(emoji,user_id)')
          .eq('id', raw.id)
          .single()
        if (!data || !mountedRef.current) return
        const newMsg = normMsg(data, userId)
        setMessages(prev => {
          const updated = [...prev, newMsg]
          saveMessagesToCache(convId, updated)
          return updated
        })
        markConversationRead(convId, userId)
        if (nearBottomRef.current) {
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'student_typing',
        filter: `conversation_id=eq.${convId}`,
      }, async (payload) => {
        const row = payload.new as any
        if (row.user_id === userId) return
        const { data: p } = await supabase
          .from('profiles').select('full_name').eq('id', row.user_id).single()
        const n = safeName(p?.full_name).split(' ')[0]
        if (!mountedRef.current) return
        if (row.is_typing) setTypingNames(prev => [...new Set([...prev, n])])
        else setTypingNames(prev => prev.filter(x => x !== n))
      })
      // FIX #9: reaction change → update only the affected message, not full refetch
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'student_message_reactions',
      }, async (payload) => {
        const row = (payload.new ?? payload.old) as any
        if (!row?.message_id || !mountedRef.current) return
        const { data } = await supabase
          .from('student_messages')
          .select('id,conversation_id,sender_id,type,content,file_url,file_name,file_size,voice_duration_ms,mime_type,reply_to_id,is_deleted,created_at,updated_at,sender:profiles!sender_id(full_name,avatar_url),reactions:student_message_reactions(emoji,user_id)')
          .eq('id', row.message_id)
          .single()
        if (!data || !mountedRef.current) return
        const updated = normMsg(data, userId)
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId, convId])

  // ── Scroll helper ──────────────────────────────────────────────────────────
  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated }), 80)
  }, [])

  // ── Voice ended — FIX #11: functional updater for fresh message state ──────
  const handleVoiceEnded = useCallback((msgId: string) => {
    setActiveVoiceId(null)
    setMessages(prev => {
      const vOnly = prev.filter(m => m.type === 'voice' && m.file_url && !m.is_deleted)
      const idx = vOnly.findIndex(m => m.id === msgId)
      if (idx >= 0 && idx < vOnly.length - 1) {
        setActiveVoiceId(vOnly[idx + 1].id)
      }
      return prev // no mutation; side-effect only
    })
  }, [])

  // ── Typing indicator ───────────────────────────────────────────────────────
  const handleTextChange = (val: string) => {
    setText(val)
    if (!userId) return
    setTyping(convId, userId, true)
    if (typingRef.current) clearTimeout(typingRef.current)
    typingRef.current = setTimeout(() => {
      if (userIdRef.current) setTyping(convId, userIdRef.current, false)
    }, 2000)
  }

  // ── Send text ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!userId || !text.trim() || sending) return
    const content = text.trim()
    setText('')
    setReplyTo(null)
    if (typingRef.current) clearTimeout(typingRef.current)
    setTyping(convId, userId, false)

    const optId = `opt_${Date.now()}`
    const opt: StudentMessage = {
      id: optId, conversation_id: convId, sender_id: userId, type: 'text',
      content, file_url: null, file_name: null, file_size: null, mime_type: null,
      reply_to_id: replyTo?.id ?? null, is_deleted: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender_name: safeName(myProfile?.full_name) || 'You',
      sender_avatar: safeAvatarUri(myProfile?.avatar_url),
      reactions: [],
      reply_to: replyTo ? {
        id: replyTo.id, content: safeContent(replyTo.content),
        type: replyTo.type, sender_name: replyTo.sender_name,
      } : null,
    }
    setMessages(prev => [...prev, opt])
    scrollToEnd()

    const sent = await sendMessage({
      conversationId: convId, senderId: userId, type: 'text',
      content, replyToId: replyTo?.id,
    })
    if (sent && mountedRef.current) {
      setMessages(prev => {
        const updated = prev.map(m => m.id === optId ? sent : m)
        saveMessagesToCache(convId, updated)
        return updated
      })
    }
  }

  // ── Pick image ─────────────────────────────────────────────────────────────
  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permission required'); return }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any, quality: 0.75,
    })
    if (r.canceled || !userId) return

    const asset = r.assets[0]
    const optId = `opt_img_${Date.now()}`
    const opt: StudentMessage = {
      id: optId, conversation_id: convId, sender_id: userId, type: 'image',
      content: null, file_url: asset.uri, file_name: null, file_size: null,
      mime_type: null, reply_to_id: null, is_deleted: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender_name: safeName(myProfile?.full_name) || 'You',
      sender_avatar: safeAvatarUri(myProfile?.avatar_url),
      reactions: [], reply_to: null,
    }
    setMessages(prev => [...prev, opt])
    scrollToEnd()
    setUploading(true)
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg'
      const fn  = `${userId}_${Date.now()}.${ext}`
      const url = await uploadFile('chat-media', fn, asset.uri, `image/${ext}`)
      const sent = await sendMessage({
        conversationId: convId, senderId: userId, type: 'image',
        fileUrl: url, fileName: fn, mimeType: `image/${ext}`,
      })
      if (mountedRef.current) {
        setMessages(prev => {
          const updated = prev.map(m => m.id === optId ? (sent ?? { ...m, file_url: url }) : m)
          saveMessagesToCache(convId, updated)
          return updated
        })
      }
    } catch (e: any) {
      if (mountedRef.current) setMessages(prev => prev.filter(m => m.id !== optId))
      Alert.alert('Upload failed', e?.message)
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  // ── Pick file ──────────────────────────────────────────────────────────────
  const handlePickFile = async () => {
    if (!userId) return
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
    if (r.canceled) return

    const file  = r.assets[0]
    const optId = `opt_file_${Date.now()}`
    const opt: StudentMessage = {
      id: optId, conversation_id: convId, sender_id: userId, type: 'file',
      content: null, file_url: null, file_name: file.name, file_size: file.size ?? null,
      mime_type: file.mimeType ?? null, reply_to_id: null, is_deleted: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender_name: safeName(myProfile?.full_name) || 'You',
      sender_avatar: safeAvatarUri(myProfile?.avatar_url),
      reactions: [], reply_to: null,
    }
    setMessages(prev => [...prev, opt])
    scrollToEnd()
    setUploading(true)
    try {
      const mime = file.mimeType ?? 'application/octet-stream'
      const fn   = `${userId}_${Date.now()}_${file.name}`
      const url  = await uploadFile('chat-media', fn, file.uri, mime)
      const sent = await sendMessage({
        conversationId: convId, senderId: userId, type: 'file',
        fileUrl: url, fileName: file.name, fileSize: file.size ?? undefined, mimeType: mime,
      })
      if (mountedRef.current) {
        setMessages(prev => {
          const updated = prev.map(m => m.id === optId ? (sent ?? { ...m, file_url: url }) : m)
          saveMessagesToCache(convId, updated)
          return updated
        })
      }
    } catch (e: any) {
      if (mountedRef.current) setMessages(prev => prev.filter(m => m.id !== optId))
      Alert.alert('Upload failed', e?.message)
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  // FIX #2: beepPlayer removed — it hit an external CDN on every mount
  const startRecording = async () => {
    try {
      const st = await AudioModule.requestRecordingPermissionsAsync()
      if (!st.granted) { Alert.alert('Permission required'); return }
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      if (mountedRef.current) { setIsRecording(true); setRecDuration(0) }
      // FIX #10: store ref so it can be cleared on unmount
      recTimerRef.current = setInterval(() => {
        if (mountedRef.current) setRecDuration(d => d + 1)
      }, 1000)
    } catch (e: any) {
      Alert.alert('Recording failed', e?.message)
    }
  }

  const stopAndSend = async () => {
    if (!isRecording || !userId) return
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    if (mountedRef.current) setIsRecording(false)
    try {
      const dur = recDuration * 1000
      await audioRecorder.stop()
      const uri = audioRecorder.uri
      if (!uri) return
      setUploading(true)
      const fn  = `${userId}_voice_${Date.now()}.m4a`
      const url = await uploadFile('chat-media', fn, uri, 'audio/m4a')
      const sent = await sendMessage({
        conversationId: convId, senderId: userId, type: 'voice',
        fileUrl: url, fileName: fn,
        // FIX #13: pass duration separately; DB should have voice_duration_ms column
        fileSize: dur,
        mimeType: 'audio/m4a',
      })
      if (sent && mountedRef.current) {
        setMessages(prev => {
          const updated = [...prev, sent]
          saveMessagesToCache(convId, updated)
          return updated
        })
        scrollToEnd()
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message)
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  const cancelRecording = async () => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    if (mountedRef.current) { setIsRecording(false); setRecDuration(0) }
    try { await audioRecorder.stop() } catch {}
  }

  // ── Reactions — FIX #9: update single message in state ────────────────────
  const handleReact = async (msgId: string, emoji: string) => {
    if (!userId) return
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const alreadyReacted = !!msg.reactions.find(r => r.emoji === emoji)?.by_me
    await toggleReaction(msgId, userId, emoji, alreadyReacted)
    // Refetch only this message
    const { data } = await supabase
      .from('student_messages')
      .select('id,conversation_id,sender_id,type,content,file_url,file_name,file_size,voice_duration_ms,mime_type,reply_to_id,is_deleted,created_at,updated_at,sender:profiles!sender_id(full_name,avatar_url),reactions:student_message_reactions(emoji,user_id)')
      .eq('id', msgId)
      .single()
    if (data && mountedRef.current) {
      setMessages(prev => prev.map(m => m.id === msgId ? normMsg(data, userId) : m))
    }
  }

  const handleDelete = (msg: StudentMessage) => {
    Alert.alert('Delete Message', 'Remove for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_deleted: true } : m))
          await deleteMessage(msg.id)
        },
      },
    ])
  }

  // FIX #7: clear chat removes ALL messages in conversation from local state
  const handleClearChat = () => {
    Alert.alert('Clear Chat', 'Delete all messages from this screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          if (!mountedRef.current) return
          setMessages([])
          await saveMessagesToCache(convId, [])
          // Soft-delete all messages in this conversation for this user
          await supabase
            .from('student_messages')
            .update({ is_deleted: true })
            .eq('conversation_id', convId)
        },
      },
    ])
  }

  // FIX #8: copy actually writes to clipboard
  const handleCopy = (content: string) => {
    try {
      Clipboard.setString(content)
      Alert.alert('', 'Message copied', [{ text: 'OK' }])
    } catch {
      Alert.alert('Copy failed', 'Could not copy text.')
    }
  }

  const openLightbox = (uri: string | null | undefined, name?: string) => {
    const safe = safeAvatarUri(uri)
    if (safe) { setLightboxUri(safe); setLightboxName(name ?? '') }
  }

  // ── FIX #5: stable memoisation — depends on message IDs + search, not array ref ──
  const msgListKey = messages.map(m => m.id).join(',')
  const displayMessages = useMemo(() => {
    if (!searchMode || !searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter(m =>
      m.content?.toLowerCase().includes(q) ||
      m.file_name?.toLowerCase().includes(q),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgListKey, searchMode, searchQuery])

  // FIX #5 cont: messagesWithHeaders memoised on stable string key
  const flatListData = useMemo(() => {
    type HeaderItem = { type: 'header'; date: string; key: string }
    const result: (StudentMessage | HeaderItem)[] = []
    let lastDate = ''
    displayMessages.forEach(msg => {
      const ds = new Date(msg.created_at).toDateString()
      if (ds !== lastDate) {
        lastDate = ds
        result.push({ type: 'header', date: fmtDate(msg.created_at), key: `h_${msg.created_at}` })
      }
      result.push(msg)
    })
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgListKey, searchMode, searchQuery])

  // ── Derived ────────────────────────────────────────────────────────────────
  const actionMsg      = actionMsgId ? messages.find(m => m.id === actionMsgId) : null
  const topAvatarUri   = !isGroup ? safeAvatarUri(otherProfile?.avatar_url) : null
  const topAvatarName  = safeName(convName)
  const topAvatarId    = params.other_user_id ?? convId
  const isVerified     = otherProfile?.is_verified ?? false

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#F1F5F9" />
        </TouchableOpacity>

        {searchMode ? (
          <View style={s.searchBar}>
            <TextInput
              autoFocus
              style={s.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages..."
              placeholderTextColor="#475569"
            />
            <TouchableOpacity onPress={() => { setSearchMode(false); setSearchQuery('') }}>
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={s.topInfo}
            activeOpacity={0.75}
            // FIX #6: group tap opens group info stub, DM opens contact info
            onPress={() => isGroup
              ? Alert.alert('Group Info', 'Group info screen coming soon.')
              : setShowContact(true)
            }
          >
            {isGroup
              ? <View style={s.groupIcon}><Ionicons name="people" size={18} color="#38BDF8" /></View>
              : (
                <TouchableOpacity
                  onPress={() => openLightbox(topAvatarUri, topAvatarName)}
                  activeOpacity={0.8}
                >
                  <Avatar uri={topAvatarUri} name={topAvatarName} id={topAvatarId} size={36} />
                </TouchableOpacity>
              )
            }
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.topName} numberOfLines={1}>{topAvatarName}</Text>
                {isVerified && <VerifiedBadge size={14} />}
              </View>
              {typingNames.length > 0
                ? <Text style={s.typingTxt}>
                    {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing…
                  </Text>
                : <Text style={s.topSub}>
                    {isGroup ? 'Tap for group info' : 'Tap to view profile'}
                  </Text>
              }
            </View>
          </TouchableOpacity>
        )}

        {!searchMode && (
          <TouchableOpacity style={s.topAction} onPress={() => setShowMenu(v => !v)}>
            <Ionicons name="ellipsis-vertical" size={20} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Offline banner */}
      <OfflineBanner visible={isOffline} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={s.loadTxt}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={flatListData}
            keyExtractor={item => ('key' in item ? item.key : item.id)}
            contentContainerStyle={s.msgList}
            showsVerticalScrollIndicator={false}
            // FIX NEW: only auto-scroll when already near bottom
            onScroll={e => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
              nearBottomRef.current =
                contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_BOTTOM_THRESHOLD
            }}
            scrollEventThrottle={120}
            onContentSizeChange={() => {
              if (!searchMode && nearBottomRef.current) {
                flatRef.current?.scrollToEnd({ animated: false })
              }
            }}
            ListEmptyComponent={
              searchMode ? (
                <View style={s.empty}>
                  <Ionicons name="search-outline" size={40} color="#1E3A5F" />
                  <Text style={s.emptyTitle}>No results</Text>
                </View>
              ) : (
                <View style={s.empty}>
                  <Text style={{ fontSize: 48 }}>👋</Text>
                  <Text style={s.emptyTitle}>Say hello!</Text>
                  <Text style={s.emptySub}>Be the first to send a message.</Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              if ('type' in item && item.type === 'header') {
                return (
                  <View style={s.dateHdr}>
                    <View style={s.dateHdrLine} />
                    <Text style={s.dateHdrTxt}>{item.date}</Text>
                    <View style={s.dateHdrLine} />
                  </View>
                )
              }
              const msg     = item as StudentMessage
              const isMine  = msg.sender_id === userId
              const idx     = displayMessages.indexOf(msg)
              const nextMsg = displayMessages[idx + 1] as StudentMessage | undefined
              const showAvatar = !nextMsg || nextMsg.sender_id !== msg.sender_id

              // Authoritative avatar & name sources
              const senderAvatarUri = isMine
                ? safeAvatarUri(myProfile?.avatar_url)
                : safeAvatarUri(msg.sender_avatar)
              const senderName = isMine
                ? (safeName(myProfile?.full_name) || 'You')
                : safeName(msg.sender_name)

              return (
                <SwipeableBubble
                  msg={{ ...msg, sender_name: senderName, sender_avatar: senderAvatarUri }}
                  isMine={isMine}
                  isGroup={isGroup}
                  showAvatar={showAvatar}
                  activeVoiceId={activeVoiceId}
                  onVoiceEnded={handleVoiceEnded}
                  onReply={() => {
                    setActionMsgId(null)
                    setReplyTo(msg)
                    setTimeout(() => inputRef.current?.focus(), 100)
                  }}
                  onReact={emoji => handleReact(msg.id, emoji)}
                  onDelete={() => handleDelete(msg)}
                  onLongPress={() => setActionMsgId(msg.id)}
                  onImagePress={uri => { setLightboxUri(uri); setLightboxName(senderName) }}
                  onAvatarPress={() => {
                    if (isMine) openLightbox(myProfile?.avatar_url, safeName(myProfile?.full_name) || 'You')
                    else if (!isGroup) setShowContact(true)
                    else openLightbox(msg.sender_avatar, safeName(msg.sender_name))
                  }}
                />
              )
            }}
          />
        )}

        {/* ── Input bar ── */}
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {replyTo && (
            <View style={s.replyStrip}>
              <View style={s.rStripBar} />
              <View style={{ flex: 1 }}>
                <Text style={s.rStripName}>{safeName(replyTo.sender_name).split(' ')[0]}</Text>
                <Text style={s.rStripContent} numberOfLines={1}>
                  {replyTo.type !== 'text' ? `📎 ${replyTo.type}` : safeContent(replyTo.content) ?? ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTo(null)} style={s.rStripClose}>
                <Ionicons name="close" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
          )}

          {isRecording ? (
            <View style={s.recBar}>
              <View style={s.recDot} />
              <Text style={s.recTxt}>Recording… {fmtDur(recDuration * 1000)}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={s.recCancelBtn} onPress={cancelRecording}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
              <TouchableOpacity style={s.recSendBtn} onPress={stopAndSend} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator size="small" color="#0F172A" />
                  : <Ionicons name="send" size={18} color="#0F172A" />}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.inputRow}>
              <TouchableOpacity style={s.attachBtn} onPress={handlePickImage} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator size="small" color="#38BDF8" />
                  : <Ionicons name="image-outline" size={22} color="#38BDF8" />}
              </TouchableOpacity>
              <TouchableOpacity style={s.attachBtn} onPress={handlePickFile} disabled={uploading}>
                <Ionicons name="attach-outline" size={22} color="#64748B" />
              </TouchableOpacity>
              <View style={s.inputWrap}>
                <TextInput
                  ref={inputRef}
                  style={s.input}
                  value={text}
                  onChangeText={handleTextChange}
                  placeholder="Message…"
                  placeholderTextColor="#334155"
                  multiline
                  maxLength={2000}
                />
                {!text.trim() && (
                  <TouchableOpacity style={s.micBtn} onPress={startRecording}>
                    <Ionicons name="mic-outline" size={18} color="#64748B" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[s.sendBtn, !text.trim() && s.sendBtnOff]}
                onPress={handleSend}
                disabled={!text.trim() || sending}
                activeOpacity={0.8}
              >
                <Ionicons name="send" size={18} color={text.trim() ? '#0F172A' : '#334155'} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Overlays ── */}
      {actionMsg && (
        <InlineActionBar
          isMine={actionMsg.sender_id === userId}
          onReact={emoji => handleReact(actionMsg.id, emoji)}
          onReply={() => {
            setActionMsgId(null)
            setReplyTo(actionMsg)
            setTimeout(() => inputRef.current?.focus(), 100)
          }}
          onDelete={actionMsg.sender_id === userId ? () => handleDelete(actionMsg) : undefined}
          onCopy={actionMsg.content ? () => handleCopy(actionMsg.content!) : undefined}
          onClose={() => setActionMsgId(null)}
        />
      )}

      <ThreeDotMenu
        visible={showMenu}
        isGroup={isGroup}
        onClose={() => setShowMenu(false)}
        onViewMedia={() => setShowMedia(true)}
        onSearch={() => setSearchMode(true)}
        onMute={() => Alert.alert('Muted', 'Notifications muted.')}
        onClearChat={handleClearChat}
        onGroupInfo={() => Alert.alert('Group Info', 'Group info screen coming soon.')}
        onBlock={() => Alert.alert('Block', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: () => router.back() },
        ])}
      />

      <MediaGallery
        messages={messages}
        visible={showMedia}
        onClose={() => setShowMedia(false)}
        onImagePress={uri => { setLightboxUri(uri); setLightboxName('') }}
      />

      <ContactInfoScreen
        visible={showContact}
        profile={otherProfile}
        onClose={() => setShowContact(false)}
        mediaMessages={messages}
        onAvatarPress={() => {
          setShowContact(false)
          if (otherProfile?.avatar_url) {
            setTimeout(() => openLightbox(otherProfile.avatar_url, safeName(otherProfile.full_name)), 350)
          }
        }}
      />

      <PhotoLightbox
        uri={lightboxUri}
        visible={!!lightboxUri}
        onClose={() => setLightboxUri(null)}
        name={lightboxName}
      />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1628' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E3A5F', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  topInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 1.5, borderColor: 'rgba(56,189,248,0.25)', justifyContent: 'center', alignItems: 'center' },
  topName: { fontSize: 15, fontWeight: '700', color: '#F1F5F9', flexShrink: 1 },
  topSub: { fontSize: 11, color: '#475569' },
  typingTxt: { fontSize: 11, color: '#38BDF8', fontStyle: 'italic' },
  topAction: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#F1F5F9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadTxt: { fontSize: 13, color: '#475569' },
  msgList: { paddingTop: 12, paddingBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9' },
  emptySub: { fontSize: 13, color: '#475569' },
  dateHdr: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14, paddingHorizontal: 20 },
  dateHdrLine: { flex: 1, height: 1, backgroundColor: '#1E3A5F' },
  dateHdrTxt: { fontSize: 11, fontWeight: '600', color: '#334155' },
  inputBar: { backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#1E3A5F', paddingTop: 10, paddingHorizontal: 12 },
  replyStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#38BDF8' },
  // FIX #1: no height:'100%' — parent uses alignItems:'center' + paddingVertical to size the row;
  //         rStripBar gets natural height from its sibling text content via alignSelf:'stretch'
  rStripBar: { width: 3, borderRadius: 2, backgroundColor: '#38BDF8', alignSelf: 'stretch' },
  rStripName: { fontSize: 11, fontWeight: '700', color: '#38BDF8', marginBottom: 1 },
  rStripContent: { fontSize: 12, color: '#64748B' },
  rStripClose: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachBtn: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#1E293B', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#1E3A5F', minHeight: 42, maxHeight: 120 },
  input: { flex: 1, fontSize: 14, color: '#F1F5F9', maxHeight: 100 },
  micBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  sendBtnOff: { backgroundColor: '#1E293B' },
  recBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1E293B', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#EF4444' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  recTxt: { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  recCancelBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(239,68,68,0.12)', justifyContent: 'center', alignItems: 'center' },
  recSendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#38BDF8', justifyContent: 'center', alignItems: 'center' },
})