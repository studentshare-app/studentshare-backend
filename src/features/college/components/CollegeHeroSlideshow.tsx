import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, FlatList, Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeProfile, Slide } from '../hooks/useCollegeInfo'

const { width: W, height: SCREEN_H } = Dimensions.get('window')
const STATUS_H = StatusBar.currentHeight ?? 44
export const HERO_H = Math.round(SCREEN_H * 0.36)

type HeroItem =
  | { kind: 'profile'; college: CollegeProfile }
  | { kind: 'image'; slide: Slide }

type Props = {
  college: CollegeProfile | null | undefined
  slides: Slide[]
  loading: boolean
  onBack: () => void
}

function NavBack({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ borderRadius: 12, overflow: 'hidden' }}>
      <BlurView intensity={28} tint="dark" style={ss.backBtn}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </BlurView>
    </TouchableOpacity>
  )
}

function LiveBadge() {
  return (
    <View style={ss.liveBadge}>
      <View style={ss.liveDot} />
      <Text style={ss.liveTxt}>LIVE</Text>
    </View>
  )
}

export function CollegeHeroSlideshow({ college, slides, loading, onBack }: Props) {
  const flatRef = useRef<FlatList>(null)
  const [idx, setIdx] = useState(0)
  const scaleAnim = useRef(new Animated.Value(1)).current
  const shimAnim = useRef(new Animated.Value(0)).current

  const items: HeroItem[] = college
    ? [{ kind: 'profile', college }, ...slides.map(s => ({ kind: 'image' as const, slide: s }))]
    : slides.map(s => ({ kind: 'image' as const, slide: s }))

  useEffect(() => {
    setIdx(0)
    flatRef.current?.scrollToIndex({ index: 0, animated: false })
  }, [items.length])

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => {
      setIdx(prev => {
        const next = (prev + 1) % items.length
        flatRef.current?.scrollToIndex({ index: next, animated: true })
        return next
      })
    }, 5500)
    return () => clearInterval(t)
  }, [items.length])

  useEffect(() => {
    scaleAnim.setValue(1)
    Animated.timing(scaleAnim, { toValue: 1.06, duration: 5500, useNativeDriver: true }).start()
  }, [idx])

  useEffect(() => {
    if (!loading) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(shimAnim, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [loading])

  const shimOp = shimAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] })

  function ProfileSlide({ c }: { c: CollegeProfile }) {
    const loc = [c.institution, c.city].filter(Boolean).join(' · ')
    return (
      <View style={[ss.slide, { backgroundColor: C.deep }]}>
        <LinearGradient colors={['#0D1F3C', C.deep]} style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
        <View style={ss.blob1} />
        <View style={ss.blob2} />
        <View style={ss.topAccent} />
        <View style={[ss.topRow, { top: STATUS_H + 12 }]}>
          <NavBack onPress={onBack} />
          {c.is_live && <LiveBadge />}
        </View>
        <View style={ss.profileCenter}>
          <View style={ss.logoRing}>
            {c.logo_url
              ? <Image source={{ uri: c.logo_url }} style={ss.logoImg} resizeMode="contain" />
              : <Ionicons name="school" size={44} color={C.orange} />}
          </View>
          <View style={ss.profileText}>
            {c.short_name && (
              <View style={ss.shortBadge}>
                <Text style={ss.shortBadgeTxt}>{c.short_name}</Text>
              </View>
            )}
            <Text style={ss.profileName} numberOfLines={3}>{c.name}</Text>
            {!!loc && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
                <Ionicons name="location-outline" size={12} color={C.textSub} />
                <Text style={ss.profileLoc} numberOfLines={1}>{loc}</Text>
              </View>
            )}
          </View>
        </View>
        <LinearGradient colors={['transparent', `${C.void}d9`]} style={ss.bottomFade} />
      </View>
    )
  }

  function ImageSlide({ s }: { s: Slide }) {
    return (
      <View style={ss.slide}>
        <Animated.Image source={{ uri: s.image_url }}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: scaleAnim }] }]}
          resizeMode="cover" />
        <LinearGradient
          colors={['rgba(5,10,24,0.55)', 'transparent', 'transparent', 'rgba(5,10,24,0.92)']}
          locations={[0, 0.2, 0.55, 1]}
          style={StyleSheet.absoluteFill} />
        <View style={[ss.topRow, { top: STATUS_H + 12 }]}>
          <NavBack onPress={onBack} />
        </View>
        {(s.title || s.subtitle) && (
          <View style={ss.caption}>
            {s.title && <Text style={ss.captionTitle}>{s.title}</Text>}
            {s.subtitle && <Text style={ss.captionSub}>{s.subtitle}</Text>}
          </View>
        )}
      </View>
    )
  }

  if (loading && items.length === 0) {
    return (
      <View style={[ss.slide, { backgroundColor: C.deep, justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#0D1F3C', C.deep]} style={StyleSheet.absoluteFill} />
        <View style={[ss.topRow, { top: STATUS_H + 12 }]}>
          <NavBack onPress={onBack} />
        </View>
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Animated.View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: C.orangeDim, opacity: shimOp }} />
          <Animated.View style={{ height: 14, width: 100, borderRadius: 7, backgroundColor: C.orangeDim, opacity: shimOp }} />
          <Animated.View style={{ height: 22, width: 220, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.1)', opacity: shimOp }} />
        </View>
      </View>
    )
  }

  if (items.length === 0) return null

  return (
    <View style={{ height: HERO_H }}>
      <FlatList
        ref={flatRef}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.kind === 'profile' ? '__profile__' : item.slide.id}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) =>
          item.kind === 'profile'
            ? <ProfileSlide c={item.college} />
            : <ImageSlide s={item.slide} />
        }
      />
      {items.length > 1 && (
        <View style={ss.dotsRow} pointerEvents="none">
          {items.map((_, i) => (
            <View key={i} style={[ss.dot, i === idx ? ss.dotOn : ss.dotOff]} />
          ))}
        </View>
      )}
      {items.length > 1 && (
        <View style={ss.counter} pointerEvents="none">
          <Text style={ss.counterTxt}>{idx + 1} / {items.length}</Text>
        </View>
      )}
    </View>
  )
}

