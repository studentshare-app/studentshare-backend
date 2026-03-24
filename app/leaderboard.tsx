/**
 * app/leaderboard.tsx
 * Full Leaderboard Screen
 *
 * Tabs:
 *   All Campus     → global scope, period-selectable, "My College" filter chip
 *   Weekly Gainers → global scope locked to weekly period
 *   Colleges       → colleges scope, period-selectable
 *
 * Components are shared with the home screen LeaderboardModal.
 */

import { Ionicons } from '@expo/vector-icons'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { C } from '../lib/colors'
import {
  fetchCollegeLeaderboard,
  fetchCollegesLeaderboard,
  fetchGlobalLeaderboard,
  type CollegeEntry,
  type LeaderboardEntry,
  type LeaderPeriod,
} from '../lib/leaderboard'
import { useProfileSync } from '../hooks/useProfileSync'

import { CollegeRankRow }  from '../components/leaderboard/CollegeRankRow'
import { MyPositionCard }  from '../components/leaderboard/MyPositionCard'
import { PeriodPicker }    from '../components/leaderboard/PeriodPicker'
import { PodiumSection }   from '../components/leaderboard/PodiumSection'
import { RankRow }         from '../components/leaderboard/RankRow'
import { TabBar, type LeaderTab } from '../components/leaderboard/TabBar'
import { useState } from 'react'

// Score breakdown legend items
const LEGEND = [
  { color: C.sapphire, label: 'Downloads'   },
  { color: C.emerald,  label: 'Quizzes'     },
  { color: C.lavender, label: 'AI Sessions' },
  { color: C.gold,     label: 'Streak'      },
]

