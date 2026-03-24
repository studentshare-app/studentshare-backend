/**
 * LeaderboardModal — updated for index.tsx
 *
 * DROP-IN REPLACEMENT for the LeaderboardModal in app/(tabs)/index.tsx.
 * Uses the same shared components as app/leaderboard.tsx so both surfaces
 * always look identical.
 *
 * HOW TO USE:
 *   1. Delete the old LeaderboardModal function from index.tsx
 *   2. Add this import at the top of index.tsx:
 *        import { LeaderboardModal } from '@/components/leaderboard/LeaderboardModal'
 *   3. Keep the existing usage in the JSX — props are unchanged:
 *        <LeaderboardModal
 *          visible={showLeaderboard}
 *          onClose={() => setShowLeaderboard(false)}
 *          userId={userId}
 *          collegeId={collegeId}
 *          collegeName={collegeName}
 *        />
 */

import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useState } from 'react'

import { C } from '../../lib/colors'
import {
  fetchCollegeLeaderboard,
  fetchCollegesLeaderboard,
  fetchGlobalLeaderboard,
  type LeaderboardEntry,
  type LeaderPeriod,
} from '../../lib/leaderboard'

import { CollegeRankRow } from './CollegeRankRow'
import { MyPositionCard } from './MyPositionCard'
import { PeriodPicker }   from './PeriodPicker'
import { PodiumSection }  from './PodiumSection'
import { RankRow }        from './RankRow'
import { TabBar, type LeaderTab } from './TabBar'

type Props = {
  visible: boolean
  onClose: () => void
  userId: string | null
  collegeId: string | null
  collegeName?: string
}

