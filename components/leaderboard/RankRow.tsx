/**
 * components/leaderboard/RankRow.tsx
 * A single ranked user row (rank 4+).
 * Highlights the current user with an orange left bar + tinted background.
 */

import { Ionicons } from '@expo/vector-icons'
import { Image, StyleSheet, Text, View } from 'react-native'
import { C } from '../../lib/colors'
import { BreakdownBar } from './BreakdownBar'
import { MovementChip } from './MovementChip'
import type { LeaderboardEntry } from '../../lib/leaderboard'

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
      <Text maxFontSizeMultiplier={1.3} style={[st.rankNum, isMe && { color: C.orange }]}>
        {entry.rank}
      </Text>

      {/* Avatar */}
      {entry.avatar_url ? (
        <Image source={{ uri: entry.avatar_url }} style={[st.avatar, isMe && st.avatarMe]} />
      ) : (
        <View style={[st.avatarFb, isMe && st.avatarMe]}>
          <Text maxFontSizeMultiplier={1.3} style={[st.avatarInit, isMe && { color: C.orange }]}>
            {initial}
          </Text>
        </View>
      )}

      {/* Name + breakdown bar */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
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
        {showCollege && entry.college_name ? (
          <Text allowFontScaling={false} style={st.collegeName} numberOfLines={1}>
            {entry.college_name}
          </Text>
        ) : null}
        <BreakdownBar entry={entry} width={80} />
      </View>

      {/* Movement */}
      <MovementChip movement={entry.movement} />

      {/* Score */}
      <View style={{ alignItems: 'flex-end', minWidth: 48 }}>
        <Text maxFontSizeMultiplier={1.3} style={[st.pts, isMe && { color: C.orange }]}>
          {entry.score.toLocaleString()}
        </Text>
        <Text allowFontScaling={false} style={st.ptsSub}>pts</Text>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 20, paddingVertical: 13, position: 'relative' },
  rowMe:        { backgroundColor: 'rgba(232,105,42,0.06)' },
  meBar:        { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.orange, borderRadius: 2 },
  rankNum:      { width: 26, textAlign: 'center', fontSize: 12, fontWeight: '800', color: C.textMute, flexShrink: 0 },
  avatar:       { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: C.border, flexShrink: 0 },
  avatarMe:     { borderColor: C.orange + '60' },
  avatarFb:     { width: 40, height: 40, borderRadius: 14, backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarInit:   { fontSize: 15, fontWeight: '800', color: C.textSub },
  name:         { fontSize: 13.5, fontWeight: '600', color: C.text, flexShrink: 1 },
  collegeName:  { fontSize: 11, color: C.textMute, marginTop: 1 },
  verifiedBadge:{ width: 14, height: 14, borderRadius: 7, backgroundColor: C.sapphire, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  youChip:      { backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orange + '30', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  youChipText:  { fontSize: 9, fontWeight: '800', color: C.orange, letterSpacing: 0.5 },
  pts:          { fontSize: 13, fontWeight: '700', color: C.text },
  ptsSub:       { fontSize: 10, color: C.textMute },
})