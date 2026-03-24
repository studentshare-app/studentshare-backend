/**
 * components/leaderboard/PodiumSection.tsx
 * Renders the top-3 podium: 2nd left (shorter base), 1st centre (tallest, crown),
 * 3rd right. Matches the HTML mockup layout.
 */

import { LinearGradient } from 'expo-linear-gradient'
import { Image, StyleSheet, Text, View } from 'react-native'
import { C } from '../../lib/colors'
import type { LeaderboardEntry } from '../../lib/leaderboard'

type Props = {
  entries: LeaderboardEntry[]   // expects entries[0]=1st, [1]=2nd, [2]=3rd
  showCollege?: boolean
}

type SlotProps = {
  entry: LeaderboardEntry
  rank: 1 | 2 | 3
  showCollege: boolean
}

// Ring gradient colours per rank
const RING_COLORS: Record<1 | 2 | 3, [string, string, string]> = {
  1: [C.gold,   '#FFEAA0', C.goldGlow],
  2: [C.silver, '#E8EDF5', '#9AA4B8'],
  3: [C.bronze, '#E8A86A', '#9A5A20'],
}
const ACCENT: Record<1 | 2 | 3, string> = {
  1: C.gold, 2: C.silver, 3: C.bronze,
}
const BASE_H: Record<1 | 2 | 3, number>  = { 1: 50, 2: 34, 3: 26 }
const RING_SIZE: Record<1 | 2 | 3, number> = { 1: 76, 2: 62, 3: 62 }
const FONT_SIZE: Record<1 | 2 | 3, number> = { 1: 24, 2: 18, 3: 18 }

function PodiumSlot({ entry, rank, showCollege }: SlotProps) {
  const rs   = RING_SIZE[rank]
  const ac   = ACCENT[rank]
  const rc   = RING_COLORS[rank]
  const init = entry.full_name?.charAt(0).toUpperCase() ?? '?'
  const innerSize = rs - 6

  return (
    <View style={[st.slot, rank === 1 && { zIndex: 2 }]}>
      {rank === 1 && <Text style={st.crown}>👑</Text>}

      {/* Ring */}
      <View style={{ position: 'relative', marginBottom: 6 }}>
        <LinearGradient
          colors={rc}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[st.ring, { width: rs, height: rs, borderRadius: rs / 2 }]}
        >
          {entry.avatar_url ? (
            <Image
              source={{ uri: entry.avatar_url }}
              style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2 }}
            />
          ) : (
            <View style={[st.avatarFb, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
              <Text style={[st.avatarInit, { fontSize: FONT_SIZE[rank] }]}>{init}</Text>
            </View>
          )}
        </LinearGradient>

        {/* Rank badge bottom-right */}
        <View style={[st.badge, { backgroundColor: ac, borderColor: C.raised }]}>
          <Text allowFontScaling={false} style={st.badgeText}>{rank}</Text>
        </View>
      </View>

      {/* Name */}
      <Text
        maxFontSizeMultiplier={1.3}
        style={[st.name, rank === 1 && { color: C.text, fontSize: 13 }]}
        numberOfLines={1}
      >
        {entry.full_name?.split(' ')[0] ?? '?'}
      </Text>

      {/* College tag (global scope) */}
      {showCollege && entry.college_name ? (
        <View style={st.collegeTag}>
          <Text allowFontScaling={false} style={st.collegeTagText} numberOfLines={1}>
            {entry.college_name}
          </Text>
        </View>
      ) : null}

      {/* Score */}
      <Text
        allowFontScaling={false}
        style={[st.score, rank === 1 && { color: C.gold, fontWeight: '700', fontSize: 13 }]}
      >
        {entry.score.toLocaleString()} pts
      </Text>

      {/* Podium base */}
      <View style={[
        st.base,
        { height: BASE_H[rank], backgroundColor: ac + '0D', borderColor: ac + '28' },
      ]}>
        <Text style={[st.baseNum, { color: ac }]}>{rank}</Text>
      </View>
    </View>
  )
}

export function PodiumSection({ entries, showCollege = false }: Props) {
  if (entries.length < 1) return null

  // Render order: 2nd | 1st | 3rd  (flanks align to bottom, centre elevated)
  const first  = entries[0]
  const second = entries[1] ?? entries[0]
  const third  = entries[2] ?? entries[0]

  return (
    <View style={st.wrap}>
      <View style={st.shell}>
        <View style={st.glow} />
        <View style={{ alignSelf: 'flex-end' }}>
          <PodiumSlot entry={second} rank={2} showCollege={showCollege} />
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <PodiumSlot entry={first}  rank={1} showCollege={showCollege} />
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <PodiumSlot entry={third}  rank={3} showCollege={showCollege} />
        </View>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  wrap:       { paddingHorizontal: 16, marginBottom: 6 },
  shell:      {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 8,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  glow:       {
    position: 'absolute', bottom: 0, left: '50%',
    width: 260, height: 80, borderRadius: 130,
    backgroundColor: C.gold + '12',
    transform: [{ translateX: -130 }],
  },
  slot:       { alignItems: 'center', flex: 1, gap: 4 },
  crown:      { fontSize: 20, marginBottom: 4 },
  ring:       { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarFb:   { backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center' },
  avatarInit: { fontWeight: '800', color: C.text },
  badge:      {
    position: 'absolute', bottom: -4, right: -4,
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  badgeText:  { fontSize: 10, fontWeight: '800', color: C.void },
  name:       { fontSize: 11.5, fontWeight: '700', color: C.text, textAlign: 'center', maxWidth: 80 },
  collegeTag: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 80 },
  collegeTagText:{ fontSize: 10, color: C.textMute, textAlign: 'center' },
  score:      { fontSize: 11, color: C.textSub, textAlign: 'center' },
  base:       {
    width: '100%', borderRadius: 10, borderWidth: 1, borderBottomWidth: 0,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    marginTop: 6,
  },
  baseNum:    { fontSize: 22, fontWeight: '800', opacity: 0.2 },
})