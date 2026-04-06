/**
 * src/features/leaderboard/screens/LeaderboardScreen.tsx
 * Production-ready Leaderboard Screen.
 */

import { Ionicons } from '@expo/vector-icons'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useEffect, useState } from 'react'

import { C } from '@/lib/colors'
import {
  fetchCollegeLeaderboard,
  fetchCollegesLeaderboard,
  fetchGlobalLeaderboard,
  type CollegeEntry,
  type LeaderboardEntry,
  type LeaderPeriod,
} from '@/lib/leaderboard'
import { useProfileSync } from '@/hooks/useProfileSync'

import { CollegeRankRow }  from '@/components/leaderboard/CollegeRankRow'
import { MyPositionCard }  from '@/components/leaderboard/MyPositionCard'
import { PeriodPicker }    from '@/components/leaderboard/PeriodPicker'
import { PodiumSection }   from '@/components/leaderboard/PodiumSection'
import { RankRow }         from '@/components/leaderboard/RankRow'
import { TabBar, type LeaderTab } from '@/components/leaderboard/TabBar'

// Score breakdown legend items
const LEGEND = [
  { color: C.sapphire, label: 'Downloads'   },
  { color: C.emerald,  label: 'Quizzes'     },
]

export default function LeaderboardScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { userId, collegeId, collegeName } = useProfileSync() as any
  const { isOnline, isOffline } = useNetworkStatus()

  const [tab,    setTab]    = useState<LeaderTab>('all_campus')
  const [period, setPeriod] = useState<LeaderPeriod>('weekly')
  const [myCollegeOnly, setMyCollegeOnly] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchText)
    }, 400)
    return () => clearTimeout(handler)
  }, [searchText])

  const resolvedPeriod: LeaderPeriod = tab === 'weekly_gainers' ? 'weekly' : period

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: globalBoard = [], isLoading: loadingGlobal, refetch: refetchGlobal } = useQuery({
    queryKey: ['leaderboard_global', resolvedPeriod, debouncedSearch, tab === 'weekly_gainers'],
    queryFn: () => fetchGlobalLeaderboard(resolvedPeriod, debouncedSearch, tab === 'weekly_gainers'),
    enabled: tab === 'all_campus' || tab === 'weekly_gainers',
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegeBoard = [], isLoading: loadingCollege, refetch: refetchCollege } = useQuery({
    queryKey: ['leaderboard_college', collegeId, resolvedPeriod, debouncedSearch],
    queryFn: () => fetchCollegeLeaderboard(collegeId, resolvedPeriod, debouncedSearch),
    enabled: (tab === 'all_campus' && myCollegeOnly) && !!collegeId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegesBoard = [], isLoading: loadingColleges, refetch: refetchColleges } = useQuery({
    queryKey: ['leaderboard_colleges', resolvedPeriod],
    queryFn: () => fetchCollegesLeaderboard(resolvedPeriod),
    enabled: tab === 'colleges',
    staleTime: 10 * 60 * 1000,
  })

  // ── Derived values ───────────────────────────────────────────────────────
  const activeBoard: LeaderboardEntry[] =
    tab === 'colleges'
      ? []
      : myCollegeOnly && tab === 'all_campus'
        ? collegeBoard
        : globalBoard

  const isLoading =
    tab === 'colleges'
      ? loadingColleges
      : myCollegeOnly && tab === 'all_campus'
        ? loadingCollege
        : loadingGlobal

  const onRefresh = () => {
    if (tab === 'colleges') refetchColleges()
    else if (myCollegeOnly) refetchCollege()
    else refetchGlobal()
  }

  const podiumEntries  = activeBoard.slice(0, 3)
  const restEntries    = activeBoard.slice(3)
  const myEntry        = activeBoard.find(e => e.id === userId)
  const topEntry       = activeBoard[0]
  const nextEntry      = myEntry ? activeBoard.find(e => e.rank === myEntry.rank - 1) : undefined
  const topCollegeAvg  = collegesBoard[0]?.avg_score ?? 1

  const showCollege  = tab === 'all_campus' && !myCollegeOnly
  const showPeriod   = tab !== 'weekly_gainers'

  const scopeLabel =
    tab === 'weekly_gainers' ? 'Weekly Ranking'
    : myCollegeOnly          ? 'College Rank'
    : 'Global Rank'

  const subTitle =
    tab === 'weekly_gainers' ? `This week's top performers`
    : tab === 'colleges'     ? 'Colleges by avg pts / student'
    : myCollegeOnly          ? (collegeName || 'Your college')
    : `All students globally`

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      {/* Background Decor */}
      <View style={st.topGlow} />

      {/* ── Sticky Header ──────────────────────────────────────────────── */}
      <View style={st.header}>
        <TouchableOpacity style={st.iconBtn} onPress={() => {
          if (isSearching) {
            setIsSearching(false)
            setSearchText('')
          } else {
            router.back()
          }
        }} activeOpacity={0.7}>
          <Ionicons name={isSearching ? "close" : "chevron-back"} size={22} color={C.text} />
        </TouchableOpacity>

        <View style={st.titleBox}>
          {isSearching ? (
            <TextInput
              autoFocus
              placeholder="Search students..."
              placeholderTextColor={C.textMute}
              style={st.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
          ) : (
            <>
              <Text maxFontSizeMultiplier={1.2} style={st.headerTitle}>Leaderboard</Text>
              <Text style={st.headerSub}>{subTitle}</Text>
            </>
          )}
        </View>

        <TouchableOpacity 
          style={[st.iconBtn, isSearching && { borderColor: C.orange }]} 
          onPress={() => setIsSearching(!isSearching)}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={20} color={isSearching ? C.orange : C.textSub} />
        </TouchableOpacity>
      </View>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <TabBar
        active={tab}
        onChange={(t: LeaderTab) => {
          setTab(t)
          if (t !== 'all_campus') setMyCollegeOnly(false)
        }}
      />

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      {(isOffline && activeBoard.length > 0) && <OfflineBanner />}
      
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 42 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor={C.orange}
          />
        }
      >
        {/* Period picker */}
        {showPeriod && (
          <View style={st.periodWrapper}>
            <PeriodPicker active={period} onChange={setPeriod} />
          </View>
        )}

        {/* Filters */}
        {tab === 'all_campus' && (
          <View style={st.filterRow}>
            <TouchableOpacity
              style={[st.filterChip, myCollegeOnly && st.filterChipActive]}
              onPress={() => setMyCollegeOnly(!myCollegeOnly)}
              activeOpacity={0.8}
            >
              <Ionicons name="business" size={12} color={myCollegeOnly ? '#FFF' : C.textSub} />
              <Text style={[st.filterChipText, myCollegeOnly && st.filterChipTextActive]}>My College</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Content ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <View style={st.loadingBox}>
            <ActivityIndicator color={C.orange} size="large" />
            <Text style={st.loadingText}>Fetching rankings...</Text>
          </View>

        ) : tab === 'colleges' ? (
          /* COLLEGES BOARD */
          <View style={st.section}>
            {collegesBoard.length > 0 ? (
              <View style={st.listCard}>
                {collegesBoard.map((entry: CollegeEntry, i: number) => (
                  <View key={entry.id}>
                    <CollegeRankRow
                      entry={entry}
                      isMyCollege={entry.id === collegeId}
                      topAvg={topCollegeAvg}
                    />
                    {i < collegesBoard.length - 1 && <View style={st.divider} />}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState icon="school-outline" label="No college data yet" isOffline={isOffline} />
            )}
          </View>

        ) : (
          /* USERS BOARD */
          <View style={st.section}>
            {activeBoard.length > 0 ? (
              <>
                {/* My Position card */}
                {myEntry && (
                  <MyPositionCard
                    rank={myEntry.rank}
                    totalRanked={activeBoard.length}
                    score={myEntry.score}
                    nextRankScore={nextEntry?.score}
                    scopeLabel={scopeLabel}
                  />
                )}

                {/* Podium */}
                {podiumEntries.length >= 2 && (
                  <PodiumSection entries={podiumEntries} showCollege={showCollege} />
                )}

                {/* List */}
                <View style={[st.sectionLabelRow, { marginTop: 12 }]}>
                  <Text style={st.sectionLabel}>GLOBAL STANDINGS</Text>
                  <View style={st.legendRow}>
                    {LEGEND.map(l => (
                      <View key={l.label} style={st.legendItem}>
                        <View style={[st.legendDot, { backgroundColor: l.color }]} />
                        <Text style={st.legendText}>{l.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={st.listCard}>
                  {restEntries.map((entry, i) => (
                    <View key={entry.id}>
                      <RankRow
                        entry={entry}
                        isMe={entry.id === userId}
                        topScore={topEntry?.score ?? 1}
                        showCollege={showCollege}
                      />
                      {i < restEntries.length - 1 && <View style={st.divider} />}
                    </View>
                  ))}

                  {myEntry && myEntry.rank > restEntries.length + 3 && (
                    <>
                      <View style={st.ellipsisRow}>
                        <Text style={st.ellipsisText}>•••</Text>
                      </View>
                      <View style={st.divider} />
                      <RankRow entry={myEntry} isMe topScore={topEntry?.score ?? 1} showCollege={showCollege} />
                    </>
                  )}
                </View>
              </>
            ) : (
              <EmptyState icon="trophy-outline" label="No ranking available" isOffline={isOffline} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function OfflineBanner() {
  return (
    <View style={st.offlineBanner}>
      <Ionicons name="flash-off" size={14} color="#FFF" />
      <Text style={st.offlineText}>You're offline. Showing cached results.</Text>
    </View>
  )
}

function EmptyState({ icon, label, isOffline }: { icon: any; label: string; isOffline: boolean }) {
  return (
    <View style={st.emptyBox}>
      <View style={st.emptyIconBox}>
        <Ionicons name={isOffline ? "cloud-offline" : icon} size={32} color={C.textMute} />
      </View>
      <Text style={st.emptyText}>{isOffline ? 'No cached data' : label}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.void },
  topGlow:      { position: 'absolute', top: 0, left: 0, right: 0, height: 260, backgroundColor: C.orange + '08' },
  
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  iconBtn:      { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  titleBox:     { flex: 1 },
  headerTitle:  { fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  headerSub:    { fontSize: 13, color: C.textMute, fontWeight: '500' },
  searchInput:  { fontSize: 16, fontWeight: '600', color: C.text, padding: 0 },

  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.orange, paddingVertical: 10 },
  offlineText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

  periodWrapper: { paddingHorizontal: 16, marginTop: 12 },
  filterRow:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.orange, borderColor: C.orange },
  filterChipText: { fontSize: 13, fontWeight: '700', color: C.textSub },
  filterChipTextActive: { color: '#FFF' },

  section:      { paddingHorizontal: 0 },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: C.textMute, letterSpacing: 1 },
  
  legendRow:    { flexDirection: 'row', gap: 12 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 6, height: 6, borderRadius: 3 },
  legendText:   { fontSize: 10, color: C.textMute, fontWeight: '600' },

  listCard:     { marginHorizontal: 16, backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  divider:      { height: 1, backgroundColor: C.border, opacity: 0.5 },
  ellipsisRow:  { paddingVertical: 12, alignItems: 'center' },
  ellipsisText: { color: C.textMute, letterSpacing: 3 },

  loadingBox:   { paddingVertical: 100, alignItems: 'center', gap: 12 },
  loadingText:  { color: C.textMute, fontWeight: '600' },
  emptyBox:     { paddingVertical: 80, alignItems: 'center', gap: 16 },
  emptyIconBox: { width: 72, height: 72, borderRadius: 24, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  emptyText:    { fontSize: 15, color: C.textMute, fontWeight: '600' },
})
