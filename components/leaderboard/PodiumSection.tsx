/**
 * components/leaderboard/PodiumSection.tsx
 * Renders the top-3 podium: 2nd left (shorter base), 1st centre (tallest, crown),
 * 3rd right. Matches the HTML mockup layout.
 */

import { LinearGradient } from 'expo-linear-gradient'
import { Image, StyleSheet, Text, View } from 'react-native'
import { C } from '../../src/lib/colors'
import type { LeaderboardEntry } from '../../src/lib/leaderboard'

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
  1: ['#FFD700', '#FFFACD', '#FF8C00'], // More vibrant Gold
  2: ['#C0C0C0', '#F5F5F5', '#808080'], // Silver
  3: ['#CD7F32', '#FFE4C4', '#8B4513'], // Bronze
}
const ACCENT: Record<1 | 2 | 3, string> = {
  1: '#F59E0B', 2: '#94A3B8', 3: '#B45309',
}
const BASE_H: Record<1 | 2 | 3, number>  = { 1: 54, 2: 38, 3: 30 }
const RING_SIZE: Record<1 | 2 | 3, number> = { 1: 82, 2: 66, 3: 66 }
const FONT_SIZE: Record<1 | 2 | 3, number> = { 1: 26, 2: 20, 3: 20 }

function PodiumSlot({ entry, rank, showCollege }: SlotProps) {
  const rs   = RING_SIZE[rank]
  const ac   = ACCENT[rank]
  const rc   = RING_COLORS[rank]
  const init = entry.full_name?.charAt(0).toUpperCase() ?? '?'
  const innerSize = rs - 6

  return (
    <View style={[st.slot, rank === 1 && { zIndex: 5, transform: [{ scale: 1.05 }] }]}>
      {rank === 1 && <Text style={st.crown}>👑</Text>}

      {/* Ring */}
      <View style={[st.avatarWrapper, { width: rs, height: rs }]}>
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

      {/* Info */}
      <View style={st.infoRow}>
        <Text
          maxFontSizeMultiplier={1.3}
          style={[st.name, rank === 1 && { fontSize: 14, fontWeight: '800' }]}
          numberOfLines={1}
        >
          {entry.full_name?.split(' ')[0] ?? '?'}
        </Text>

        {showCollege && entry.college_name ? (
          <Text allowFontScaling={false} style={st.collegeMiniText} numberOfLines={1}>
            {entry.college_name}
          </Text>
        ) : null}

        <Text
          allowFontScaling={false}
          style={[st.score, rank === 1 && { color: '#F59E0B', fontWeight: '800' }]}
        >
          {entry.score.toLocaleString()}<Text style={{ fontSize: 9, opacity: 0.7 }}> PTS</Text>
        </Text>
      </View>

      {/* Podium base */}
      <LinearGradient
        colors={[ac + '20', ac + '10']}
        style={[st.base, { height: BASE_H[rank], borderColor: ac + '30' }]}
      >
        <Text style={[st.baseNum, { color: ac }]}>{rank}</Text>
      </LinearGradient>
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
    backgroundColor: C.void,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 32,
    paddingTop: 24,
    paddingHorizontal: 12,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  glow:       {
    position: 'absolute', bottom: -50, left: '50%',
    width: 300, height: 150, borderRadius: 150,
    backgroundColor: '#F59E0B' + '15',
    transform: [{ translateX: -150 }],
  },
  slot:       { alignItems: 'center', flex: 1, gap: 2 },
  crown:      { fontSize: 24, marginBottom: 2, transform: [{ translateY: 4 }] },
  avatarWrapper: { position: 'relative', marginBottom: 8 },
  ring:       { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarFb:   { backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' },
  avatarInit: { fontWeight: '900', color: C.text },
  badge:      {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  badgeText:  { fontSize: 11, fontWeight: '900', color: C.void },
  infoRow:    { alignItems: 'center', marginBottom: 8 },
  name:       { fontSize: 12, fontWeight: '700', color: C.text, textAlign: 'center', maxWidth: 80 },
  collegeMiniText: { fontSize: 9, color: C.textMute, fontWeight: '600', marginBottom: 1 },
  score:      { fontSize: 12, color: C.textSub, textAlign: 'center', fontWeight: '600' },
  base:       {
    width: '100%', borderTopLeftRadius: 12, borderTopRightRadius: 12, borderWidth: 1, borderBottomWidth: 0,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  baseNum:    { fontSize: 28, fontWeight: '900', opacity: 0.15 },
})
