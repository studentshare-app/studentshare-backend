/**
 * app/(tabs)/profile.tsx
 *
 * v4 — Consistent with index.tsx design system:
 *  - Shared C palette (void/deep/surface/raised/orange/border tokens)
 *  - Role shown as emerald pill
 *  - College shown as sapphire pill using short_name abbreviation
 *  - Class shown as lavender pill
 *  - Bio card is a clearly visible labelled card with an "Edit Bio" button
 *  - All cards use C.surface / C.raised / C.border
 *  - Header uses C.deep background matching index nav
 *
 * Logic unchanged: BioEditor save, AboutModal, PrivacyModal,
 * college/class routing (mode:'edit'), admin dashboard, logout, cache keys.
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAvatarRefetchLocked, useProfileSync } from '../../hooks/useProfileSync'
import { supabase } from '../../lib/supabase'

// ── Cache keys ────────────────────────────────────────────────────────────
const ALL_CACHE_KEYS = [
  'studentshare_user_id_cache',
  'studentshare_dashboard_cache',
  'studentshare_announcements_cache',
  'studentshare_leaderboard_cache',
  'studentshare_seen_material_ids',
  'studentshare_avatar_upload_queue',
  'studentshare_profile_tab_cache',
]

const BIO_MAX = 160

// ── Palette — exact tokens from index.tsx ────────────────────────────────
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
  orangeDim: 'rgba(232,105,42,0.10)',
  orangeGlow:'rgba(232,105,42,0.18)',
  gold:      '#DFA83C',
  goldDim:   'rgba(223,168,60,0.10)',
  sapphire:  '#4B8CF5',
  sapphDim:  'rgba(75,140,245,0.10)',
  sapphBorder:'rgba(75,140,245,0.20)',
  emerald:   '#3DC99A',
  emerDim:   'rgba(61,201,154,0.10)',
  emerBorder:'rgba(61,201,154,0.20)',
  lavender:  '#9B7CF4',
  lavDim:    'rgba(155,124,244,0.10)',
  lavBorder: 'rgba(155,124,244,0.20)',
  coral:     '#EE6868',
  coralDim:  'rgba(238,104,104,0.10)',
  sky:       '#38BDF8',
  skyDim:    'rgba(56,189,248,0.10)',
  // verified badge
  verified:  '#38BDF8',
  // logout
  red:       '#EE6868',
  redDim:    'rgba(238,104,104,0.10)',
  redBorder: 'rgba(238,104,104,0.20)',
} as const

// ── Mock stats ────────────────────────────────────────────────────────────
const MOCK_STATS = [
  { label: 'Points',      value: '1,250' },
  { label: 'Global Rank', value: '#12'   },
  { label: 'Docs Shared', value: '48'    },
]

// ── Mock badges ───────────────────────────────────────────────────────────
const BADGES = [
  { icon: 'trophy',   label: 'Top Contributor', earned: true  },
  { icon: 'sunny',    label: 'Early Bird',       earned: true  },
  { icon: 'heart',    label: 'Helper',           earned: false },
  { icon: 'flash',    label: 'Fast Learner',     earned: false },
  { icon: 'moon',     label: 'Night Owl',        earned: false },
]

// ─────────────────────────────────────────────
// BioEditor
// ─────────────────────────────────────────────
function BioEditor({
  userId,
  initialBio,
  onSaved,
}: {
  userId: string
  initialBio?: string | null
  onSaved?: (bio: string) => void
}) {
  // displayBio  = what is shown in read mode. Starts from prop, updated on save.
  // draftBio    = text inside the input while editing. Starts from displayBio on open.
  // Neither ever resets automatically from props — saves are permanent until next
  // explicit edit.
  const [displayBio, setDisplayBio] = useState(initialBio ?? '')
  const [draftBio,   setDraftBio]   = useState('')
  const [editing,    setEditing]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const checkAnim = useRef(new Animated.Value(0)).current

  // Only sync from parent prop on first mount or when not editing.
  // We use a ref to track whether we've ever saved, so a background
  // refetch after saving does NOT overwrite the locally-saved value.
  const hasSavedRef = useRef(false)
  useEffect(() => {
    if (!hasSavedRef.current) {
      setDisplayBio(initialBio ?? '')
    }
  }, [initialBio])

  function openEdit() {
    setDraftBio(displayBio)   // seed draft from current display value
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraftBio('')
  }

  async function handleSave() {
    if (saving) return
    const trimmed = draftBio.trim()
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ bio: trimmed })
      .eq('id', userId)
    setSaving(false)

    if (error) {
      Alert.alert('Could not save bio', error.message)
      return
    }

    // Immediately update display — this is the source of truth from now on
    hasSavedRef.current = true
    setDisplayBio(trimmed)
    setDraftBio('')
    setEditing(false)
    onSaved?.(trimmed)

    // Flash the "Bio saved" confirmation
    Animated.sequence([
      Animated.timing(checkAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(checkAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start()
  }

  const charsLeft = BIO_MAX - draftBio.length
  const isOver    = charsLeft < 0

  // ── Edit mode ──────────────────────────────────────────────────────────
  if (editing) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={be.editCard}>
          <View style={be.editHeader}>
            <View style={be.displayLabelRow}>
              <View style={be.displayLabelLine} />
              <Text style={be.displayLabel}>EDITING BIO</Text>
            </View>
          </View>
          <TextInput
            style={[be.input, isOver && be.inputOver]}
            value={draftBio}
            onChangeText={setDraftBio}
            placeholder="Write something about yourself…"
            placeholderTextColor={C.textMute}
            multiline
            scrollEnabled
            autoFocus
            textAlignVertical="top"
          />
          <View style={be.editFooter}>
            <Text style={[be.charCount, isOver && be.charOver]}>
              {isOver ? `${Math.abs(charsLeft)} over limit` : `${charsLeft} left`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={be.cancelBtn} onPress={cancelEdit}>
                <Text style={be.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[be.saveBtn, (isOver || saving) && be.saveBtnOff]}
                onPress={handleSave}
                disabled={isOver || saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={be.saveTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Display mode ────────────────────────────────────────────────────────
  return (
    <View style={be.displayCard}>
      <View style={be.displayLabelRow}>
        <View style={be.displayLabelLine} />
        <Text style={be.displayLabel}>BIO</Text>
      </View>
      {/* Bio text — not tappable; only the button opens edit mode */}
      <View style={be.displayBody}>
        <Text style={[be.bioTxt, !displayBio.trim() && be.bioPlaceholder]} numberOfLines={4}>
          {displayBio.trim() || 'Add a short bio — tell people who you are…'}
        </Text>
      </View>
      <TouchableOpacity style={be.editBioBtn} onPress={openEdit} activeOpacity={0.8}>
        <Ionicons name="pencil-outline" size={13} color={C.orange} />
        <Text style={be.editBioBtnTxt}>{displayBio.trim() ? 'Edit Bio' : 'Add Bio'}</Text>
      </TouchableOpacity>
      <Animated.View style={[be.savedRow, { opacity: checkAnim }]}>
        <Ionicons name="checkmark-circle" size={13} color={C.emerald} />
        <Text style={be.savedTxt}>Bio saved</Text>
      </Animated.View>
    </View>
  )
}

