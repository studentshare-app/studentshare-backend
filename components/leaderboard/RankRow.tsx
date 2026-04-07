/**
 * components/leaderboard/RankRow.tsx
 * A single ranked user row (rank 4+).
 * Highlights the current user with an orange left bar + tinted background.
 */

import { Ionicons } from '@expo/vector-icons'
import { Image, StyleSheet, Text, View } from 'react-native'
import { C } from '../../src/lib/colors'
import { BreakdownBar } from './BreakdownBar'
import { MovementChip } from './MovementChip'
import type { LeaderboardEntry } from '../../src/lib/leaderboard'

type Props = {
  entry: LeaderboardEntry
  isMe: boolean
  topScore: number
  showCollege?: boolean
}

export function RankRow({ entry, isMe, showCollege = false }: Props) {
  const initial = entry.full_name?.charAt(0).toUpperCase() ?? '?'

  return (
    <View style={[st.row, isMe && st.rowMe]}>
      {/* Orange left accent bar for current user */}
      {isMe && <View style={st.meBar} />}

      {/* Rank number */}
      <View style={st.rankContainer}>
        <Text maxFontSizeMultiplier={1.3} style={[st.rankNum, isMe && { color: C.orange, fontSize: 13 }]}>
          {entry.rank}
        </Text>
      </View>

      {/* Avatar */}
      <View style={st.avatarWrap}>
        {entry.avatar_url ? (
          <Image source={{ uri: entry.avatar_url }} style={[st.avatar, isMe && st.avatarMe]} />
        ) : (
          <View style={[st.avatarFb, isMe && st.avatarMe]}>
            <Text maxFontSizeMultiplier={1.3} style={[st.avatarInit, isMe && { color: C.orange }]}>
              {initial}
            </Text>
          </View>
        )}
      </View>

      {/* Name + Info */}
      <View style={st.mainInfo}>
        <View style={st.nameRow}>
          <Text maxFontSizeMultiplier={1.3} style={st.name} numberOfLines={1}>
            {entry.full_name}
          </Text>
          {entry.is_verified && (
            <View style={st.verifiedBadge}>
              <Ionicons name="checkmark" size={8} color="#fff" />
            </View>
          )}
          {isMe && (
            <View style={st.youChip}>
              <Text allowFontScaling={false} style={st.youChipText}>YOU</Text>
            </View>
          )}
        </View>
        
        <View style={st.statsRow}>
          {showCollege && entry.college_name && (
            <Text allowFontScaling={false} style={st.collegeName} numberOfLines={1}>
              {entry.college_name} • 
            </Text>
          )}
          <Text allowFontScaling={false} style={st.metricsSummary}>
            {entry.downloads || 0}d • {entry.quizzes || 0}q • {entry.ai_sessions || 0}ai
          </Text>
        </View>
        <BreakdownBar entry={entry} width={80} />
      </View>

      {/* Right side: Movement + Score */}
      <View style={st.trailing}>
        <MovementChip movement={entry.movement} />
        <View style={st.ptsBox}>
          <Text maxFontSizeMultiplier={1.3} style={[st.pts, isMe && { color: C.orange }]}>
            {entry.score.toLocaleString()}
          </Text>
          <Text allowFontScaling={false} style={st.ptsSub}>PTS</Text>
        </View>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, position: 'relative' },
  rowMe:        { backgroundColor: C.orange + '08' },
  meBar:        { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.orange },
  rankContainer:{ width: 28, alignItems: 'center' },
  rankNum:      { fontSize: 13, fontWeight: '800', color: C.textMute },
  avatarWrap:   { position: 'relative' },
  avatar:       { width: 44, height: 44, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  avatarMe:     { borderColor: C.orange + '50', borderWidth: 2 },
  avatarFb:     { width: 44, height: 44, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  avatarInit:   { fontSize: 16, fontWeight: '900', color: C.textSub },
  mainInfo:     { flex: 1, minWidth: 0, gap: 1 },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:         { fontSize: 14, fontWeight: '700', color: C.text },
  statsRow:     { flexDirection: 'row', alignItems: 'center' },
  collegeName:  { fontSize: 11, color: C.textMute, fontWeight: '600' },
  metricsSummary:{ fontSize: 10, color: C.textMute, fontWeight: '500', textTransform: 'uppercase' },
  verifiedBadge:{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.sapphire, justifyContent: 'center', alignItems: 'center' },
  youChip:      { backgroundColor: C.orange + '15', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  youChipText:  { fontSize: 8, fontWeight: '900', color: C.orange, letterSpacing: 0.8 },
  trailing:     { alignItems: 'flex-end', gap: 4, minWidth: 60 },
  ptsBox:       { alignItems: 'flex-end' },
  pts:          { fontSize: 14, fontWeight: '800', color: C.text, letterSpacing: -0.2 },
  ptsSub:       { fontSize: 9, fontWeight: '700', color: C.textMute, marginTop: -2 },
})