export default function LeaderboardScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { userId, collegeId, collegeName } = useProfileSync() as any
  const { isOnline, isOffline } = useNetworkStatus()

  const [tab,    setTab]    = useState<LeaderTab>('all_campus')
  const [period, setPeriod] = useState<LeaderPeriod>('weekly')
  // "My College" filter chip inside All Campus tab
  const [myCollegeOnly, setMyCollegeOnly] = useState(false)

  // Resolved period: Weekly Gainers tab is always weekly
  const resolvedPeriod: LeaderPeriod = tab === 'weekly_gainers' ? 'weekly' : period

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: globalBoard = [], isLoading: loadingGlobal } = useQuery({
    queryKey: ['leaderboard_global', resolvedPeriod],
    queryFn: () => fetchGlobalLeaderboard(resolvedPeriod),
    enabled: tab === 'all_campus' || tab === 'weekly_gainers',
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegeBoard = [], isLoading: loadingCollege } = useQuery({
    queryKey: ['leaderboard_college', collegeId, resolvedPeriod],
    queryFn: () => fetchCollegeLeaderboard(collegeId, resolvedPeriod),
    enabled: (tab === 'all_campus' && myCollegeOnly) && !!collegeId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegesBoard = [], isLoading: loadingColleges } = useQuery({
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

  const podiumEntries  = activeBoard.slice(0, 3)
  const restEntries    = activeBoard.slice(3)
  const myEntry        = activeBoard.find(e => e.id === userId)
  const topEntry       = activeBoard[0]
  const nextEntry      = myEntry ? activeBoard[myEntry.rank - 2] : undefined
  const topCollegeAvg  = collegesBoard[0]?.avg_score ?? 1

  const showCollege  = tab === 'all_campus' && !myCollegeOnly
  const showPeriod   = tab !== 'weekly_gainers'

  const scopeLabel =
    tab === 'weekly_gainers' ? 'Weekly Campus Rank'
    : myCollegeOnly          ? 'College Rank'
    : 'Global Rank'

  // ── Sub-heading text ─────────────────────────────────────────────────────
  const subTitle =
    tab === 'weekly_gainers' ? `This week's top movers · ${globalBoard.length.toLocaleString()} students`
    : tab === 'colleges'     ? 'Colleges ranked by avg pts / student'
    : myCollegeOnly          ? (collegeName || 'Your college')
    : `All students · ${globalBoard.length.toLocaleString()} users`

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>

      {/* ── Sticky Header ──────────────────────────────────────────────── */}
      <View style={st.header}>
        {/* Back */}
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>

        <Text maxFontSizeMultiplier={1.2} style={st.headerTitle}>Campus Leaderboard</Text>

        {/* Search placeholder */}
        <TouchableOpacity style={st.backBtn} activeOpacity={0.8}>
          <Ionicons name="search-outline" size={20} color={C.textSub} />
        </TouchableOpacity>
      </View>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <TabBar
        active={tab}
        onChange={(t: LeaderTab) => {
          setTab(t)
          // Reset college filter when leaving All Campus
          if (t !== 'all_campus') setMyCollegeOnly(false)
        }}
      />

      {/* ── Scrollable body ────────────────────────────────────────────── */}
    {isOffline && activeBoard.length > 0 && <OfflineBanner />}
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      refreshControl={
        isOnline ? (
          <RefreshControl
            refreshing={false}
            onRefresh={() => {}}
            tintColor="#F59E0B"
          />
        ) : undefined
      }
    >
        {/* Period picker — hidden on Weekly Gainers */}
        {showPeriod && (
          <PeriodPicker active={period} onChange={setPeriod} />
        )}

        {/* "My College" filter chip — only on All Campus */}
        {tab === 'all_campus' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.filterRow}
          >
            <TouchableOpacity
              style={[st.filterChip, myCollegeOnly && st.filterChipActive]}
              onPress={() => setMyCollegeOnly(p => !p)}
              activeOpacity={0.8}
            >
              <Text style={[st.filterChipText, myCollegeOnly && st.filterChipTextActive]}>
                🏛 My College
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Sub-heading */}
        <View style={st.subHeadRow}>
          <Text maxFontSizeMultiplier={1.2} style={st.subHead}>
            {tab === 'colleges' ? 'Colleges' : 'The Champions'}
          </Text>
          <Text maxFontSizeMultiplier={1.2} style={st.subHeadSub}>{subTitle}</Text>
        </View>

        {/* Score breakdown legend */}
        {tab !== 'colleges' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.legendRow}
          >
            {LEGEND.map(item => (
              <View key={item.label} style={st.legendChip}>
                <View style={[st.legendDot, { backgroundColor: item.color }]} />
                <Text allowFontScaling={false} style={st.legendText}>{item.label}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <View style={st.loadingBox}>
            <ActivityIndicator color={C.orange} size="large" />
          </View>

        ) : tab === 'colleges' ? (
          /* ── COLLEGES BOARD ──────────────────────────────────────────── */
          <>
            {collegesBoard.length === 0 ? (
              <EmptyState icon="school-outline" label="No college data yet" />
            ) : (
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
            )}
          </>

        ) : (
          /* ── USERS BOARD ─────────────────────────────────────────────── */
          <>
            {activeBoard.length === 0 ? (
              <EmptyState icon="trophy-outline" label="No data yet" />
            ) : (
              <>
                {/* My Position card — shown above podium if user ranked */}
                {myEntry && (
                  <MyPositionCard
                    rank={myEntry.rank}
                    totalRanked={activeBoard.length}
                    score={myEntry.score}
                    nextRankScore={nextEntry?.score}
                    scopeLabel={scopeLabel}
                    userName={myEntry.full_name}
                    showShare
                  />
                )}

                {/* Podium */}
                {podiumEntries.length >= 2 && (
                  <PodiumSection entries={podiumEntries} showCollege={showCollege} />
                )}

                {/* Divider + "Global Standings" label */}
                <View style={st.sectionLabelRow}>
                  <Text maxFontSizeMultiplier={1.2} style={st.sectionLabel}>
                    {tab === 'weekly_gainers' ? 'Weekly Rankings' : 'Global Standings'}
                  </Text>
                </View>

                {/* Rank rows (4+) */}
                <View style={st.listCard}>
                  {restEntries.map((entry, i) => {
                    const isMe = entry.id === userId
                    return (
                      <View key={entry.id}>
                        <RankRow
                          entry={entry}
                          isMe={isMe}
                          topScore={topEntry?.score ?? 1}
                          showCollege={showCollege}
                        />
                        {i < restEntries.length - 1 && <View style={st.divider} />}
                      </View>
                    )
                  })}

                  {/* If user is far down the board, show ellipsis + their row */}
                  {myEntry && myEntry.rank > restEntries.length + 3 && (
                    <>
                      <View style={st.ellipsisRow}>
                        <Text allowFontScaling={false} style={st.ellipsisText}>• • •</Text>
                      </View>
                      <View style={st.divider} />
                      <RankRow
                        entry={myEntry}
                        isMe
                        topScore={topEntry?.score ?? 1}
                        showCollege={showCollege}
                      />
                    </>
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={st.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
      <Text style={st.offlineText}>Showing cached leaderboard — you're offline</Text>
    </View>
  )
}

function EmptyState({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={st.emptyBox}>
      <View style={st.emptyIconBox}>
        <Ionicons name={isOffline ? "cloud-offline-outline" : icon} size={32} color={C.textMute} />
      </View>
      <Text maxFontSizeMultiplier={1.2} style={st.emptyText}>{isOffline ? 'No cached data' : label}</Text>
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
  const st = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: C.void },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#FEF3C7', paddingVertical: 8, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  offlineText: { fontSize: 12, fontWeight: '600', color: '#92400E' },

  // Header
  header:       {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.void,
  },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  backBtn:      { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },

  // Filter chip row
  filterRow:    { paddingHorizontal: 16, paddingBottom: 4, paddingTop: 2, gap: 8, flexDirection: 'row' },
  filterChip:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: C.border },
  filterChipActive:    { backgroundColor: C.orangeDim, borderColor: C.orange + '50' },
  filterChipText:      { fontSize: 12, fontWeight: '600', color: C.textSub },
  filterChipTextActive:{ color: C.orange },

  // Sub-heading
  subHeadRow:   { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  subHead:      { fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: C.textMute, textTransform: 'uppercase', marginBottom: 3 },
  subHeadSub:   { fontSize: 12, color: C.textMute },

  // Legend
  legendRow:    { paddingHorizontal: 16, paddingBottom: 14, gap: 7, flexDirection: 'row' },
  legendChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  legendDot:    { width: 7, height: 7, borderRadius: 3.5 },
  legendText:   { fontSize: 10.5, color: C.textSub },

  // Section label
  sectionLabelRow:{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: C.textMute, textTransform: 'uppercase' },

  // List card
  listCard:     { marginHorizontal: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  divider:      { height: 1, backgroundColor: C.border, marginHorizontal: 16, opacity: 0.6 },

  // Ellipsis
  ellipsisRow:  { paddingVertical: 10, alignItems: 'center' },
  ellipsisText: { fontSize: 12, color: C.textMute, letterSpacing: 4 },

  // Loading
  loadingBox:   { paddingVertical: 80, alignItems: 'center' },

  // Empty
  emptyBox:     { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyIconBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  emptyText:    { fontSize: 14, color: C.textMute },
})