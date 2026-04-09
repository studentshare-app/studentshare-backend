/**
 * college-info.tsx — REDESIGNED v2 (Modular)
 * 
 * Scalable implementation of the College Hub.
 * Uses extracted components and centralized React Query logic.
 */

import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Dimensions, Platform, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { C } from '@/lib/colors'

// Custom Hooks & Components
import { useCollegeInfo, type CollegeTab } from '../hooks/useCollegeInfo'
import { CollegeHeroSlideshow, HERO_H } from '../components/CollegeHeroSlideshow'
import { NoticeTicker } from '../components/NoticeTicker'
import { EventsSection } from '../components/EventsSection'
import { ClubsSection } from '../components/ClubsSection'
import { SpotlightSection } from '../components/SpotlightSection'
import { CollegeTabBar } from '../components/CollegeTabBar'
import NetInfo from '@react-native-community/netinfo'

const { width: W, height: SCREEN_H } = Dimensions.get('window')

function WVSkeleton() {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 850, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])
  const op = a.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.55] })
  return (
    <Animated.View style={{ flex: 1, padding: 22, gap: 16, opacity: op }}>
      {[92, 58, 78, 40, 68, 85, 50, 72].map((w, i) => (
        <View key={i} style={{ height: 13, width: `${w}%`, borderRadius: 7, backgroundColor: C.orangeDim }} />
      ))}
    </Animated.View>
  )
}