export function LeaderboardModal({ visible, onClose, userId, collegeId, collegeName }: Props) {
  const [tab,    setTab]    = useState<LeaderTab>('all_campus')
  const [period, setPeriod] = useState<LeaderPeriod>('weekly')
  const [myCollegeOnly, setMyCollegeOnly] = useState(false)

  const resolvedPeriod: LeaderPeriod = tab === 'weekly_gainers' ? 'weekly' : period

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: globalBoard = [], isLoading: loadingGlobal } = useQuery({
    queryKey: ['leaderboard_global', resolvedPeriod],
    queryFn: () => fetchGlobalLeaderboard(resolvedPeriod),
    enabled: visible && (tab === 'all_campus' || tab === 'weekly_gainers'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegeBoard = [], isLoading: loadingCollege } = useQuery({
    queryKey: ['leaderboard_college', collegeId, resolvedPeriod],
    queryFn: () => fetchCollegeLeaderboard(collegeId, resolvedPeriod),
    enabled: visible && tab === 'all_campus' && myCollegeOnly && !!collegeId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegesBoard = [], isLoading: loadingColleges } = useQuery({
    queryKey: ['leaderboard_colleges', resolvedPeriod],
    queryFn: () => fetchCollegesLeaderboard(resolvedPeriod),
    enabled: visible && tab === 'colleges',
    staleTime: 10 * 60 * 1000,
  })

  // ── Derived ──────────────────────────────────────────────────────────────
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

  const podiumEntries = activeBoard.slice(0, 3)
  const restEntries   = activeBoard.slice(3)
  const myEntry       = activeBoard.find(e => e.id === userId)
  const topEntry      = activeBoard[0]
  const nextEntry     = myEntry ? activeBoard[myEntry.rank - 2] : undefined
  const topCollegeAvg = collegesBoard[0]?.avg_score ?? 1
  const showCollege   = tab === 'all_campus' && !myCollegeOnly
  const showPeriod    = tab !== 'weekly_gainers'

  const scopeLabel =
    tab === 'weekly_gainers' ? 'Weekly Campus Rank'
    : myCollegeOnly          ? 'College Rank'
    : 'Global Rank'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
    >
      <View style={m.overlay}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[m.sheet, { maxHeight: '94%' }]}>

            {/* Handle */}
            <View style={m.handleRow}><View style={m.handle} /></View>

            {/* Modal header row */}
            <View style={m.headerRow}>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={1.2} style={m.title}>Leaderboard</Text>
              </View>
              <TouchableOpacity style={m.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={18} color={C.textSub} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <TabBar
              active={tab}
              onChange={t => {
                setTab(t)
                if (t !== 'all_campus') setMyCollegeOnly(false)
              }}
            />

            {/* Scrollable content */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 32 }}
            >
              {/* Period picker */}
              {showPeriod && (
                <PeriodPicker active={period} onChange={setPeriod} />
              )}

              {/* My College filter chip */}
              {tab === 'all_campus' && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={m.filterRow}
                >
                  <TouchableOpacity
                    style={[m.filterChip, myCollegeOnly && m.filterChipActive]}
                    onPress={() => setMyCollegeOnly(p => !p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[m.filterChipText, myCollegeOnly && m.filterChipTextActive]}>
                      🏛 My College
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              )}

              {isLoading ? (
                <View style={m.loadingBox}>
                  <ActivityIndicator color={C.orange} />
                </View>

              ) : tab === 'colleges' ? (
                /* Colleges board */
                <View style={m.listCard}>
                  {collegesBoard.length === 0 ? (
                    <ModalEmpty icon="school-outline" label="No college data yet" />
                  ) : (
                    collegesBoard.map((entry, i) => (
                      <View key={entry.id}>
                        <CollegeRankRow
                          entry={entry}
                          isMyCollege={entry.id === collegeId}
                          topAvg={topCollegeAvg}
                        />
                        {i < collegesBoard.length - 1 && <View style={m.divider} />}
                      </View>
                    ))
                  )}
                </View>

              ) : activeBoard.length === 0 ? (
                <ModalEmpty icon="trophy-outline" label="No data yet" />

              ) : (
                /* Users board */
                <>
                  {myEntry && (
                    <View style={{ marginTop: 12 }}>
                      <MyPositionCard
                        rank={myEntry.rank}
                        totalRanked={activeBoard.length}
                        score={myEntry.score}
                        nextRankScore={nextEntry?.score}
                        scopeLabel={scopeLabel}
                        userName={myEntry.full_name}
                        showShare={false}
                      />
                    </View>
                  )}

                  {podiumEntries.length >= 2 && (
                    <View style={{ marginTop: 12 }}>
                      <PodiumSection entries={podiumEntries} showCollege={showCollege} />
                    </View>
                  )}

                  <View style={m.sectionLabelRow}>
                    <Text maxFontSizeMultiplier={1.2} style={m.sectionLabel}>
                      {tab === 'weekly_gainers' ? 'Weekly Rankings' : 'Global Standings'}
                    </Text>
                  </View>

                  <View style={m.listCard}>
                    {restEntries.map((entry, i) => (
                      <View key={entry.id}>
                        <RankRow
                          entry={entry}
                          isMe={entry.id === userId}
                          topScore={topEntry?.score ?? 1}
                          showCollege={showCollege}
                        />
                        {i < restEntries.length - 1 && <View style={m.divider} />}
                      </View>
                    ))}

                    {myEntry && myEntry.rank > restEntries.length + 3 && (
                      <>
                        <View style={m.ellipsisRow}>
                          <Text allowFontScaling={false} style={m.ellipsisText}>• • •</Text>
                        </View>
                        <View style={m.divider} />
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
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function ModalEmpty({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={m.emptyBox}>
      <Ionicons name={icon} size={28} color={C.textMute} />
      <Text maxFontSizeMultiplier={1.2} style={m.emptyText}>{label}</Text>
    </View>
  )
}

const m = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet:        { backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  handleRow:    { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  headerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  title:        { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  closeBtn:     { width: 32, height: 32, borderRadius: 10, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },

  filterRow:    { paddingHorizontal: 16, paddingBottom: 4, paddingTop: 2, gap: 8, flexDirection: 'row' },
  filterChip:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: C.border },
  filterChipActive:    { backgroundColor: C.orangeDim, borderColor: C.orange + '50' },
  filterChipText:      { fontSize: 12, fontWeight: '600', color: C.textSub },
  filterChipTextActive:{ color: C.orange },

  sectionLabelRow:{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5, color: C.textMute, textTransform: 'uppercase' },

  listCard:     { marginHorizontal: 16, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  divider:      { height: 1, backgroundColor: C.border, marginHorizontal: 16, opacity: 0.6 },

  ellipsisRow:  { paddingVertical: 10, alignItems: 'center' },
  ellipsisText: { fontSize: 12, color: C.textMute, letterSpacing: 4 },

  loadingBox:   { paddingVertical: 60, alignItems: 'center' },
  emptyBox:     { paddingVertical: 40, alignItems: 'center', gap: 10 },
  emptyText:    { fontSize: 13, color: C.textMute },
})