/**
 * components/leaderboard/BreakdownBar.tsx
 * Thin coloured bar showing score composition:
 *   blue = downloads | green = quizzes | purple = AI sessions | gold = streak
 */

import { StyleSheet, View } from 'react-native'
import { C } from '../../lib/colors'
import type { LeaderboardEntry } from '../../lib/leaderboard'

type Props = { entry: LeaderboardEntry; width?: number }

export function BreakdownBar({ entry, width = 72 }: Props) {
  const total =
    (entry.downloads   || 0) +
    (entry.quizzes     || 0) +
    (entry.ai_sessions || 0) +
    (entry.streak      || 0)

  if (!total) {
    return (
      <View style={[st.bar, { width }]}>
        <View style={[st.seg, { flex: 1, backgroundColor: C.orange, opacity: 0.5 }]} />
      </View>
    )
  }

  const dPct  = (entry.downloads   || 0) / total
  const qPct  = (entry.quizzes     || 0) / total
  const aiPct = (entry.ai_sessions || 0) / total
  const sPct  = (entry.streak      || 0) / total

  return (
    <View style={[st.bar, { width }]}>
      {dPct  > 0 && <View style={[st.seg, { flex: dPct,  backgroundColor: C.sapphire }]} />}
      {qPct  > 0 && <View style={[st.seg, { flex: qPct,  backgroundColor: C.emerald  }]} />}
      {aiPct > 0 && <View style={[st.seg, { flex: aiPct, backgroundColor: C.lavender }]} />}
      {sPct  > 0 && <View style={[st.seg, { flex: sPct,  backgroundColor: C.gold     }]} />}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 5 },
  seg: { height: '100%', opacity: 0.8 },
})