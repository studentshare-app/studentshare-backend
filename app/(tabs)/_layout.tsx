/**
 * app/(tabs)/_layout.tsx
 *
 * Tab bar: Home · Search · Forum FAB · Library · Profile
 *
 * Forum FAB (centre):
 *   - Raised pill button above the tab bar
 *   - Routes to /student-forum
 *   - Pulse + glow animation on press
 *
 * Library = downloads screen renamed
 */

import { Ionicons } from '@expo/vector-icons'
import NetInfo from '@react-native-community/netinfo'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Tabs, usePathname, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

const queryClient = new QueryClient()

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const C = {
  void:     '#08090C',
  deep:     '#0C0E14',
  surface:  '#111318',
  raised:   '#161A22',
  border:   '#1E2330',
  text:     '#EEF0F6',
  textSub:  '#8B93A8',
  textMute: '#4A5168',
  gold:     '#F0C060',
  goldDim:  '#2A1E08',
  sapphire: '#5B8DEF',
  sapphDim: '#0D1A35',
  coral:    '#FF7B7B',
  emerald:  '#44D4A0',
  wa:       '#5B8DEF',   // sapphire blue for forum FAB
  waDark:   '#2D5AB8',
  waDim:    '#0D1A35',
} as const

// ─────────────────────────────────────────────
// Offline Banner
// ─────────────────────────────────────────────
function OfflineBanner({ visible }: { visible: boolean }) {
  const translateY = useRef(new Animated.Value(-56)).current

  useEffect(() => {
    Animated.timing(translateY, {
      toValue:         visible ? 0 : -56,
      duration:        380,
      useNativeDriver: true,
    }).start()
  }, [visible])

  return (
    <Animated.View
      style={[s.offlineBanner, { transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={s.offlineIconBox}>
        <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      </View>
      <Text allowFontScaling={false} style={s.offlineText}>Offline — showing cached content</Text>
    </Animated.View>
  )
}

// ─────────────────────────────────────────────
// Forum FAB — raised pill centre button
// ─────────────────────────────────────────────
function ForumFAB() {
  const router   = useRouter()
  const pathname = usePathname()
  const isActive = pathname?.includes('student-forum')

  const scaleAnim = useRef(new Animated.Value(1)).current
  const glowAnim  = useRef(new Animated.Value(0)).current

  // Press bounce + glow
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0  }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 28, bounciness: 12 }),
    ]).start()
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
    router.push('/student-forum' as any)
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={1}
      style={s.fabTouchable}
    >
      {/* Ambient glow — pulses on press */}
      <Animated.View style={[s.fabGlow, { opacity: glowAnim }]} />

      {/* Raised pill button */}
      <Animated.View
        style={[
          s.fabButton,
          isActive && s.fabButtonActive,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={isActive ? 'chatbubbles' : 'chatbubbles-outline'}
          size={26}
          color='#fff'
        />
      </Animated.View>

      {/* Tab label below */}
      <Text allowFontScaling={false} style={[s.fabLabel, isActive && s.fabLabelActive]}>Forum</Text>
    </TouchableOpacity>
  )
}