const be = StyleSheet.create({
  // ── Display mode ─────────────────────────────────────────────────────
  displayCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  displayLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayLabelLine: { width: 12, height: 1.5, backgroundColor: C.orange, borderRadius: 1 },
  displayLabel:     { fontSize: 9, fontWeight: '700', letterSpacing: 2.5, color: C.orange },
  displayBody:      { minHeight: 32 },
  bioTxt:           { fontSize: 13.5, color: C.text, lineHeight: 21, fontStyle: 'italic' },
  bioPlaceholder:   { color: C.textSub, fontStyle: 'italic' },
  editBioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.orangeDim,
    borderWidth: 1, borderColor: 'rgba(232,105,42,0.25)',
    borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7,
  },
  editBioBtnTxt: { fontSize: 12, fontWeight: '700', color: C.orange },
  savedRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedTxt:      { fontSize: 12, color: C.emerald, fontWeight: '600' },

  // ── Edit mode ────────────────────────────────────────────────────────
  editCard: {
    backgroundColor: C.raised,
    borderWidth: 1.5,
    borderColor: C.orange,
    borderRadius: 18,
    overflow: 'hidden',
  },
  editHeader:  { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  // Fixed height: user can scroll text inside; footer is always visible
  input: {
    fontSize: 13.5, color: C.text,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    height: 100,                  // fixed — never grows
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  inputOver:  { color: C.coral },
  editFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  charCount:  { fontSize: 11, color: C.textSub },
  charOver:   { color: C.coral },
  cancelBtn:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  cancelTxt:  { fontSize: 13, fontWeight: '600', color: C.textSub },
  saveBtn:    { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: C.orange },
  saveBtnOff: { opacity: 0.5 },
  saveTxt:    { fontSize: 13, fontWeight: '800', color: '#fff' },
})

// ─────────────────────────────────────────────
// About modal
// ─────────────────────────────────────────────
function AboutModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={am.root}>
        <View style={am.header}>
          <Text style={am.title}>About StudentShare</Text>
          <TouchableOpacity onPress={onClose} style={am.closeBtn}>
            <Ionicons name="close" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={am.body} showsVerticalScrollIndicator={false}>
          <View style={am.logoWrap}>
            <View style={am.logo}><Ionicons name="school" size={36} color={C.orange} /></View>
            <Text style={am.appName}>StudentShare</Text>
            <Text style={am.version}>Version 1.0.1</Text>
          </View>
          <Text style={am.tagline}>
            The all-in-one platform built for students — get notes, slides, past questions,
            chat with classmates, collaborate on projects and stay connected with your college community.
          </Text>
          <View style={am.divider} />
          {[
            { icon: 'chatbubbles-outline',      title: 'Student Messaging',  desc: 'Direct messages and group chats with classmates — real-time, offline-first.' },
            { icon: 'document-text-outline',    title: 'Note Sharing',       desc: 'Discover class notes, past papers and study materials.' },
            { icon: 'people-outline',           title: 'Class Community',    desc: 'Connect with everyone in your class and college in one place.' },
            { icon: 'sparkles-outline',         title: 'AI Chat',            desc: 'Chat with your slides using our StudentShare AI assistant.' },
            { icon: 'shield-checkmark-outline', title: 'Safe & Private',     desc: 'Your data stays within your college community. No ads, ever.' },
          ].map(f => (
            <View key={f.title} style={am.feature}>
              <View style={am.featureIcon}>
                <Ionicons name={f.icon as any} size={20} color={C.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={am.featureTitle}>{f.title}</Text>
                <Text style={am.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
          <View style={am.divider} />
          <Text style={am.footerTxt}>Made with ❤️ for students everywhere.</Text>
          <Text style={am.footerSub}>© 2026 StudentShare. All rights reserved.</Text>
        </ScrollView>
      </View>
    </Modal>
  )
}
const am = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:        { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  closeBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  body:         { padding: 24, paddingBottom: 48 },
  logoWrap:     { alignItems: 'center', marginBottom: 24 },
  logo:         { width: 80, height: 80, borderRadius: 22, backgroundColor: C.orangeDim, borderWidth: 1.5, borderColor: 'rgba(232,105,42,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  appName:      { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  version:      { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  tagline:      { fontSize: 14, color: '#475569', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  divider:      { height: 1, backgroundColor: '#F1F5F9', marginVertical: 20 },
  feature:      { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  featureIcon:  { width: 42, height: 42, borderRadius: 12, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  featureDesc:  { fontSize: 13, color: '#64748B', lineHeight: 18 },
  footerTxt:    { fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 4 },
  footerSub:    { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
})

// ─────────────────────────────────────────────
// Privacy Policy modal
// ─────────────────────────────────────────────
function PrivacyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sections = [
    { title: 'Information We Collect',      body: 'We collect your name, email address, college and class information that you provide when creating your account. We also collect messages and files you share within the app.' },
    { title: 'How We Use Your Information', body: 'Your information is used solely to operate StudentShare — to connect you with classmates, deliver messages, and personalise your experience. We do not sell your data to third parties.' },
    { title: 'Data Sharing',                body: 'Your profile (name, bio, college, class) is visible to other students within your college community. Your messages are only visible to the participants in that conversation.' },
    { title: 'Data Storage & Security',     body: 'Your data is stored securely using Supabase (PostgreSQL) with row-level security. All communications are encrypted in transit using TLS.' },
    { title: 'Your Rights',                 body: 'You can update or delete your profile information at any time from the Profile screen. To permanently delete your account and all associated data, contact us at infostudentshare@gmail.com.' },
    { title: 'Cookies & Analytics',         body: 'We do not use advertising cookies. We may collect anonymous usage analytics (crash reports, feature usage) to improve the app.' },
    { title: 'Changes to This Policy',      body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes via the app. Continued use of StudentShare after changes constitutes your acceptance.' },
    { title: 'Contact Us',                  body: 'If you have any questions about this Privacy Policy, please contact us at infostudentshare@gmail.com' },
  ]
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={pp.root}>
        <View style={pp.header}>
          <Text style={pp.title}>Privacy Policy</Text>
          <TouchableOpacity onPress={onClose} style={pp.closeBtn}>
            <Ionicons name="close" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={pp.body} showsVerticalScrollIndicator={false}>
          <Text style={pp.updated}>Last updated: March 2026</Text>
          <Text style={pp.intro}>
            StudentShare ("we", "our", "us") is committed to protecting your privacy.
            This policy explains what information we collect, how we use it, and your rights.
          </Text>
          {sections.map(sec => (
            <View key={sec.title} style={pp.section}>
              <Text style={pp.sectionTitle}>{sec.title}</Text>
              <Text style={pp.sectionBody}>{sec.body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}
const pp = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:        { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  closeBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  body:         { padding: 24, paddingBottom: 48 },
  updated:      { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  intro:        { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 20 },
  section:      { marginBottom: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  sectionBody:  { fontSize: 13, color: '#475569', lineHeight: 21 },
})

// ─────────────────────────────────────────────
// MenuRow — individual card, index.tsx surface style
// ─────────────────────────────────────────────
function MenuRow({
  icon, title, sub, onPress,
  color = C.orange,
  iconBg = C.orangeDim,
  iconBorderColor = 'rgba(232,105,42,0.20)',
}: {
  icon: string; title: string; sub?: string
  onPress: () => void
  color?: string; iconBg?: string; iconBorderColor?: string
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.rowIconWrap, { backgroundColor: iconBg, borderColor: iconBorderColor }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.textMute} />
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────
export default function ProfileScreen() {
  const router      = useRouter()
  const queryClient = useQueryClient()
  const insets      = useSafeAreaInsets()

  const { profile, userId, loading, isAdmin } = useProfileSync()

  const pulseAnim = useRef(new Animated.Value(1)).current

  const [showAbout,       setShowAbout]       = useState(false)
  const [showPrivacy,     setShowPrivacy]     = useState(false)
  const [showCollegeDialog, setShowCollegeDialog] = useState(false)

  // Pulsing avatar ring
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.09, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 1400, useNativeDriver: true }),
      ])
    ).start()
  }, [])

const handleProfileUpdate = async () => {
    if (!userId) return
    // Broad refetch all relevant queries
    queryClient.invalidateQueries({ predicate: query => 
      query.queryKey[0] === 'dashboard' ||
      query.queryKey[0] === 'materials' ||
      query.queryKey[0] === 'leaderboard_college' ||
      query.queryKey[0] === 'leaderboard' ||
      query.queryKey[0] === 'announcements'
    })
    // Clear all relevant caches
    await AsyncStorage.multiRemove([
      'studentshare_dashboard_cache',
      'studentshare_announcements_cache',
      'studentshare_materials_cache',
      'studentshare_materials_meta',
      'studentshare_seen_material_ids',
      'studentshare_leaderboard_cache',
    ]).catch(() => {})
  }

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(ALL_CACHE_KEYS).catch(() => {})
          queryClient.clear()
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (loading && !profile) {
    return (
      <View style={s.loadingScreen}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={s.loadingTxt}>Loading profile…</Text>
      </View>
    )
  }

  const fullName    = profile?.full_name   ?? 'Student'
  const isVerified  = profile?.is_verified ?? false
  const avatarUrl   = profile?.avatar_url  ?? null
  const initial     = fullName.charAt(0).toUpperCase()
  // Use short_name for the college pill (falls back to full name if not set)
  const collegeShort = (profile?.college as any)?.short_name ?? profile?.college?.name ?? null
  const className    = profile?.class?.name ?? null

  const rawRole   = (profile as any)?.role ?? null
  const roleLabel = rawRole === 'admin' ? 'ADMIN' : rawRole ? rawRole.toUpperCase() : 'STUDENT'

  // Role pill colours
  const rolePillColor  = rawRole === 'admin' ? C.gold    : C.emerald
  const rolePillBg     = rawRole === 'admin' ? C.goldDim : C.emerDim
  const rolePillBorder = rawRole === 'admin' ? 'rgba(223,168,60,0.25)' : C.emerBorder

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* ── Sticky Header ── */}
        <View style={[s.headerWrapper, { paddingTop: insets.top }]}>
          <View style={s.header}>
            <Text style={s.headerTitle}>Profile</Text>
            <TouchableOpacity style={s.headerBtn}>
              <Ionicons name="ellipsis-vertical" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Hero ── */}
        <View style={s.hero}>
          {/* Ambient orbs — same style as index.tsx */}
          <View style={s.orbOrange} />
          <View style={s.orbBlue} />

          {/* Avatar */}
          <View style={s.avatarOuter}>
            <Animated.View style={[s.avatarRing, { transform: [{ scale: pulseAnim }] }]} />
            <View style={s.avatarInner}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={s.avatarImage} key={avatarUrl} />
                : <View style={s.avatarCircle}>
                    <Text style={s.avatarInitial}>{initial}</Text>
                  </View>
              }
            </View>
            {/* Blue verified badge — only for verified users */}
            {isVerified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={s.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {fullName}
          </Text>

          {/* ── Three pills: Role · College (short) · Class ── */}
          <View style={s.pillsRow}>
            {/* Role pill */}
            <View style={[s.pill, { backgroundColor: rolePillBg, borderColor: rolePillBorder }]}>
              {rawRole === 'admin' && <Ionicons name="shield-checkmark" size={10} color={rolePillColor} />}
              <Text style={[s.pillTxt, { color: rolePillColor }]}>{roleLabel}</Text>
            </View>

            {/* College pill (short_name) */}
            {collegeShort ? (
              <View style={[s.pill, { backgroundColor: C.sapphDim, borderColor: C.sapphBorder }]}>
                <Text style={{ fontSize: 10 }}>🏛</Text>
                <Text style={[s.pillTxt, { color: C.sapphire }]} numberOfLines={1}>{collegeShort}</Text>
              </View>
            ) : null}

            {/* Class pill */}
            {className ? (
              <View style={[s.pill, { backgroundColor: C.lavDim, borderColor: C.lavBorder }]}>
                <Text style={{ fontSize: 10 }}>🎓</Text>
                <Text style={[s.pillTxt, { color: C.lavender }]} numberOfLines={1}>{className}</Text>
              </View>
            ) : null}
          </View>

          {/* Set up pill — only when BOTH college and class are missing */}
          {(!collegeShort && !className) && (
            <TouchableOpacity
              style={s.setUpPill}
              onPress={() => router.push('/(auth)/college-selection' as any)}
            >
              <Ionicons name="alert-circle-outline" size={13} color={C.gold} />
              <Text style={s.setUpTxt}>Set your college &amp; class</Text>
            </TouchableOpacity>
          )}

          {/* Stats row */}
          <View style={s.statsRow}>
            {MOCK_STATS.map(stat => (
              <View key={stat.label} style={s.statCard}>
                <Text style={s.statValue}>{stat.value}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Bio card ── */}
        <View style={s.bioSection}>
          <BioEditor
            userId={userId ?? ''}
            initialBio={profile?.bio ?? null}
            onSaved={newBio => {
              queryClient.setQueryData(['dashboard', userId], (old: any) =>
                old ? { ...old, profile: { ...old.profile, bio: newBio } } : old
              )
              if (!isAvatarRefetchLocked()) {
                queryClient.invalidateQueries({ queryKey: ['dashboard', userId] })
              }
            }}
          />
        </View>

        {/* ── Achievement Badges ── */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={s.sectionHeadLeft}>
              <View style={s.sectionLine} />
              <Text style={s.sectionLabel}>ACHIEVEMENT BADGES</Text>
            </View>
            <TouchableOpacity><Text style={s.viewAll}>View all</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badgesScroll}>
            {BADGES.map(badge => (
              <View key={badge.label} style={[s.badgeCircle, badge.earned && s.badgeCircleEarned]}>
                <Ionicons
                  name={badge.icon as any}
                  size={26}
                  color={badge.earned ? C.orange : C.textMute}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Account & Experience ── */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <View style={s.sectionHeadLeft}>
              <View style={s.sectionLine} />
              <Text style={s.sectionLabel}>ACCOUNT &amp; EXPERIENCE</Text>
            </View>
          </View>

          <MenuRow
            icon="school-outline"
            title="College"
            sub={collegeShort ?? 'Tap to set your college'}
            iconBg={C.sapphDim}
            iconBorderColor={C.sapphBorder}
            color={C.sapphire}
            onPress={() => setShowCollegeDialog(true)}
          />

          <MenuRow
            icon="book-outline"
            title="Class"
            sub={className ?? 'Tap to set your class'}
            iconBg={C.lavDim}
            iconBorderColor={C.lavBorder}
            color={C.lavender}
            onPress={async () => {
              await handleProfileUpdate()
              router.push({ pathname: '/(auth)/class-selection', params: { college_id: profile?.college_id ?? '', mode: 'edit' } } as any)
            }}
          />

          {isAdmin && (
            <MenuRow
              icon="shield-checkmark-outline"
              title="Admin Dashboard"
              sub="Manage classes, colleges & content"
              color={C.gold}
              iconBg={C.goldDim}
              iconBorderColor="rgba(223,168,60,0.25)"
              onPress={() => router.push('/admin-dashboard' as any)}
            />
          )}

          <MenuRow
            icon="information-circle-outline"
            title="About StudentShare"
            sub="Version, features & credits"
            onPress={() => setShowAbout(true)}
          />

          <MenuRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            sub="How we protect your data"
            iconBg={C.emerDim}
            iconBorderColor={C.emerBorder}
            color={C.emerald}
            onPress={() => setShowPrivacy(true)}
          />

          <MenuRow
            icon="mail-outline"
            title="Contact Support"
            sub="infostudentshare@gmail.com"
            iconBg={C.sapphDim}
            iconBorderColor={C.sapphBorder}
            color={C.sapphire}
            onPress={() => Linking.openURL('mailto:infostudentshare@gmail.com')}
          />
        </View>

        {/* ── Logout ── */}
        <View style={s.section}>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
            <View style={s.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={18} color={C.red} />
            </View>
            <Text style={s.logoutTxt}>Log Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <AboutModal   visible={showAbout}   onClose={() => setShowAbout(false)} />
      <PrivacyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <Modal visible={showCollegeDialog} transparent animationType="fade" presentationStyle="overFullScreen">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }} activeOpacity={1} onPress={() => setShowCollegeDialog(false)}>
          <TouchableOpacity activeOpacity={1} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: C.surface, borderRadius: 24, padding: 32, alignItems: 'center', gap: 16, borderWidth: 1, borderColor: C.border }}>
              <Ionicons name="information-circle" size={48} color={C.orange} />
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center', lineHeight: 26 }}>Strict College Change Rule</Text>
              <Text style={{ fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 22, marginHorizontal: 8 }}>Changing your college will reset your class selection. You must pick a new class to see personalized materials for your new college.</Text>
              <TouchableOpacity style={{ flexDirection: 'row', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14 }} onPress={async () => {
                setShowCollegeDialog(false)
                await handleProfileUpdate()
                router.push({ pathname: '/(auth)/class-selection', params: { mode: 'strict' } } as any)
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Update Class Now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCollegeDialog(false)}>
                <Text style={{ fontSize: 14, color: C.sapphire, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.void },
  loadingScreen:{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.void, gap: 12 },
  loadingTxt:   { fontSize: 13, color: C.textSub, fontWeight: '500' },

  // ── Sticky header — matches index.tsx nav style ───────────────────────
  headerWrapper: { backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, minHeight: 54,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: 0.2 },
  headerBtn: {
    position: 'absolute', right: 16, top: 0, bottom: 0,
    width: 36, borderRadius: 13,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Hero — same dark background as index ─────────────────────────────
  hero: {
    backgroundColor: C.deep,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 32,
    position: 'relative',
    overflow: 'hidden',
  },

  // Ambient orbs
  orbOrange: { position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(232,105,42,0.10)' },
  orbBlue:   { position: 'absolute', top: 40,  left: -60,  width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(75,140,245,0.07)' },

  // Avatar
  avatarOuter:   { width: 140, height: 140, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  avatarRing: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    borderWidth: 2, borderColor: C.orange, opacity: 0.5,
  },
  avatarInner:   { width: 122, height: 122, borderRadius: 61, overflow: 'hidden', backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  avatarImage:   { width: 122, height: 122, borderRadius: 61 },
  avatarCircle:  { width: 122, height: 122, borderRadius: 61, backgroundColor: C.orangeDim, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: C.orange, fontSize: 44, fontWeight: '900' },
  verifiedBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.sky,
    borderWidth: 2.5, borderColor: C.deep,
    justifyContent: 'center', alignItems: 'center',
  },

  // Name
  heroName: {
    fontSize: 26, fontWeight: '900', color: C.text,
    letterSpacing: -0.3, marginBottom: 16, textAlign: 'center',
    fontFamily: 'serif',
  },

  // ── Pills row — role · college · class ───────────────────────────────
  pillsRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, justifyContent: 'center',
    marginBottom: 20,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 100,
    paddingHorizontal: 11, paddingVertical: 5,
    maxWidth: 180,
  },
  pillTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 },

  // Set up pill (warning state)
  setUpPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(223,168,60,0.25)',
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 20,
  },
  setUpTxt: { fontSize: 12, fontWeight: '700', color: C.gold },

  // Stats row
  statsRow: { flexDirection: 'row', width: '100%', gap: 10 },
  statCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, paddingVertical: 16,
  },
  statValue: { fontSize: 21, fontWeight: '800', color: C.orange, lineHeight: 25 },
  statLabel: { fontSize: 9, fontWeight: '700', color: C.textSub, letterSpacing: 0.8, marginTop: 4, textTransform: 'uppercase', textAlign: 'center' },

  // ── Bio section ───────────────────────────────────────────────────────
  bioSection: { paddingHorizontal: 20, marginTop: 28 },

  // ── Sections ─────────────────────────────────────────────────────────
  section:      { paddingHorizontal: 20, marginTop: 28 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionHeadLeft:{ flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionLine:  { width: 14, height: 1.5, backgroundColor: C.orange, borderRadius: 1 },
  sectionLabel: { fontSize: 9.5, fontWeight: '700', color: C.textSub, letterSpacing: 2.6 },
  viewAll:      { fontSize: 11, fontWeight: '700', color: C.orange },

  // Badges
  badgesScroll:      { paddingBottom: 4, gap: 12 },
  badgeCircle: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  badgeCircleEarned: { borderColor: 'rgba(232,105,42,0.25)', backgroundColor: C.orangeDim },

  // ── Menu rows — index.tsx card surface style ──────────────────────────
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 8,
  },
  rowIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  rowTitle:    { fontSize: 14, fontWeight: '600', color: C.text },
  rowSub:      { fontSize: 12, color: C.textSub, marginTop: 1.5 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.redDim, borderWidth: 1, borderColor: C.redBorder,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
  },
  logoutIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(238,104,104,0.15)', borderWidth: 1, borderColor: C.redBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  logoutTxt: { fontSize: 14, fontWeight: '700', color: C.red },
})