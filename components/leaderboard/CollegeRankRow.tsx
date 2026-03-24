/**
 * components/leaderboard/CollegeRankRow.tsx
 * A single college entry row for the Colleges tab.
 */

import { StyleSheet, Text, View } from 'react-native'
import { C } from '../../lib/colors'
import { MovementChip } from './MovementChip'
import type { CollegeEntry } from '../../lib/leaderboard'

type Props = {
  entry: CollegeEntry
  isMyCollege: boolean
  topAvg: number
}

export function CollegeRankRow({ entry, isMyCollege, topAvg }: Props) {
  const rankColor =
    entry.rank === 1 ? C.gold
    : entry.rank === 2 ? C.silver
    : entry.rank === 3 ? C.bronze
    : isMyCollege ? C.orange
    : C.textMute

  const barColor =
    entry.rank === 1 ? C.gold
    : entry.rank === 2 ? C.silver
    : entry.rank === 3 ? C.bronze
    : isMyCollege ? C.orange
    : C.lavender

  const barPct = topAvg > 0 ? (entry.avg_score / topAvg) * 100 : 0

  return (
    <View style={[st.row, isMyCollege && st.rowMe]}>
      {isMyCollege && <View style={st.meBar} />}

      {/* Rank */}
      <Text maxFontSizeMultiplier={1.3} style={[st.rankNum, { color: rankColor }]}>
        {entry.rank}
      </Text>

      {/* College icon */}
      <View style={[st.logoBox, { borderColor: rankColor + '30', backgroundColor: rankColor + '10' }]}>
        <Text style={{ fontSize: 20 }}>🏛</Text>
      </View>

      {/* Name + meta */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text maxFontSizeMultiplier={1.3} style={st.name} numberOfLines={1}>
            {entry.short_name}
          </Text>
          {isMyCollege && (
            <View style={st.youChip}>
              <Text allowFontScaling={false} style={st.youChipText}>YOU</Text>
            </View>
          )}
          <MovementChip movement={entry.movement} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 }}>
          <Text allowFontScaling={false} style={st.meta}>👥 {entry.student_count.toLocaleString()}</Text>
          <Text allowFontScaling={false} style={st.meta}>⭐ {entry.total_score.toLocaleString()} pts</Text>
        </View>
      </View>

      {/* Bar + avg score */}
      <View style={{ alignItems: 'flex-end', minWidth: 60 }}>
        <View style={st.barTrack}>
          <View style={[st.barFill, { width: `${barPct}%` as any, backgroundColor: barColor }]} />
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[st.avg, isMyCollege && { color: C.orange }]}>
          {entry.avg_score.toFixed(1)}
          <Text style={st.avgSub}> avg</Text>
        </Text>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, position: 'relative' },
  rowMe:    { backgroundColor: 'rgba(232,105,42,0.06)' },
  meBar:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.orange, borderRadius: 2 },
  rankNum:  { width: 26, textAlign: 'center', fontSize: 12, fontWeight: '800', flexShrink: 0 },
  logoBox:  { width: 44, height: 44, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  name:     { fontSize: 13.5, fontWeight: '600', color: C.text, flexShrink: 1 },
  meta:     { fontSize: 11, color: C.textMute },
  youChip:  { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  youChipText:{ fontSize: 9, fontWeight: '800', color: C.orange, letterSpacing: 0.5 },
  barTrack: { width: 56, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 2, opacity: 0.8 },
  avg:      { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 3, textAlign: 'right' },
  avgSub:   { fontSize: 10, fontWeight: '400', color: C.textMute },
})