// ─────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────
export default function TabsLayout() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const unsub = NetInfo.addEventListener(
      state => setIsOffline(!state.isConnected)
    )
    return () => unsub()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: C.void }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: C.deep,
              borderTopColor:  C.border,
              borderTopWidth:  1,
              height:          Platform.OS === 'ios' ? 84 : 68,
              paddingBottom:   Platform.OS === 'ios' ? 24 : 10,
              paddingTop:      8,
              shadowColor:     '#000',
              shadowOffset:    { width: 0, height: -4 },
              shadowOpacity:   0.45,
              shadowRadius:    20,
              elevation:       24,
            },
            tabBarActiveTintColor:   C.gold,
            tabBarInactiveTintColor: C.textMute,
            tabBarLabelStyle: {
              fontSize:      10,
              fontWeight:    '700',
              letterSpacing: 0.3,
              marginTop:     2,
            },
            tabBarAllowFontScaling: false,
            tabBarBackground: () => (
              <View style={{ flex: 1, backgroundColor: C.deep }} />
            ),
          }}
        >

          {/* ── 1. Home ── */}
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color, focused }) => (
                <View style={s.iconWrap}>
                  {focused && <View style={s.activePill} />}
                  <Ionicons
                    name={focused ? 'home' : 'home-outline'}
                    size={23}
                    color={color}
                  />
                </View>
              ),
            }}
          />

          {/* ── 2. Search ── */}
          <Tabs.Screen
            name="search"
            options={{
              title: 'Search',
              tabBarIcon: ({ color, focused }) => (
                <View style={s.iconWrap}>
                  {focused && <View style={s.activePill} />}
                  <Ionicons
                    name={focused ? 'search' : 'search-outline'}
                    size={23}
                    color={color}
                  />
                </View>
              ),
            }}
          />

          {/* ── 3. Forum FAB — centre ── */}
          <Tabs.Screen
            name="chat-placeholder"
            options={{
              title:        'Forum',
              tabBarButton: () => <ForumFAB />,
            }}
          />

          {/* ── 4. Library (downloads screen) ── */}
          <Tabs.Screen
            name="downloads"
            options={{
              title: 'Library',
              tabBarIcon: ({ color, focused }) => (
                <View style={s.iconWrap}>
                  {focused && <View style={s.activePill} />}
                  <Ionicons
                    name={focused ? 'library' : 'library-outline'}
                    size={23}
                    color={color}
                  />
                </View>
              ),
            }}
          />

          {/* ── 5. Profile ── */}
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ color, focused }) => (
                <View style={s.iconWrap}>
                  {focused && <View style={s.activePill} />}
                  <Ionicons
                    name={focused ? 'person' : 'person-outline'}
                    size={23}
                    color={color}
                  />
                </View>
              ),
            }}
          />

          {/* ── Hidden screens ── */}
          {/* ── Hidden screens ── */}
          <Tabs.Screen name="quiz-flashcards" options={{ href: null }} />
          <Tabs.Screen name="notes"           options={{ href: null }} />
          <Tabs.Screen name="study-planner"   options={{ href: null }} />

        </Tabs>

        <OfflineBanner visible={isOffline} />
      </View>
    </QueryClientProvider>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const s = StyleSheet.create({

  // ── Offline banner
  offlineBanner: {
    position:          'absolute',
    top:               0, left: 0, right: 0,
    zIndex:            999,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    backgroundColor:   C.goldDim,
    borderBottomWidth: 1,
    borderBottomColor: C.gold + '30',
    paddingVertical:   9,
    paddingHorizontal: 16,
  },
  offlineIconBox: {
    width:           22,
    height:          22,
    borderRadius:    7,
    backgroundColor: C.gold + '18',
    justifyContent:  'center',
    alignItems:      'center',
  },
  offlineText: {
    color:      C.gold,
    fontSize:   12,
    fontWeight: '600',
  },

  // ── Regular tab icon wrapper
  iconWrap: {
    alignItems:     'center',
    justifyContent: 'center',
    width:          44,
    minWidth:       44,
    height:         34,
    minHeight:      34,
  },

  // Gold pill indicator above active icon
  activePill: {
    position:        'absolute',
    top:             0,
    alignSelf:       'center',
    width:           20,
    height:          3,
    borderRadius:    2,
    backgroundColor: C.gold,
    shadowColor:     C.gold,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.9,
    shadowRadius:    6,
    elevation:       4,
  },

  // ── Forum FAB
  fabTouchable: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingBottom:  4,
    position:       'relative',
  },

  // Ambient glow ring — pulses on press
  fabGlow: {
    position:        'absolute',
    top:             -18,
    width:           80,
    height:          56,
    borderRadius:    28,
    backgroundColor: C.wa + '15',
    shadowColor:     C.wa,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   1,
    shadowRadius:    24,
    elevation:       0,
  },

  // Raised pill — lifted above the bar
  fabButton: {
    width:           56,
    height:          56,
    minWidth:        56,
    minHeight:       56,
    borderRadius:    28,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       -22,
    backgroundColor: C.wa,
    borderWidth:     3,
    borderColor:     C.waDark,
    shadowColor:     C.wa,
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.55,
    shadowRadius:    16,
    elevation:       14,
  },
  fabButtonActive: {
    backgroundColor: C.waDark,
    borderColor:     C.wa + '60',
    shadowColor:     C.wa,
  },

  // Label below pill
  fabLabel: {
    fontSize:      10,
    fontWeight:    '600',
    color:         C.textMute,
    marginTop:     6,
    letterSpacing: 0.3,
  },
  fabLabelActive: {
    color:      C.gold,
    fontWeight: '700',
  },
})