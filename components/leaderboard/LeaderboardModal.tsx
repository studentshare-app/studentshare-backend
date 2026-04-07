/**
 * LeaderboardModal — updated for app/(tabs)
 *
 * DROP-IN REPLACEMENT for the LeaderboardModal in app/(tabs).
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useEffect, useState } from 'react'

import { C } from '../../src/lib/colors'
import {
  fetchCollegeLeaderboard,
  fetchCollegesLeaderboard,
  fetchGlobalLeaderboard,
  type LeaderboardEntry,
  type LeaderPeriod,
} from '../../src/lib/leaderboard'

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
  const { data: globalBoard = [], isLoading: loadingGlobal } = useQuery({
    queryKey: ['leaderboard_global', resolvedPeriod, debouncedSearch, tab === 'weekly_gainers'],
    queryFn: () => fetchGlobalLeaderboard(resolvedPeriod, debouncedSearch, tab === 'weekly_gainers'),
    enabled: visible && (tab === 'all_campus' || tab === 'weekly_gainers'),
    staleTime: 5 * 60 * 1000,
  })

  const { data: collegeBoard = [], isLoading: loadingCollege } = useQuery({
    queryKey: ['leaderboard_college', collegeId, resolvedPeriod, debouncedSearch],
    queryFn: () => fetchCollegeLeaderboard(collegeId, resolvedPeriod, debouncedSearch),
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
  const nextEntry     = myEntry ? activeBoard.find(e => e.rank === myEntry.rank - 1) : undefined
  const topCollegeAvg = collegesBoard[0]?.avg_score ?? 1
  const showCollege   = tab === 'all_campus' && !myCollegeOnly
  const showPeriod    = tab !== 'weekly_gainers'

  const scopeLabel =
    tab === 'weekly_gainers' ? 'Weekly Ranking'
    : myCollegeOnly          ? 'College Rank'
    : 'Global Rank'

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={m.overlay}>
        <TouchableOpacity style={m.dismiss} activeOpacity={1} onPress={onClose} />
        
        <View style={m.sheet}>
          <View style={m.handleRow}>
            <View style={m.handle} />
          </View>

          <View style={m.header}>
            <TouchableOpacity style={m.closeBtn} onPress={() => {
              if (isSearching) {
                setIsSearching(false)
                setSearchText('')
              } else {
                onClose()
              }
            }}>
              <Ionicons name={isSearching ? "close" : "chevron-down"} size={20} color={C.text} />
            </TouchableOpacity>

            <View style={{ flex: 1, marginHorizontal: 12 }}>
              {isSearching ? (
                <TextInput
                  autoFocus
                  placeholder="Search students..."
                  placeholderTextColor={C.textMute}
                  style={m.searchInput}
                  value={searchText}
                  onChangeText={setSearchText}
                />
              ) : (
                <Text maxFontSizeMultiplier={1.2} style={m.title}>Community Leaderboard</Text>
              )}
            </View>

            <TouchableOpacity 
              style={[m.closeBtn, isSearching && { borderColor: C.orange }]} 
              onPress={() => setIsSearching(!isSearching)}
            >
              <Ionicons name="search" size={18} color={isSearching ? C.orange : C.textSub} />
            </TouchableOpacity>
          </View>

          <TabBar
            active={tab}
            onChange={t => {
              setTab(t)
              if (t !== 'all_campus') setMyCollegeOnly(false)
            }}
          />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {showPeriod && (
              <View style={m.pickerBox}>
                <PeriodPicker active={period} onChange={setPeriod} />
              </View>
            )}

            {tab === 'all_campus' && (
              <View style={m.filterRow}>
                <TouchableOpacity
                  style={[m.filterChip, myCollegeOnly && m.filterChipActive]}
                  onPress={() => setMyCollegeOnly(!myCollegeOnly)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="school" size={14} color={myCollegeOnly ? '#FFF' : C.textSub} />
                  <Text style={[m.filterChipText, myCollegeOnly && m.filterChipTextActive]}>My College</Text>
                </TouchableOpacity>
              </View>
            )}

            {isLoading ? (
              <View style={m.loadingBox}>
                <ActivityIndicator color={C.orange} size="large" />
                <Text style={m.loadingText}>Loading Rankings...</Text>
              </View>

            ) : tab === 'colleges' ? (
              <View style={m.section}>
                {collegesBoard.length > 0 ? (
                  <View style={m.listCard}>
                    {collegesBoard.map((entry, i) => (
                      <View key={entry.id}>
                        <CollegeRankRow entry={entry} isMyCollege={entry.id === collegeId} topAvg={topCollegeAvg} />
                        {i < collegesBoard.length - 1 && <View style={m.divider} />}
                      </View>
                    ))}
                  </View>
                ) : (
                  <ModalEmpty icon="school-outline" label="No college data yet" />
                )}
              </View>

            ) : activeBoard.length > 0 ? (
              <View style={m.section}>
                {myEntry && (
                  <MyPositionCard
                    rank={myEntry.rank}
                    totalRanked={activeBoard.length}
                    score={myEntry.score}
                    nextRankScore={nextEntry?.score}
                    scopeLabel={scopeLabel}
                  />
                )}

                {podiumEntries.length >= 2 && (
                  <PodiumSection entries={podiumEntries} showCollege={showCollege} />
                )}

                <View style={m.sectionLabelRow}>
                  <Text style={m.sectionLabel}>TOP CONTRIBUTORS</Text>
                </View>

                <View style={m.listCard}>
                  {restEntries.map((entry, i) => (
                    <View key={entry.id}>
                      <RankRow entry={entry} isMe={entry.id === userId} topScore={topEntry?.score ?? 1} showCollege={showCollege} />
                      {i < restEntries.length - 1 && <View style={m.divider} />}
                    </View>
                  ))}
                  {myEntry && myEntry.rank > restEntries.length + 3 && (
                    <>
                      <View style={m.ellipsisRow}><Text style={m.ellipsisText}>•••</Text></View>
                      <View style={m.divider} />
                      <RankRow entry={myEntry} isMe topScore={topEntry?.score ?? 1} showCollege={showCollege} />
                    </>
                  )}
                </View>
              </View>
            ) : (
              <ModalEmpty icon="trophy-outline" label="No data yet" />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function ModalEmpty({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={m.emptyBox}>
      <View style={m.emptyIconBox}>
        <Ionicons name={icon} size={32} color={C.textMute} />
      </View>
      <Text style={m.emptyText}>{label}</Text>
    </View>
  )
}

const m = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  dismiss:      { ...StyleSheet.absoluteFillObject },
  sheet:        { backgroundColor: C.void, borderTopLeftRadius: 36, borderTopRightRadius: 36, maxHeight: '92%', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20 },
  handleRow:    { alignItems: 'center', paddingVertical: 12 },
  handle:       { width: 44, height: 5, borderRadius: 2.5, backgroundColor: C.border },
  
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  title:        { fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  searchInput:  { flex: 1, fontSize: 16, fontWeight: '600', color: C.text, padding: 0 },
  closeBtn:     { width: 36, height: 36, borderRadius: 12, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },

  pickerBox:    { paddingHorizontal: 16, marginTop: 8 },
  filterRow:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.orange, borderColor: C.orange },
  filterChipText: { fontSize: 13, fontWeight: '700', color: C.textSub },
  filterChipTextActive: { color: '#FFF' },

  section:      { paddingHorizontal: 0 },
  sectionLabelRow: { paddingHorizontal: 20, marginVertical: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: C.textMute, letterSpacing: 1 },

  listCard:     { marginHorizontal: 16, backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 20 },
  divider:      { height: 1, backgroundColor: C.border, opacity: 0.5 },
  ellipsisRow:  { paddingVertical: 12, alignItems: 'center' },
  ellipsisText: { color: C.textMute, letterSpacing: 3 },

  loadingBox:   { paddingVertical: 100, alignItems: 'center', gap: 12 },
  loadingText:  { color: C.textMute, fontWeight: '600' },
  emptyBox:     { paddingVertical: 80, alignItems: 'center', gap: 16 },
  emptyIconBox: { width: 72, height: 72, borderRadius: 24, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  emptyText:    { fontSize: 15, color: C.textMute, fontWeight: '600' },
})
