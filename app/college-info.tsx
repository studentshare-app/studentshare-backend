/**
 * college-info.tsx — REDESIGNED v2
 * 
 * Follows the mockup HTML structure exactly:
 * 1. Hero ad carousel (collapsible, auto-scroll)
 * 2. Official Notice Ticker (orange bar)
 * 3. Featured Campus Events (magazine layout)
 * 4. Clubs & Societies (horizontal scroll, dark section)
 * 5. Student Spotlight (editorial section)
 * 6. Existing WebView tabs below
 * 
 * Design: Matches index.tsx color tokens + typography
 */

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { useQuery } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { C } from '../lib/colors'
import { supabase } from '../lib/supabase'

const { width: W, height: SCREEN_H } = Dimensions.get('window')
const STATUS_H = StatusBar.currentHeight ?? 44
const HERO_H = Math.round(SCREEN_H * 0.36)
const CACHE_TTL = 24 * 60 * 60 * 1000

// ─── Types ────────────────────────────────────────────────────────────────────

type Slide = {
  id: string; image_url: string
  title: string | null; subtitle: string | null; order: number
}
type CollegeTab = {
  id: string; label: string; icon: string; html_content: string; order: number
}
type CollegeProfile = {
  id: string; name: string; short_name: string | null
  logo_url: string | null; city: string | null
  institution: string | null; is_live: boolean | null
}
type HeroItem =
  | { kind: 'profile'; college: CollegeProfile }
  | { kind: 'image'; slide: Slide }

// ─── Mock Data (replace with API) ──────────────────────────────────────────────

const MOCK_EVENTS = [
  {
    id: 'hackathon',
    title: 'Hackathon 2026',
    date: 'March 15-17',
    location: 'Engineering Block',
    description: 'Join 500+ developers for 48 hours of building the future of decentralized finance.',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=500&fit=crop',
    featured: true,
  },
  {
    id: 'ai-lecture',
    title: 'AI Ethics in Modern Research',
    type: 'Guest Lecture',
    date: 'Tomorrow',
    location: 'Main Auditorium',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=300&h=300&fit=crop',
  },
  {
    id: 'sports',
    title: 'Inter-College Sports Meet',
    date: 'March 22-24',
    location: 'Sports Complex',
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=300&h=300&fit=crop',
  },
]

const MOCK_CLUBS = [
  {
    id: 'jazz',
    name: 'Jazz Society',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop',
  },
  {
    id: 'gaming',
    name: 'Gaming Guild',
    image: 'https://images.unsplash.com/photo-1552820728-8ac41f1ce891?w=300&h=300&fit=crop',
  },
  {
    id: 'code',
    name: 'Code Lab',
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&h=300&fit=crop',
  },
  {
    id: 'robotics',
    name: 'Robotics Club',
    image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=300&h=300&fit=crop',
  },
]

const MOCK_SPOTLIGHT = {
  title: 'The Future of Campus Life',
  quote: 'We are no longer just students; we are creators, builders, and the architects of the next digital frontier within these campus walls.',
  author: 'Sarah Chen, Computer Science',
  image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&h=400&fit=crop',
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data as T
  } catch {
    return null
  }
}
async function writeCache<T>(key: string, data: T) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch { }
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchUserCollegeId(): Promise<string | null> {
  const KEY = 'college_info_user_college_id'
  const cached = await readCache<string>(KEY)
  const net = await NetInfo.fetch()
  if (!net.isConnected) return cached
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('profiles').select('college_id').eq('id', user.id).single()
    if (error) return cached
    const id = data?.college_id ?? null
    if (id) await writeCache(KEY, id)
    return id
  } catch {
    return cached
  }
}

async function fetchOrCacheProfile(cid: string): Promise<CollegeProfile | null> {
  const KEY = `college_info_profile_${cid}`
  const cached = await readCache<CollegeProfile>(KEY)
  const net = await NetInfo.fetch()
  if (!net.isConnected) return cached
  try {
    const { data, error } = await supabase
      .from('colleges')
      .select('id,name,short_name,logo_url,city,institution,is_live')
      .eq('id', cid).single()
    if (error) return cached
    if (data) await writeCache(KEY, data)
    return data
  } catch {
    return cached
  }
}

