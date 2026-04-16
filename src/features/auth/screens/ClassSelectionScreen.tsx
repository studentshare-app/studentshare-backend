/**
 * app/(auth)/class-selection.tsx
 *
 * Redesigned to match index.tsx editorial dark theme.
 *
 * mode = 'onboarding' (default)  → saves to profiles, routes to /(tabs)
 * mode = 'edit'                  → saves to profiles, routes to /(tabs)/profile
 * mode = 'signup'                → saves to AsyncStorage only (no session yet),
 *                                   routes BACK to /(auth)/signup
 *
 * FIX: signup mode now uses router.back() instead of router.replace(ROUTES_SIGNUP).
 * Same root cause as college-selection — router.replace() remounted signup,
 * causing text field useEffects to overwrite AsyncStorage with empty strings.
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/core/api/supabase'

// ─────────────────────────────────────────────
// Design tokens — mirrors index.tsx exactly
// ─────────────────────────────────────────────
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
  orange2:   '#F07840',
  orangeDim: 'rgba(232,105,42,0.10)',
  orangeGlow:'rgba(232,105,42,0.18)',
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

// ─────────────────────────────────────────────
// AsyncStorage keys
// ─────────────────────────────────────────────
const SIGNUP_CLASS_ID_KEY   = 'signup_draft_class_id'
const SIGNUP_CLASS_NAME_KEY = 'signup_draft_class_name'

type Class = {
  id: string
  name: string
  display_order: number
  logo_url: string | null
}

// ─────────────────────────────────────────────
// Class Card — dark editorial style
// ─────────────────────────────────────────────
function ClassCard({
  item, isSelected, onPress, index, isAdmin, onEdit, disabled,
}: {
  item: Class
  isSelected: boolean
  onPress: () => void
  index: number
  isAdmin: boolean
  onEdit: () => void
  disabled: boolean
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(20)).current
  const scale      = useRef(new Animated.Value(1)).current

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 400, delay: index * 55, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 55, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
  }, [])

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()

  const accentColors = [C.sapphire, C.lavender, C.emerald, C.gold, C.coral, C.sky, C.orange]
  const accent = accentColors[index % accentColors.length]
  const accentDim = [
    C.sapphDim, C.lavDim, C.emerDim, C.goldDim, C.coralDim, C.skyDim, C.orangeDim,
  ][index % accentColors.length]

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <TouchableOpacity
        style={[s.card, isSelected && s.cardSelected, disabled && s.cardDisabled]}
        onPress={disabled ? undefined : onPress}
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        activeOpacity={1}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Select ${item.name}`}
        accessibilityState={{ selected: isSelected, disabled }}
      >
        {isSelected && <View style={s.cardAccentBar} />}
        {isSelected && <View style={s.cardGlow} />}

        <View style={[s.iconWrap, { backgroundColor: isSelected ? C.orangeDim : accentDim, borderColor: isSelected ? 'rgba(232,105,42,0.25)' : 'transparent', borderWidth: 1 }]}>
          <Ionicons name="people" size={22} color={isSelected ? C.orange : accent} />
        </View>

        <View style={s.cardInfo}>
          <Text style={[s.cardName, isSelected && s.cardNameSelected]} numberOfLines={2}>{item.name}</Text>
        </View>

        <View style={s.rightActions}>
          {isAdmin && (
            <TouchableOpacity style={s.editBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={14} color={C.textSub} />
            </TouchableOpacity>
          )}
          {isSelected
            ? (
              <View style={s.checkCircle}>
                <LinearGradient colors={[C.orange, C.orange2]} style={s.checkGrad}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </LinearGradient>
              </View>
            )
            : <View style={s.chevronBox}><Ionicons name="chevron-forward" size={14} color={C.textMute} /></View>
          }
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function ClassSelectionScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { college_id, mode } = useLocalSearchParams<{ college_id: string; mode?: string }>()
  const isEditMode   = mode === 'edit'
  const isSignupMode = mode === 'signup'

  const [classes,      setClasses]      = useState<Class[]>([])
  const [filtered,     setFiltered]     = useState<Class[]>([])
  const [selected,     setSelected]     = useState<string | null>(null)
  const [search,       setSearch]       = useState('')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [editName,     setEditName]     = useState('')
  const [editSaving,   setEditSaving]   = useState(false)

  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
    fetchClasses()
    if (!isSignupMode) checkAdmin()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = search.trim().toLowerCase()
      setFiltered(q === '' ? classes : classes.filter(c => c.name.toLowerCase().includes(q)))
    }, 150)
    return () => clearTimeout(timer)
  }, [search, classes])

  async function checkAdmin() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single<{ role: string | null }>()
      setIsAdmin(data?.role === 'admin')
    } catch { /* non-admin by default */ }
  }

  async function fetchClasses() {
    if (!college_id) { setLoading(false); return }
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, display_order, logo_url')
      .eq('college_id', college_id)
      .order('display_order')
    if (error) {
      Alert.alert('Error', 'Could not load classes. Please try again.')
    } else {
      setClasses(data ?? [])
      setFiltered(data ?? [])
    }
    setLoading(false)
  }

  async function handleContinue() {
    if (!selected) { Alert.alert('Select a class', 'Please select your class to continue'); return }
    setSaving(true)
    try {
      if (isSignupMode) {
        const chosenClass = classes.find(c => c.id === selected)
        await AsyncStorage.multiSet([
          [SIGNUP_CLASS_ID_KEY,   selected],
          [SIGNUP_CLASS_NAME_KEY, chosenClass?.name ?? ''],
        ])
        // ── FIX: use router.back() not router.replace() ──────────────────
        // Same issue as college-selection: router.replace() remounts signup,
        // all useState resets to '' and text field useEffects overwrite
        // AsyncStorage before the multiGet restore runs.
        router.back()
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { Alert.alert('Session expired', 'Please log in again.'); router.replace('/(auth)/login'); return }
      const isValidClass = classes.some(c => c.id === selected)
      if (!isValidClass) { Alert.alert('Invalid selection', 'Please select a valid class.'); setSelected(null); return }
      const { error } = await supabase.from('profiles').upsert({ id: session.user.id, class_id: selected })
      if (error) throw error
      if (mode === 'strict') {
        Alert.alert('Class Updated ✓', 'Materials and content will now refresh for your class.', [
          { text: 'Done', onPress: () => router.replace('/(tabs)') }
        ])
      } else if (isEditMode) router.replace('/(tabs)/profile')
      else router.replace('/(tabs)')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('JWT') || message.includes('session')) {
        Alert.alert('Session expired', 'Please log in again.')
        router.replace('/(auth)/login')
      } else {
        Alert.alert('Error', 'Could not save your class. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveClassName() {
    if (!editingClass || !editName.trim()) return
    setEditSaving(true)
    const { error } = await supabase.from('classes').update({ name: editName.trim() }).eq('id', editingClass.id)
    setEditSaving(false)
    if (error) {
      Alert.alert('Error', 'Could not update class name')
    } else {
      setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, name: editName.trim() } : c))
      setEditingClass(null)
      setEditName('')
    }
  }

  function handleBack() {
    if (isEditMode) router.replace('/(tabs)/profile')
    else router.back()
  }

  const selectedClass = classes.find(c => c.id === selected)

  if (loading) {
    return (
      <View style={s.loadingScreen}>
        <View style={s.loadingOrb1} />
        <View style={s.loadingOrb2} />
        <View style={s.loadingSpinnerWrap}>
          <ActivityIndicator size="large" color={C.orange} />
        </View>
        <Text style={s.loadingTitle}>Loading classes...</Text>
        <Text style={s.loadingSubText}>Fetching classes for your college</Text>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <View style={s.orbOrange} />
      <View style={s.orbBlue} />
      <View style={s.orbPurple} />

      <Animated.View style={[s.hero, { paddingTop: insets.top + 12 }, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>

        <TouchableOpacity style={s.backBtn} onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={15} color={C.textSub} />
          <Text style={s.backBtnText}>
            {isSignupMode ? 'Back to Sign Up' : isEditMode ? 'Back to Profile' : 'Change college'}
          </Text>
        </TouchableOpacity>

        {!isEditMode && !isSignupMode && (
          <>
            <View style={s.stepsRow}>
              <View style={s.stepDone}><Ionicons name="checkmark" size={11} color="#fff" /></View>
              <View style={s.connectorDone} />
              <View style={s.stepDone}><Ionicons name="checkmark" size={11} color="#fff" /></View>
              <View style={s.connectorActive} />
              <View style={s.stepActive}><Text style={s.stepNumActive}>3</Text></View>
            </View>
            <Text style={s.stepLabel}>STEP 3 OF 3 — ALMOST DONE</Text>
          </>
        )}

        <Text style={s.heroTitle}>
          {isEditMode ? 'Change your class' : 'Which class\nare you in?'}
        </Text>
        <Text style={s.heroSub}>
          {isEditMode ? 'Select your new class' : "We'll show you materials specific to your class."}
        </Text>

        {isAdmin && (
          <View style={s.adminBadge}>
            <Ionicons name="shield-checkmark" size={12} color={C.gold} />
            <Text style={s.adminBadgeText}>Admin — tap ✏️ to edit class names</Text>
          </View>
        )}

        <View style={s.searchBar}>
          <View style={s.searchIconBox}>
            <Ionicons name="search-outline" size={15} color={C.textSub} />
          </View>
          <TextInput
            style={s.searchInput}
            placeholder="Search classes..."
            placeholderTextColor={C.textMute}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            editable={!saving}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={s.searchClearBtn}>
                <Ionicons name="close" size={13} color={C.textSub} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {search.length > 0 && (
          <Text style={s.resultCount}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
          </Text>
        )}
      </Animated.View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={[s.listContent, { paddingBottom: selectedClass ? 196 : 140 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!saving}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <View style={s.emptyIconWrap}>
              <Ionicons name={search.length > 0 ? 'search-outline' : 'people-outline'} size={32} color={C.textMute} />
            </View>
            <Text style={s.emptyTitle}>{search.length > 0 ? 'No classes found' : 'No classes available'}</Text>
            <Text style={s.emptySubtitle}>{search.length > 0 ? 'Try a different search term' : 'No classes have been added for this college yet'}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <ClassCard
            item={item}
            isSelected={selected === item.id}
            onPress={() => setSelected(item.id)}
            index={index}
            isAdmin={isAdmin}
            onEdit={() => { setEditingClass(item); setEditName(item.name) }}
            disabled={saving}
          />
        )}
      />

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {selectedClass && (
          <View style={s.selectedBanner}>
            <View style={s.selectedBannerLeft}>
              <View style={s.selectedBannerDot} />
              <Text style={s.selectedBannerText} numberOfLines={1}>{selectedClass.name}</Text>
            </View>
            <View style={s.selectedBannerBadge}>
              <Ionicons name="people" size={12} color={C.orange} />
            </View>
          </View>
        )}
        <TouchableOpacity
          style={[s.continueBtn, (!selected || saving) && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected || saving}
          activeOpacity={0.87}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={s.continueBtnInner}>
              <Text style={s.continueBtnText}>
                {isEditMode ? 'Save Change' : isSignupMode ? 'Save Class' : 'Finish Setup'}
              </Text>
              <View style={[s.continueBtnArrow, !selected && s.continueBtnArrowDisabled]}>
                <Ionicons name="checkmark" size={16} color={selected ? C.orange : C.textMute} />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={editingClass !== null} transparent animationType="slide" onRequestClose={() => setEditingClass(null)}>
        <TouchableOpacity style={m.overlay} activeOpacity={1} onPress={() => setEditingClass(null)} />
        <View style={m.sheet}>
          <View style={m.handle} />
          <View style={m.iconWrap}>
            <LinearGradient colors={[C.orange, C.orange2]} style={m.iconGrad}>
              <Ionicons name="pencil" size={22} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={m.title}>Edit Class Name</Text>
          <Text style={m.subtitle}>Update the name for this class</Text>
          <View style={m.inputRow}>
            <View style={m.inputIconBox}>
              <Ionicons name="people-outline" size={16} color={C.textSub} />
            </View>
            <TextInput
              style={m.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter class name"
              placeholderTextColor={C.textMute}
              autoFocus
            />
          </View>
          <View style={m.btnRow}>
            <TouchableOpacity style={m.cancelBtn} onPress={() => { setEditingClass(null); setEditName('') }}>
              <Text style={m.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, editSaving && { opacity: 0.65 }]} onPress={saveClassName} disabled={editSaving}>
              {editSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={m.saveText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles — unchanged from original
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },

  orbOrange: { position: 'absolute', top: -100, right: -80,  width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(232,105,42,0.10)', zIndex: 0 },
  orbBlue:   { position: 'absolute', top:   60, left: -70,   width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(75,140,245,0.06)',  zIndex: 0 },
  orbPurple: { position: 'absolute', top:  140, left: '40%', width: 140, height: 140, borderRadius: 70,  backgroundColor: 'rgba(155,124,244,0.05)', zIndex: 0 },

  loadingScreen:     { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingOrb1:       { position: 'absolute', top: -80, right: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(232,105,42,0.08)' },
  loadingOrb2:       { position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(75,140,245,0.06)' },
  loadingSpinnerWrap:{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  loadingTitle:      { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  loadingSubText:    { fontSize: 13, color: C.textSub },

  hero: {
    backgroundColor: C.deep,
    paddingHorizontal: 22,
    paddingBottom: 20,
    zIndex: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },

  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8, marginBottom: 20 },
  backBtnText: { fontSize: 13, color: C.textSub, fontWeight: '600' },

  stepsRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  stepDone:       { width: 28, height: 28, borderRadius: 14, backgroundColor: C.emerald, justifyContent: 'center', alignItems: 'center', shadowColor: C.emerald, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 3 },
  connectorDone:  { width: 24, height: 2, backgroundColor: C.emerald, marginHorizontal: 4 },
  connectorActive:{ width: 24, height: 2, backgroundColor: C.emerald, marginHorizontal: 4 },
  stepActive:     { width: 28, height: 28, borderRadius: 14, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 3 },
  stepNumActive:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  stepLabel:      { fontSize: 9.5, color: C.textMute, fontWeight: '700', letterSpacing: 2.5, marginBottom: 16, marginTop: 6 },

  heroTitle: { fontSize: 30, fontWeight: '800', color: C.text, lineHeight: 38, marginBottom: 8, letterSpacing: -0.5, fontFamily: 'serif' },
  heroSub:   { fontSize: 14, color: C.textSub, marginBottom: 16, lineHeight: 21 },

  adminBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(223,168,60,0.2)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7, alignSelf: 'flex-start' },
  adminBadgeText: { fontSize: 12, color: C.gold, fontWeight: '600' },

  searchBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 5, paddingVertical: 5, gap: 6 },
  searchIconBox:  { width: 34, height: 34, borderRadius: 11, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  searchInput:    { flex: 1, fontSize: 14, color: C.text, paddingVertical: 7 },
  searchClearBtn: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', marginRight: 2 },
  resultCount:    { fontSize: 11, color: C.textMute, marginTop: 9, fontWeight: '600', letterSpacing: 0.3 },

  listContent: { paddingHorizontal: 16, paddingTop: 14 },

  emptyBox:     { alignItems: 'center', paddingTop: 64, gap: 12 },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: C.text },
  emptySubtitle:{ fontSize: 13, color: C.textSub, textAlign: 'center' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cardSelected: {
    borderColor: 'rgba(232,105,42,0.35)',
    backgroundColor: C.raised,
    shadowColor: C.orange,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  cardDisabled:     { opacity: 0.45 },
  cardAccentBar:    { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, backgroundColor: C.orange, borderRadius: 2, opacity: 0.9 },
  cardGlow:         { position: 'absolute', top: -20, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: C.orangeGlow, opacity: 0.45 },
  iconWrap:         { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14, flexShrink: 0 },
  cardInfo:         { flex: 1 },
  cardName:         { fontSize: 14.5, fontWeight: '700', color: C.text, lineHeight: 22, letterSpacing: -0.2 },
  cardNameSelected: { color: C.text },

  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn:      { width: 30, height: 30, borderRadius: 10, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  checkCircle:  { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0 },
  checkGrad:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chevronBox:   { width: 32, height: 32, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: C.deep,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  selectedBanner:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  selectedBannerLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  selectedBannerDot:   { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.orange, flexShrink: 0 },
  selectedBannerText:  { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  selectedBannerBadge: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.25)', justifyContent: 'center', alignItems: 'center' },

  continueBtn:              { backgroundColor: C.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  continueBtnDisabled:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, shadowOpacity: 0 },
  continueBtnInner:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  continueBtnText:          { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  continueBtnArrow:         { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  continueBtnArrowDisabled: { backgroundColor: C.raised },
})

const m = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:   {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 28, paddingBottom: 48,
    alignItems: 'center',
    borderTopWidth: 1, borderTopColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 24,
  },
  handle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 28 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, overflow: 'hidden', marginBottom: 14 },
  iconGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:    { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 5, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: C.textSub, marginBottom: 24 },
  inputRow: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: C.raised, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 24, overflow: 'hidden' },
  inputIconBox: { width: 48, height: 52, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: C.border },
  input:    { flex: 1, fontSize: 15, color: C.text, paddingVertical: 14, paddingLeft: 14, paddingRight: 14 },
  btnRow:   { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn:{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText:{ fontSize: 15, fontWeight: '600', color: C.textSub },
  saveBtn:  { flex: 1, padding: 14, borderRadius: 14, backgroundColor: C.orange, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})