const ss = StyleSheet.create({
  slide: { width: W, height: HERO_H, overflow: 'hidden' },
  blob1: { position: 'absolute', top: -70, right: -50, width: 260, height: 260, borderRadius: 130, backgroundColor: `${C.orange}12` },
  blob2: { position: 'absolute', bottom: -50, left: -30, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(56,189,248,0.05)' },
  topAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: C.orange, opacity: 0.75 },
  topRow: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 },
  backBtn: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16,185,129,0.13)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.28)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveTxt: { fontSize: 10, fontWeight: '800', color: '#10B981', letterSpacing: 1 },
  profileCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingTop: STATUS_H + 50, gap: 18 },
  logoRing: { width: 96, height: 96, borderRadius: 26, backgroundColor: `${C.orange}1f`, borderWidth: 2, borderColor: `${C.orange}59`, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 18, elevation: 10, overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  profileText: { alignItems: 'center', gap: 6 },
  shortBadge: { backgroundColor: `${C.orange}24`, borderWidth: 1, borderColor: `${C.orange}59`, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 3 },
  shortBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.orange, letterSpacing: 1.2 },
  profileName: { fontSize: 22, fontWeight: '900', color: C.text, letterSpacing: -0.4, lineHeight: 28, textAlign: 'center' },
  profileLoc: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
  caption: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 30, gap: 4 },
  captionTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  captionSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  dotsRow: { position: 'absolute', bottom: 16, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { height: 4, borderRadius: 2 },
  dotOn: { width: 22, backgroundColor: C.orange },
  dotOff: { width: 5, backgroundColor: 'rgba(255,255,255,0.28)' },
  counter: { position: 'absolute', top: STATUS_H + 12, right: 16, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  counterTxt: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
})