async function fetchOrCacheSlides(cid: string): Promise<Slide[]> {
  const KEY = `college_info_slides_${cid}`
  const net = await NetInfo.fetch()
  if (net.isConnected) {
    try {
      const { data, error } = await supabase
        .from('college_slides')
        .select('id,image_url,title,subtitle,order')
        .eq('college_id', cid)
        .eq('is_active', true)
        .order('order', { ascending: true })
      if (!error && data) {
        await writeCache(KEY, data)
        return data
      }
    } catch { }
  }
  const cached = await readCache<Slide[]>(KEY)
  return cached ?? []
}

async function fetchOrCacheTabs(cid: string): Promise<CollegeTab[]> {
  const KEY = `college_info_tabs_${cid}`
  const cached = await readCache<CollegeTab[]>(KEY)
  const net = await NetInfo.fetch()
  if (!net.isConnected) return cached ?? []
  try {
    const { data, error } = await supabase
      .from('college_info_tabs')
      .select('id,label,icon,html_content,order,page_id,college_pages(page_html,page_css,page_js)')
      .eq('college_id', cid).eq('is_active', true)
      .order('order', { ascending: true })
    if (error) return cached ?? []
    const result: CollegeTab[] = (data ?? [])
      .map((tab: any) => {
        let html = tab.html_content ?? ''
        if (tab.college_pages) {
          const { page_html = '', page_css = '', page_js = '' } = tab.college_pages
          html = buildPageHtml(page_html, page_css, page_js)
        }
        return { id: tab.id, label: tab.label, icon: tab.icon, html_content: html, order: tab.order }
      })
      .filter(tab => !tab.label.toLowerCase().includes('comahs'))
    await writeCache(KEY, result)
    return result
  } catch {
    return cached ?? []
  }
}

