/**
 * components/leaderboard/CollegeRankRow.tsx
 * A single college entry row for the Colleges tab.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../src/lib/colors'
import { MovementChip } from './MovementChip'
import type { CollegeEntry } from '../../src/lib/leaderboard'

type Props = {
  entry: CollegeEntry
  isMyCollege: boolean
  topAvg: number
}

export function CollegeRankRow({ entry, isMyCollege, topAvg }: Props) {
  const isTop3 = entry.rank <= 3
  const rankColor =
    entry.rank === 1 ? C.gold
    : entry.rank === 2 ? C.silver
    : entry.rank === 3 ? C.bronze
    : isMyCollege ? C.orange
    : C.textSub

  const barColor =
    entry.rank === 1 ? C.gold
    : entry.rank === 2 ? C.silver
    : entry.rank === 3 ? C.bronze
    : isMyCollege ? C.orange
    : C.sapphire

  const barPct = topAvg > 0 ? (entry.avg_score / topAvg) * 100 : 0

  return (
    <View style={[st.row, isMyCollege && st.rowMe]}>
      {isMyCollege && <View style={st.meBar} />}

      {/* Rank number */}
      <View style={st.rankContainer}>
        <Text maxFontSizeMultiplier={1.3} style={[st.rankNum, { color: rankColor, fontSize: isTop3 ? 14 : 12 }]}>
          {entry.rank}
        </Text>
      </View>

      {/* College Icon */}
      <View style={[st.logoBox, { borderColor: rankColor + '40', backgroundColor: rankColor + '10' }]}>
        <Ionicons name="school" size={20} color={rankColor} />
      </View>

      {/* Name + Info */}
      <View style={st.mainInfo}>
        <View style={st.nameRow}>
          <Text maxFontSizeMultiplier={1.3} style={st.name} numberOfLines={1}>
            {entry.short_name}
          </Text>
          {isMyCollege && (
            <View style={st.youChip}>
              <Text allowFontScaling={false} style={st.youChipText}>YOU</Text>
            </View>
          )}
        </View>
        
        <View style={st.statsRow}>
          <Text allowFontScaling={false} style={st.meta}>
            <Text style={{ fontWeight: '800', color: C.textSub }}>{entry.student_count.toLocaleString()}</Text> students • 
            <Text style={{ fontWeight: '800', color: C.textSub }}> {entry.total_score.toLocaleString()}</Text> pts
          </Text>
        </View>
      </View>

      {/* Trailing: Movement + Score */}
      <View style={st.trailing}>
        <MovementChip movement={entry.movement} />
        <View style={st.scoreBox}>
          <View style={st.barTrack}>
            <View style={[st.barFill, { width: `${barPct}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={[st.avgText, isMyCollege && { color: C.orange }]}>
            {entry.avg_score.toFixed(1)} <Text style={st.avgSub}>avg</Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, position: 'relative' },
  rowMe:    { backgroundColor: C.orange + '08' },
  meBar:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.orange },
  rankContainer:{ width: 28, alignItems: 'center' },
  rankNum:  { fontWeight: '900' },
  logoBox:  { width: 44, height: 44, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  mainInfo: { flex: 1, minWidth: 0, gap: 2 },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:     { fontSize: 14, fontWeight: '700', color: C.text },
  youChip:  { backgroundColor: C.orange + '15', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  youChipText:{ fontSize: 8, fontWeight: '900', color: C.orange, letterSpacing: 0.8 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  meta:     { fontSize: 11, color: C.textMute, fontWeight: '500' },
  trailing: { alignItems: 'flex-end', gap: 6, minWidth: 70 },
  scoreBox: { alignItems: 'flex-end' },
  barTrack: { width: 60, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 2 },
  barFill:  { height: '100%', borderRadius: 3 },
  avgText:  { fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  avgSub:   { fontSize: 9, fontWeight: '600', color: C.textMute },
})