export default function CollegeInfoScreen() {
  const router = useRouter()

  const outerRef = useRef<ScrollView>(null)
  const tabBarH = useRef(0)
  const contentYRef = useRef<Record<string, number>>({})

  const [activeTab, setActiveTab] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [wvHeights, setWvHeights] = useState<Record<string, number>>({})

  useEffect(() => {
    NetInfo.fetch().then(s => setIsOnline(!!s.isConnected))
    return NetInfo.addEventListener(s => setIsOnline(!!s.isConnected))
  }, [])

  // Master Hook
  const {
    collegeId, loadingId,
    profile, slides, notices, events, clubs, spotlights, tabs
  } = useCollegeInfo()

  const onMsg = useCallback((tabId: string, raw: string) => {
    try {
      const p = JSON.parse(raw)
      if (p.type === 'height' && p.height > 50) {
        setWvHeights(prev => prev[tabId] === p.height ? prev : { ...prev, [tabId]: p.height })
      } else if (p.type === 'anchor') {
        outerRef.current?.scrollTo({
          y: HERO_H + tabBarH.current + (contentYRef.current[tabId] ?? 0) + (p.offsetTop ?? 0),
          animated: true,
        })
      }
    } catch { }
  }, [])

  const initialLoading = loadingId || (profile.isLoading && !profile.data) || (tabs.isLoading && !(tabs.data as CollegeTab[] | undefined)?.length)

  if (initialLoading) {
    return (
      <View style={ss.fullCenter}>
        <StatusBar barStyle="light-content" backgroundColor={Platform.OS === 'android' ? C.void : undefined} translucent />
        <LinearGradient colors={[C.void, C.deep]} style={StyleSheet.absoluteFill} />
        <View style={ss.loadIcon}>
          <Ionicons name="school" size={36} color={C.orange} />
        </View>
        <ActivityIndicator size="large" color={C.orange} style={{ marginTop: 22 }} />
        <Text style={ss.loadTxt}>Loading college info…</Text>
      </View>
    )
  }

  if (!collegeId) {
    return (
      <View style={ss.fullCenter}>
        <LinearGradient colors={[C.void, C.deep]} style={StyleSheet.absoluteFill} />
        <Ionicons name="school-outline" size={56} color={`${C.orange}4d`} />
        <Text style={[ss.loadTxt, { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 16 }]}>
          No College Linked
        </Text>
        <Text style={[ss.loadTxt, { marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }]}>
          Your profile isn't linked to a college yet.
        </Text>
      </View>
    )
  }

  const tabList = tabs.data || []

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>
      <StatusBar barStyle="light-content" backgroundColor={Platform.OS === 'android' ? 'transparent' : undefined} translucent />

      {/* HERO — absolutely fixed */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <CollegeHeroSlideshow
          college={profile.data}
          slides={slides.data || []}
          loading={profile.isLoading && !profile.data}
          onBack={() => router.back()}
        />
      </View>

      {/* SCROLLABLE BODY */}
      <ScrollView
        ref={outerRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: HERO_H, paddingBottom: 60 }}
        nestedScrollEnabled={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isOnline && (
          <View style={ss.offlineBar}>
            <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
            <Text style={ss.offlineTxt}>Offline — showing cached content</Text>
          </View>
        )}

        <NoticeTicker notices={notices.data || []} />
        <EventsSection events={events.data || []} />
        <ClubsSection clubs={clubs.data || []} />
        <SpotlightSection spotlights={spotlights.data || []} />

        {/* Tabs & WebView Content */}
        {tabList.length > 0 ? (
          <>
            <View onLayout={e => { tabBarH.current = e.nativeEvent.layout.height }}>
              <CollegeTabBar tabs={tabList} active={activeTab} onSelect={setActiveTab} />
            </View>

            {tabList.map((tab, ti) => {
              const visible = activeTab === ti
              const h = wvHeights[tab.id]
              return (
                <View key={tab.id} style={{ display: visible ? 'flex' : 'none', width: W }}>
                  {tab.html_content ? (
                    <View
                      onLayout={e => { contentYRef.current[tab.id] = e.nativeEvent.layout.y }}
                      style={{ width: W, height: h ?? SCREEN_H * 0.75, backgroundColor: '#fff' }}
                    >
                      {!h && (
                        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.deep, zIndex: 5 }]}>
                          <WVSkeleton />
                        </View>
                      )}
                      <WebView
                        source={{ html: tab.html_content }}
                        style={{ flex: 1, width: W }}
                        scrollEnabled={false}
                        nestedScrollEnabled={false}
                        showsVerticalScrollIndicator={false}
                        originWhitelist={['*']}
                        javaScriptEnabled
                        onMessage={e => onMsg(tab.id, e.nativeEvent.data)}
                        onShouldStartLoadWithRequest={r =>
                          r.url === 'about:blank' ||
                          r.navigationType === 'other' ||
                          r.navigationType === 'click'
                        }
                      />
                    </View>
                  ) : (
                    <View style={ss.emptyTab}>
                      <View style={ss.emptyTabIcon}>
                        <Ionicons name="document-outline" size={32} color={`${C.orange}73`} />
                      </View>
                      <Text style={ss.emptyTabTxt}>No content yet</Text>
                      <Text style={ss.emptyTabSub}>This tab hasn't been set up yet.</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </>
        ) : !tabs.isLoading ? (
          <View style={ss.emptyTab}>
            <View style={ss.emptyTabIcon}>
              <Ionicons name="school-outline" size={36} color={`${C.orange}73`} />
            </View>
            <Text style={ss.emptyTabTxt}>Nothing published yet</Text>
            <Text style={ss.emptyTabSub}>Content will appear here once your admin publishes it.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const ss = StyleSheet.create({
  fullCenter: { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center' },
  loadIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.orangeDim, borderWidth: 1.5, borderColor: `${C.orange}4d`, justifyContent: 'center', alignItems: 'center' },
  loadTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '500', marginTop: 12 },

  offlineBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(223,168,60,0.12)', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${C.gold}4d` },
  offlineTxt: { fontSize: 12, color: C.gold, fontWeight: '600' },

  emptyTab: { alignItems: 'center', paddingVertical: 72, gap: 12, paddingHorizontal: 20 },
  emptyTabIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: `${C.orange}24`, justifyContent: 'center', alignItems: 'center' },
  emptyTabTxt: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
  emptyTabSub: { fontSize: 13, color: 'rgba(255,255,255,0.22)', textAlign: 'center', lineHeight: 20 },
})