function buildPageHtml(page_html: string, page_css: string, page_js: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
  <style>
    *{box-sizing:border-box;}
    html,body{margin:0;padding:0;width:100%;overflow-x:hidden;overflow-y:hidden;
      background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    ${page_css}
  </style>
</head>
<body>
${page_html}
<script>
${page_js}
;(function(){
  function postH(){
    var h=Math.max(
      document.body.scrollHeight,document.body.offsetHeight,
      document.documentElement.scrollHeight,document.documentElement.offsetHeight
    );
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'height',height:h}));
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');if(!a)return;
    var href=a.getAttribute('href');if(!href||href[0]!=='#')return;
    e.preventDefault();
    var el=document.getElementById(href.slice(1));if(!el)return;
    var top=0,n=el;
    while(n&&n!==document.body){top+=n.offsetTop;n=n.offsetParent;}
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'anchor',offsetTop:top}));
  },true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',postH);
  else postH();
  window.addEventListener('load',postH);
  new ResizeObserver(postH).observe(document.body);
})();
${'<'}/script>
</body>
</html>`
}

// ─── HeroSlideshow ────────────────────────────────────────────────────────────

function HeroSlideshow({
  college, slides, loading, onBack,
}: {
  college: CollegeProfile | null | undefined
  slides: Slide[]
  loading: boolean
  onBack: () => void
}) {
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

// ─── Official Notice Ticker ───────────────────────────────────────────────────

function OfficialNoticeTicker() {
  return (
    <View style={ss.tickerWrap}>
      <View style={ss.tickerBadge}>
        <Text style={ss.tickerBadgeText}>NOTICE</Text>
      </View>
      <Text style={ss.tickerText} numberOfLines={1}>
        Exam registrations for Fall 2026 are now open. Deadline: Oct 20.
      </Text>
    </View>
  )
}

// ─── Featured Event Card ───────────────────────────────────────────────────────

function FeaturedEventCard({ event }: { event: any }) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={ss.featuredWrap}>
      <View style={ss.featuredImageWrap}>
        <Image source={{ uri: event.image }} style={ss.featuredImage} resizeMode="cover" />
        <LinearGradient colors={['transparent', `${C.void}cc`]} style={ss.featuredGradient} />
        <View style={ss.featuredBadgeWrap}>
          <Text style={ss.featuredBadge}>Featured</Text>
        </View>
      </View>

      <View style={ss.featuredContent}>
        <Text style={ss.featuredLabel}>{event.date} • {event.location}</Text>
        <Text style={ss.featuredTitle}>{event.title}</Text>
        <Text style={ss.featuredDesc} numberOfLines={2}>{event.description}</Text>
      </View>

      <TouchableOpacity style={ss.featuredBtn} activeOpacity={0.7}>
        <Ionicons name="add" size={22} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ─── Secondary Event Card ─────────────────────────────────────────────────────

function SecondaryEventCard({ event }: { event: any }) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={ss.secondaryWrap}>
      <Image source={{ uri: event.image }} style={ss.secondaryImage} resizeMode="cover" />
      <View style={ss.secondaryContent}>
        <Text style={ss.secondaryType}>{event.type}</Text>
        <Text style={ss.secondaryTitle}>{event.title}</Text>
        <Text style={ss.secondaryMeta}>{event.date} • {event.location}</Text>
      </View>
      <TouchableOpacity style={ss.secondaryBtn} activeOpacity={0.7}>
        <Text style={ss.secondaryBtnText}>Join</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ─── Club Card ─────────────────────────────────────────────────────────────────

function ClubCard({ club }: { club: any }) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={ss.clubWrap}>
      <View style={ss.clubImageWrap}>
        <Image source={{ uri: club.image }} style={ss.clubImage} resizeMode="cover" />
      </View>
      <Text style={ss.clubName} numberOfLines={2}>{club.name}</Text>
    </TouchableOpacity>
  )
}

// ─── Student Spotlight ─────────────────────────────────────────────────────────

function StudentSpotlight({ spotlight }: { spotlight: any }) {
  return (
    <View style={ss.spotlightWrap}>
      <View style={ss.spotlightHeader}>
        <View style={ss.spotlightLine} />
        <Text style={ss.spotlightLabel}>STUDENT SPOTLIGHT</Text>
      </View>

      <Text style={ss.spotlightTitle}>{spotlight.title}</Text>

      <Text style={ss.spotlightQuote}>"{spotlight.quote}"</Text>

      <Text style={ss.spotlightAuthor}>— {spotlight.author}</Text>

      <Image source={{ uri: spotlight.image }} style={ss.spotlightImage} resizeMode="cover" />
    </View>
  )
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onSelect }: {
  tabs: CollegeTab[]; active: number; onSelect: (i: number) => void
}) {
  const scrollRef = useRef<ScrollView>(null)
  const anims = useRef(tabs.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current

  const pick = useCallback((i: number) => {
    anims.forEach((a, j) =>
      Animated.spring(a, { toValue: j === i ? 1 : 0, useNativeDriver: true, tension: 130, friction: 8 }).start()
    )
    onSelect(i)
    scrollRef.current?.scrollTo({ x: Math.max(0, i - 1) * 130, animated: true })
  }, [])

  return (
    <View style={ss.tabBar}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8, alignItems: 'center' }}>
        {tabs.map((t, i) => {
          const on = active === i
          const scale = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] })
          return (
            <TouchableOpacity key={t.id} onPress={() => pick(i)} activeOpacity={0.75}>
              <Animated.View style={[ss.tabChip, { transform: [{ scale }] },
                on
                  ? { borderColor: `${C.orange}80`, backgroundColor: 'transparent' }
                  : { borderColor: C.border, backgroundColor: C.surface },
              ]}>
                {on && (
                  <LinearGradient colors={[C.raised, C.deep]} style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                )}
                <Ionicons name={(t.icon || 'document-text-outline') as any} size={14}
                  color={on ? C.orange : C.textMute} />
                <Text style={[ss.tabLabel,
                  { color: on ? C.text : C.textMute, fontWeight: on ? '700' : '500' }]}>
                  {t.label}
                </Text>
                {on && <View style={ss.tabUnderline} />}
              </Animated.View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

// ─── WebView skeleton ─────────────────────────────────────────────────────────

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CollegeInfoScreen() {
  const router = useRouter()

  const outerRef = useRef<ScrollView>(null)
  const tabBarH = useRef(0)
  const contentYRef = useRef<Record<string, number>>({})
  const cacheCleared = useRef(false)

  const [activeTab, setActiveTab] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [wvHeights, setWvHeights] = useState<Record<string, number>>({})

  useEffect(() => {
    NetInfo.fetch().then(s => setIsOnline(!!s.isConnected))
    return NetInfo.addEventListener(s => setIsOnline(!!s.isConnected))
  }, [])

  const { data: collegeId, isLoading: loadingId } = useQuery({
    queryKey: ['userCollegeId'],
    queryFn: fetchUserCollegeId,
    staleTime: CACHE_TTL,
    gcTime: CACHE_TTL,
  })

  const { data: college, isLoading: loadingCollege } = useQuery({
    queryKey: ['collegeProfile', collegeId],
    queryFn: () => fetchOrCacheProfile(collegeId!),
    enabled: !!collegeId,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })

  const { data: slides = [] } = useQuery({
    queryKey: ['collegeSlides', collegeId],
    queryFn: () => fetchOrCacheSlides(collegeId!),
    enabled: !!collegeId,
    staleTime: 0,
    gcTime: 60 * 60 * 1000,
  })

  const { data: tabs = [], isLoading: loadingTabs } = useQuery({
    queryKey: ['collegeTabs', collegeId],
    queryFn: () => fetchOrCacheTabs(collegeId!),
    enabled: !!collegeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })

  useEffect(() => {
    if (!collegeId || cacheCleared.current) return
    cacheCleared.current = true
    AsyncStorage.removeItem(`college_info_slides_${collegeId}`)
  }, [collegeId])

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

  if (loadingId || (loadingCollege && !college) || (loadingTabs && !tabs.length)) {
    return (
      <View style={ss.fullCenter}>
        <StatusBar barStyle="light-content"
          backgroundColor={Platform.OS === 'android' ? C.void : undefined} translucent />
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

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>
      <StatusBar barStyle="light-content"
        backgroundColor={Platform.OS === 'android' ? 'transparent' : undefined} translucent />

      {/* HERO — absolutely fixed */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <HeroSlideshow
          college={college}
          slides={slides}
          loading={loadingCollege && !college}
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

        {/* Official Notice Ticker */}
        <OfficialNoticeTicker />

        {/* Campus Events Section */}
        <View style={ss.eventsSection}>
          <View style={ss.sectionHeader}>
            <Text style={ss.sectionTitle}>Campus{'\n'}Events</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={ss.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>

          {/* Featured Event */}
          {MOCK_EVENTS[0] && <FeaturedEventCard event={MOCK_EVENTS[0]} />}

          {/* Secondary Events */}
          <View style={ss.secondaryEvents}>
            {MOCK_EVENTS.slice(1).map(event => (
              <SecondaryEventCard key={event.id} event={event} />
            ))}
          </View>
        </View>

        {/* Clubs & Societies Section */}
        <View style={ss.clubsSection}>
          <View style={ss.clubsHeader}>
            <Text style={ss.clubsTitle}>Clubs & Societies</Text>
            <Ionicons name="people" size={18} color={C.orange} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
            {MOCK_CLUBS.map(club => (
              <ClubCard key={club.id} club={club} />
            ))}
          </ScrollView>
        </View>

        {/* Student Spotlight Section */}
        <View style={ss.spotlightSection}>
          <StudentSpotlight spotlight={MOCK_SPOTLIGHT} />
        </View>

        {/* Tabs & WebView Content */}
        {tabs.length > 0 ? (
          <>
            <View onLayout={e => { tabBarH.current = e.nativeEvent.layout.height }}>
              <TabBar tabs={tabs} active={activeTab} onSelect={setActiveTab} />
            </View>

            {tabs.map((tab, ti) => {
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
        ) : !loadingTabs ? (
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  // Hero
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

  // Ticker
  tickerWrap: { backgroundColor: C.orange, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tickerBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  tickerBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  tickerText: { flex: 1, fontSize: 12, fontWeight: '500', color: '#fff' },

  // Events Section
  eventsSection: { paddingHorizontal: 16, marginTop: 24, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  sectionTitle: { fontSize: 32, fontWeight: '900', color: C.text, lineHeight: 36, letterSpacing: -0.5 },
  viewAllLink: { fontSize: 12, fontWeight: '700', color: C.orange, letterSpacing: 0.3 },

  // Featured Event
  featuredWrap: { marginBottom: 20 },
  featuredImageWrap: { position: 'relative', height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  featuredImage: { width: '100%', height: '100%' },
  featuredGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  featuredBadgeWrap: { position: 'absolute', bottom: 12, left: 16 },
  featuredBadge: { fontSize: 10, fontWeight: '800', color: C.orange, backgroundColor: C.orangeDim, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, letterSpacing: 0.8 },
  featuredContent: { marginBottom: 12 },
  featuredLabel: { fontSize: 11, fontWeight: '700', color: C.orange, letterSpacing: 0.5, marginBottom: 6 },
  featuredTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6, lineHeight: 22 },
  featuredDesc: { fontSize: 13, color: C.textSub, lineHeight: 18 },
  featuredBtn: { position: 'absolute', top: 130, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: C.orange, justifyContent: 'center', alignItems: 'center', shadowColor: C.orange, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },

  // Secondary Events
  secondaryEvents: { gap: 12 },
  secondaryWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden' },
  secondaryImage: { width: 90, height: 90 },
  secondaryContent: { flex: 1, paddingVertical: 12 },
  secondaryType: { fontSize: 10, fontWeight: '700', color: C.orange, letterSpacing: 0.5, marginBottom: 2 },
  secondaryTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 3, lineHeight: 18 },
  secondaryMeta: { fontSize: 11, color: C.textMute },
  secondaryBtn: { borderWidth: 2, borderColor: C.orange, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 12 },
  secondaryBtnText: { fontSize: 11, fontWeight: '700', color: C.orange, letterSpacing: 0.4 },

  // Clubs Section
  clubsSection: { backgroundColor: C.deep, paddingVertical: 24, marginTop: 0 },
  clubsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 },
  clubsTitle: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.1 },
  clubWrap: { minWidth: 130, alignItems: 'center' },
  clubImageWrap: { width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: `${C.orange}4d`, padding: 2, marginBottom: 10, overflow: 'hidden' },
  clubImage: { width: '100%', height: '100%', borderRadius: 58 },
  clubName: { fontSize: 12, fontWeight: '700', color: C.text, textAlign: 'center', lineHeight: 16 },

  // Spotlight Section
  spotlightSection: { paddingHorizontal: 16, marginTop: 24, marginBottom: 30 },
  spotlightWrap: { backgroundColor: C.surface, borderTopWidth: 3, borderTopColor: C.orange, borderRadius: 12, padding: 18 },
  spotlightHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  spotlightLine: { height: 2, width: 16, backgroundColor: C.text },
  spotlightLabel: { fontSize: 9, fontWeight: '700', color: C.orange, letterSpacing: 2 },
  spotlightTitle: { fontSize: 26, fontWeight: '900', color: C.text, lineHeight: 30, marginBottom: 12, fontStyle: 'italic', letterSpacing: -0.3 },
  spotlightQuote: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 20, fontStyle: 'italic', marginBottom: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: `${C.orange}4d` },
  spotlightAuthor: { fontSize: 12, color: C.textMute, marginBottom: 14 },
  spotlightImage: { width: '100%', height: 160, borderRadius: 10 },

  // Tabs
  tabBar: { backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 12 },
  tabChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  tabLabel: { fontSize: 13 },
  tabUnderline: { position: 'absolute', bottom: 4, left: '50%', marginLeft: -4, width: 8, height: 3, borderRadius: 2, backgroundColor: C.orange },

  // Empty states
  emptyTab: { alignItems: 'center', paddingVertical: 72, gap: 12, paddingHorizontal: 20 },
  emptyTabIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: `${C.orange}24`, justifyContent: 'center', alignItems: 'center' },
  emptyTabTxt: { fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
  emptyTabSub: { fontSize: 13, color: 'rgba(255,255,255,0.22)', textAlign: 'center', lineHeight: 20 },

  // Offline & Loading
  offlineBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(223,168,60,0.12)', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${C.gold}4d` },
  offlineTxt: { fontSize: 12, color: C.gold, fontWeight: '600' },
  fullCenter: { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center' },
  loadIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.orangeDim, borderWidth: 1.5, borderColor: `${C.orange}4d`, justifyContent: 'center', alignItems: 'center' },
  loadTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '500', marginTop: 12 },
})