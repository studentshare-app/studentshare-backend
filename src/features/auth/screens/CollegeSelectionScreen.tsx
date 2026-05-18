/**
 * app/(auth)/college-selection.tsx
 *
 * Redesigned to match index.tsx editorial dark theme.
 *
 * mode = 'onboarding' (default)  → saves to profiles, routes to class-selection
 * mode = 'edit'                  → saves to profiles, routes to class-selection?mode=edit or profile
 * mode = 'signup'                → saves to AsyncStorage only (no session yet),
 *                                   clears class draft, routes BACK to signup
 *
 * FIX: signup mode now uses router.back() instead of router.replace(ROUTES_SIGNUP).
 * router.replace() was remounting the signup screen from scratch, causing all
 * text field useEffects to fire with empty state and overwrite AsyncStorage
 * before the multiGet restore could run. router.back() returns to the existing
 * signup instance with all state intact — no remount, no race condition.
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
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
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
const SIGNUP_COLLEGE_ID_KEY   = 'signup_draft_college_id'
const SIGNUP_COLLEGE_NAME_KEY = 'signup_draft_college_name'
const SIGNUP_CLASS_ID_KEY     = 'signup_draft_class_id'
const SIGNUP_CLASS_NAME_KEY   = 'signup_draft_class_name'

type College = {
  id: string
  name: string
  short_name: string
  display_order: number
  logo_url: string | null
}

const MAX_RETRIES = 5

// ─────────────────────────────────────────────
// College Card — dark editorial style
// ─────────────────────────────────────────────
function CollegeCard({
  item, isSelected, onPress, index, disabled,
}: {
  item: College
  isSelected: boolean
  onPress: () => void
  index: number
  disabled: boolean
}) {
  const opacity    = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(20)).current
  const scale      = useRef(new Animated.Value(1)).current
  const [logoError, setLogoError] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 400, delay: index * 60, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: index * 60, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
  }, [])

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 4 }).start()
  const initials   = (item.short_name ?? item.name ?? '?').slice(0, 3).toUpperCase()

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

        <View style={[s.logoWrap, isSelected && s.logoWrapSelected]}>
          {item.logo_url && !logoError
            ? <Image source={{ uri: item.logo_url }} style={s.logoImg} resizeMode="contain" onError={() => setLogoError(true)} />
            : (
              <LinearGradient
                colors={isSelected ? [C.orange, C.gold] : [C.raised, C.lift2]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.logoGrad}
              >
                <Text style={[s.logoInitials, isSelected && s.logoInitialsSelected]}>{initials}</Text>
              </LinearGradient>
            )
          }
        </View>

        <View style={s.cardInfo}>
          <Text style={[s.cardName, isSelected && s.cardNameSelected]} numberOfLines={2}>{item.name}</Text>
          <View style={[s.shortPill, isSelected && s.shortPillSelected]}>
            <Text style={[s.shortPillText, isSelected && s.shortPillTextSelected]}>{item.short_name ?? ''}</Text>
          </View>
        </View>

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
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
export default function CollegeSelectionScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { isOffline } = useNetworkStatus()

  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const isEditMode   = mode === 'edit'
  const isSignupMode = mode === 'signup'

  const [userId,     setUserId]     = useState<string | null>(null)
  const [colleges,   setColleges]   = useState<College[]>([])
  const [filtered,   setFiltered]   = useState<College[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [saving,     setSaving]     = useState(false)

  const retryCount  = useRef(0)
  const heroOpacity = useRef(new Animated.Value(0)).current
  const heroY       = useRef(new Animated.Value(-20)).current

  useEffect(() => {
    if (!isSignupMode) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user) router.replace('/(auth)/login')
        else setUserId(session.user.id)
      })
    }
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(heroY,       { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
    fetchColleges()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = search.trim().toLowerCase()
      setFiltered(q === '' ? colleges : colleges.filter(c =>
        c.name.toLowerCase().includes(q) || (c.short_name ?? '').toLowerCase().includes(q)
      ))
    }, 150)
    return () => clearTimeout(timer)
  }, [search, colleges])

  async function fetchColleges() {
    if (retryCount.current >= MAX_RETRIES) {
      Alert.alert('Too many retries', 'Please restart the app and try again.')
      return
    }
    retryCount.current += 1
    setLoading(true)
    setFetchError(false)

    try {
      console.log('[fetchColleges] Starting query...')
      
      // Create a 10s timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase fetch timed out')), 10000)
      )

      // Race the supabase request against the timeout
      const result: any = await Promise.race([
        supabase
          .from('colleges')
          .select('id, name, short_name, display_order, logo_url')
          .order('display_order'),
        timeoutPromise
      ])

      console.log('[fetchColleges] Query completed, result count:', result.data?.length)

      setLoading(false)
      
      const { data, error } = result
      if (error || !data) {
        console.warn('[fetchColleges] Error from Supabase:', error)
        setFetchError(true)
      } else {
        retryCount.current = 0
        setColleges(data)
        setFiltered(data)
      }
    } catch (err: any) {
      console.warn('[fetchColleges] Exception caught:', err?.message || err)
      setLoading(false)
      setFetchError(true)
    }
  }

  async function handleContinue() {
    if (!selected) { Alert.alert('Select a college', 'Please select your college to continue'); return }
    if (isOffline && !isSignupMode) { Alert.alert('No internet', 'Please connect to the internet to continue.'); return }
    const isValidCollege = colleges.some(c => c.id === selected)
    if (!isValidCollege) { Alert.alert('Invalid selection', 'Please select a valid college.'); setSelected(null); return }

    setSaving(true)
    try {
      if (isSignupMode) {
        const chosenCollege = colleges.find(c => c.id === selected)
        await AsyncStorage.multiSet([
          [SIGNUP_COLLEGE_ID_KEY,   selected],
          [SIGNUP_COLLEGE_NAME_KEY, chosenCollege?.name ?? ''],
          // Clear class draft — college changed so class is no longer valid
          [SIGNUP_CLASS_ID_KEY,   ''],
          [SIGNUP_CLASS_NAME_KEY, ''],
        ])
        // ── FIX: use router.back() not router.replace() ──────────────────
        // router.replace() remounts signup from scratch → all useState resets
        // to '' → text field useEffects immediately overwrite AsyncStorage
        // with empty strings before multiGet restore runs → fields disappear.
        // router.back() returns to the existing signup instance with all
        // in-memory state intact. No remount, no race condition.
        router.back()
        return
      }

      if (!userId) { Alert.alert('Session expired', 'Please log in again.'); router.replace('/(auth)/login'); return }
      const upsertPayload = { id: userId, college_id: selected, class_id: null }
      const { error } = await supabase.from('profiles').upsert(upsertPayload)
      if (error) throw error
      if (isEditMode) {
        Alert.alert('College updated ✓', 'Your college has been saved. Would you like to update your class now?', [
          { text: 'Change Class', onPress: () => router.replace({ pathname: '/(auth)/class-selection', params: { college_id: selected, mode: 'edit' } } as any) },
          { text: 'Later', style: 'cancel', onPress: () => router.replace('/(tabs)/profile') },
        ])
      } else {
        router.replace({ pathname: '/(auth)/class-selection', params: { college_id: selected } } as any)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('JWT') || message.includes('session')) {
        Alert.alert('Session expired', 'Please log in again.')
        router.replace('/(auth)/login')
      } else {
        Alert.alert('Error', 'Could not save your college. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Back button — also use router.back() for signup mode ────────────────
  function handleBack() {
    if (isEditMode) router.replace('/(tabs)/profile')
    else router.back()
  }

  const selectedCollege = colleges.find(c => c.id === selected)

  if (loading) {
    return (
      <View style={s.loadingScreen}>
        <View style={s.loadingOrb1} />
        <View style={s.loadingOrb2} />
        <View style={s.loadingSpinnerWrap}>
          <ActivityIndicator size="large" color={C.orange} />
        </View>
        <Text style={s.loadingTitle}>Loading colleges...</Text>
        <Text style={s.loadingSubText}>Fetching Sierra Leone institutions</Text>
      </View>
    )
  }

  if (fetchError) {
    return (
      <View style={s.loadingScreen}>
        <View style={s.loadingOrb1} />
        <View style={s.loadingOrb2} />
        <View style={[s.loadingSpinnerWrap, { backgroundColor: C.coralDim, borderColor: 'rgba(238,104,104,0.2)' }]}>
          <Ionicons name="cloud-offline-outline" size={32} color={C.coral} />
        </View>
        <Text style={s.loadingTitle}>Could not load colleges</Text>
        <Text style={s.loadingSubText}>{isOffline ? 'No internet connection' : 'Server error — please try again'}</Text>
        <TouchableOpacity
          style={[s.retryBtn, retryCount.current >= MAX_RETRIES && s.retryBtnDisabled]}
          onPress={fetchColleges}
          disabled={retryCount.current >= MAX_RETRIES}
        >
          <Ionicons name="refresh-outline" size={15} color="#fff" />
          <Text style={s.retryBtnText}>{retryCount.current >= MAX_RETRIES ? 'Restart app to retry' : 'Try again'}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <View style={s.orbOrange} />
      <View style={s.orbBlue} />
      <View style={s.orbPurple} />

      <Animated.View style={[s.hero, { paddingTop: insets.top + 12 }, { opacity: heroOpacity, transform: [{ translateY: heroY }] }]}>

        {isEditMode ? (
          <TouchableOpacity style={s.backBtn} onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={15} color={C.textSub} />
            <Text style={s.backBtnText}>Back to Profile</Text>
          </TouchableOpacity>
        ) : isSignupMode ? (
          <TouchableOpacity style={s.backBtn} onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={15} color={C.textSub} />
            <Text style={s.backBtnText}>Back to Sign Up</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.stepsRow}>
            <View style={s.stepDone}><Ionicons name="checkmark" size={11} color="#fff" /></View>
            <View style={s.connectorActive} />
            <View style={s.stepActive}><Text style={s.stepNumActive}>2</Text></View>
            <View style={s.connector} />
            <View style={s.stepInactive}><Text style={s.stepNumInactive}>3</Text></View>
          </View>
        )}

        {!isEditMode && !isSignupMode && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.stepLabel}>STEP 2 OF 3</Text>
            <TouchableOpacity 
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={async () => {
                await supabase.auth.signOut()
              }}
            >
              <Text style={{ fontSize: 11, color: C.textSub, fontWeight: '700', letterSpacing: 0.5 }}>SIGN OUT</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.heroTitle}>
          {isEditMode ? 'Change your college' : 'Which college\ndo you attend?'}
        </Text>
        <Text style={s.heroSub}>
          {isEditMode
            ? 'Select your new college — your class will be reset'
            : "We'll personalise your materials based on your institution."}
        </Text>

        {isOffline && !isSignupMode && (
          <View style={s.offlineNotice}>
            <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
            <Text style={s.offlineNoticeText}>Offline — internet required to continue</Text>
          </View>
        )}

        <View style={s.searchBar}>
          <View style={s.searchIconBox}>
            <Ionicons name="search-outline" size={15} color={C.textSub} />
          </View>
          <TextInput
            style={s.searchInput}
            placeholder="Search colleges..."
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
        contentContainerStyle={[s.listContent, { paddingBottom: selectedCollege ? 196 : 140 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!saving}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <View style={s.emptyIconWrap}>
              <Ionicons name={search.length > 0 ? 'search-outline' : 'school-outline'} size={32} color={C.textMute} />
            </View>
            <Text style={s.emptyTitle}>{search.length > 0 ? 'No colleges found' : 'No colleges available'}</Text>
            <Text style={s.emptySubtitle}>{search.length > 0 ? 'Try a different search term' : 'Check back soon'}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <CollegeCard
            item={item}
            isSelected={selected === item.id}
            onPress={() => setSelected(item.id)}
            index={index}
            disabled={saving}
          />
        )}
      />

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        {selectedCollege && (
          <View style={s.selectedBanner}>
            <View style={s.selectedBannerLeft}>
              <View style={s.selectedBannerDot} />
              <Text style={s.selectedBannerText} numberOfLines={1}>{selectedCollege.name}</Text>
            </View>
            <View style={s.selectedBannerBadge}>
              <Text style={s.selectedBannerBadgeText}>{selectedCollege.short_name}</Text>
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
                {isEditMode ? 'Save Change' : isSignupMode ? 'Save College' : 'Continue to Class'}
              </Text>
              <View style={[s.continueBtnArrow, !selected && s.continueBtnArrowDisabled]}>
                <Ionicons name={isEditMode ? 'checkmark' : 'arrow-forward'} size={16} color={selected ? C.orange : C.textMute} />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
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
  retryBtn:          { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 },
  retryBtnDisabled:  { backgroundColor: C.raised, shadowOpacity: 0 },
  retryBtnText:      { color: '#fff', fontSize: 14, fontWeight: '700' },

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
  connectorActive:{ width: 24, height: 2, backgroundColor: C.emerald, marginHorizontal: 4 },
  stepActive:     { width: 28, height: 28, borderRadius: 14, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 3 },
  stepNumActive:  { fontSize: 12, fontWeight: '800', color: '#fff' },
  connector:      { width: 24, height: 2, backgroundColor: C.border, marginHorizontal: 4 },
  stepInactive:   { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  stepNumInactive:{ fontSize: 12, fontWeight: '700', color: C.textMute },
  stepLabel:      { fontSize: 9.5, color: C.textMute, fontWeight: '700', letterSpacing: 2.5, marginBottom: 16, marginTop: 6 },

  heroTitle: { fontSize: 30, fontWeight: '800', color: C.text, lineHeight: 38, marginBottom: 8, letterSpacing: -0.5, fontFamily: 'serif' },
  heroSub:   { fontSize: 14, color: C.textSub, marginBottom: 18, lineHeight: 21 },

  offlineNotice:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.goldDim, borderWidth: 1, borderColor: 'rgba(223,168,60,0.2)', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, marginBottom: 14 },
  offlineNoticeText: { fontSize: 12, color: C.gold, fontWeight: '600', flex: 1 },

  searchBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 5, paddingVertical: 5, gap: 6 },
  searchIconBox:  { width: 34, height: 34, borderRadius: 11, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  searchInput:    { flex: 1, fontSize: 14, color: C.text, paddingVertical: 7 },
  searchClearBtn: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', marginRight: 2 },
  resultCount:    { fontSize: 11, color: C.textMute, marginTop: 9, fontWeight: '600', letterSpacing: 0.3 },

  listContent: { paddingHorizontal: 16, paddingTop: 14 },

  emptyBox:     { alignItems: 'center', paddingTop: 64, gap: 12 },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: C.text },
  emptySubtitle:{ fontSize: 13, color: C.textSub },

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
  cardDisabled: { opacity: 0.45 },
  cardAccentBar:{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, backgroundColor: C.orange, borderRadius: 2, opacity: 0.9 },
  cardGlow:     { position: 'absolute', top: -20, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: C.orangeGlow, opacity: 0.5 },

  logoWrap:             { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', marginRight: 14, flexShrink: 0 },
  logoWrapSelected:     { shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  logoGrad:             { width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  logoImg:              { width: 52, height: 52 },
  logoInitials:         { fontSize: 14, fontWeight: '800', color: C.textMute, letterSpacing: 0.5 },
  logoInitialsSelected: { color: '#fff' },

  cardInfo:             { flex: 1 },
  cardName:             { fontSize: 14.5, fontWeight: '700', color: C.text, marginBottom: 6, lineHeight: 20, letterSpacing: -0.2 },
  cardNameSelected:     { color: C.text },

  shortPill:             { alignSelf: 'flex-start', backgroundColor: C.raised, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: C.border },
  shortPillSelected:     { backgroundColor: C.orangeDim, borderColor: 'rgba(232,105,42,0.25)' },
  shortPillText:         { fontSize: 10, fontWeight: '700', color: C.textSub, letterSpacing: 0.8, textTransform: 'uppercase' },
  shortPillTextSelected: { color: C.orange },

  checkCircle: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0 },
  checkGrad:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chevronBox:  { width: 32, height: 32, borderRadius: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

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

  selectedBanner:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  selectedBannerLeft:      { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  selectedBannerDot:       { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.orange, flexShrink: 0 },
  selectedBannerText:      { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  selectedBannerBadge:     { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: 'rgba(232,105,42,0.25)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  selectedBannerBadgeText: { fontSize: 11, fontWeight: '800', color: C.orange, letterSpacing: 0.5 },

  continueBtn:              { backgroundColor: C.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  continueBtnDisabled:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, shadowOpacity: 0 },
  continueBtnInner:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  continueBtnText:          { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  continueBtnArrow:         { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  continueBtnArrowDisabled: { backgroundColor: C.raised },
})