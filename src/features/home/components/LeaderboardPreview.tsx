// features/home/components/LeaderboardPreview.tsx
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C } from '@/lib/colors'
import { fetchCollegeLeaderboard } from '@/lib/leaderboard'

type LeaderboardEntry = {
  id: string
  rank: number
  score: number
  full_name?: string | null
  avatar_url?: string | null
  movement?: number
}

// ✅ Animated crown — floats up/down gently above the #1 avatar
function AnimatedCrown() {
  const float = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -5, duration: 900, useNativeDriver: true }),
        Animated.timing(float, { toValue:  0, duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <Animated.Text style={[styles.crown, { transform: [{ translateY: float }] }]}>
      👑
    </Animated.Text>
  )
}

function PodiumAvatar({ entry, size, bg }: { entry: LeaderboardEntry; size: number; bg: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      {entry.avatar_url
        ? <Image source={{ uri: entry.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: '#fff' }}>{entry.full_name?.charAt(0) ?? '?'}</Text>
      }
      <View style={styles.podAvatarBadge}>
        <Text allowFontScaling={false} style={styles.podAvatarBadgeText}>{entry.rank}</Text>
      </View>
    </View>
  )
}

// ✅ Real percentile: computed from rank / total board length
function footerCopy(rank: number, total: number): string {
  if (rank === 1)   return '🥇 #1 · You\'re leading!'
  if (rank <= 3)    return `Top ${Math.round((rank / total) * 100)}% · Podium material 🔥`
  if (rank <= 10)   return `Top ${Math.round((rank / total) * 100)}% · Keep climbing`
  const pct = Math.round((rank / total) * 100)
  return `Top ${pct}% · Keep going`
}

export function LeaderboardPreview({
  userId,
  collegeId,
  onOpenFull,
}: {
  userId: string | null
  collegeId: string | null
  onOpenFull: () => void
}) {
  const { data: collegeBoard = [] } = useQuery({
  queryKey: ['leaderboard_college', collegeId, 'weekly'],
  queryFn: () => fetchCollegeLeaderboard(collegeId, 'weekly'),
  enabled: !!collegeId,
  staleTime: 5 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,   // keep cache for 24 hours
  placeholderData: (prev) => prev, // show previous data while offline
})

  const activeBoard = collegeBoard as LeaderboardEntry[]
  const myEntry     = activeBoard.find(entry => entry.id === userId)
  const total       = activeBoard.length
  const topScore    = activeBoard[0]?.score || 1
if (activeBoard.length === 0) return null

const podium = activeBoard.slice(0, 3)
const displayLabel = 'TOP CAMPUS CONTRIBUTORS'
const rest = activeBoard.slice(3, 5)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLine} />
          <Text allowFontScaling={false} style={styles.headerLabel}>{displayLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={onOpenFull}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View full leaderboard"
        >
          <Text allowFontScaling={false} style={styles.headerLink}>Full board</Text>
        </TouchableOpacity>
      </View>

     {podium.length >= 1 && (
        <View style={styles.podiumWrap}>
          {/* Left Slot: #2 */}
          <View style={[styles.podSlot, { alignSelf: 'flex-end' }]}>
            {podium.length >= 2 && (
              <>
                <PodiumAvatar entry={podium[1]} size={68} bg="#5A6070" />
                <Text allowFontScaling={false} style={styles.podName} numberOfLines={1}>
                  {podium[1].full_name?.split(' ')[0]}
                </Text>
                <Text allowFontScaling={false} style={styles.podPts}>
                  {podium[1].score.toLocaleString()}
                </Text>
                <View style={styles.podBase2} />
              </>
            )}
          </View>

          {/* Center Slot: #1 */}
          <View style={[styles.podSlot, { alignSelf: 'flex-end', marginBottom: 0 }]}>
            <AnimatedCrown />
            <PodiumAvatar entry={podium[0]} size={84} bg="#BF9730" />
            <Text allowFontScaling={false} style={[styles.podName, { color: C.text }]} numberOfLines={1}>
              {podium[0].full_name?.split(' ')[0]}
            </Text>
            <Text allowFontScaling={false} style={[styles.podPts, { color: C.gold, fontWeight: '700', fontSize: 13 }]}>
              {podium[0].score.toLocaleString()}
            </Text>
            <View style={styles.podBase1} />
          </View>

          {/* Right Slot: #3 */}
          <View style={[styles.podSlot, { alignSelf: 'flex-end' }]}>
            {podium.length >= 3 && (
              <>
                <PodiumAvatar entry={podium[2]} size={68} bg="#7A4A28" />
                <Text allowFontScaling={false} style={styles.podName} numberOfLines={1}>
                  {podium[2].full_name?.split(' ')[0]}
                </Text>
                <Text allowFontScaling={false} style={styles.podPts}>
                  {podium[2].score.toLocaleString()}
                </Text>
                <View style={styles.podBase3} />
              </>
            )}
          </View>
        </View>
      )}
      <View style={styles.rankSection}>
        {rest.map((entry) => {
          const isMe = entry.id === userId
          const mv   = entry.movement
          const hasMv = mv !== undefined && mv !== 0
          return (
            <View key={entry.id}>
              <View style={styles.rowDivider} />
              <View style={[styles.rankRow, isMe && styles.rankRowMe]}>
                <Text style={styles.rankNum}>{entry.rank}</Text>
                <View style={styles.rankAvatarBox}>
                  {entry.avatar_url
                    ? <Image source={{ uri: entry.avatar_url }} style={{ width: 44, height: 44, borderRadius: 14 }} />
                    : <Text style={styles.rankAvatarInit}>{entry.full_name?.charAt(0) ?? '?'}</Text>
                  }
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rankName} numberOfLines={1}>{entry.full_name}</Text>
                  <View style={styles.rankUnderline}>
                    <View style={[styles.rankUnderlineFill, { width: `${Math.min((entry.score / topScore) * 100, 100)}%` as any }]} />
                  </View>
                </View>
                <View style={styles.mvChip}>
                  {hasMv
                    ? <Text style={mv! > 0 ? styles.mvUp : styles.mvDown}>{mv! > 0 ? `↑${mv}` : `↓${Math.abs(mv!)}`}</Text>
                    : <Text style={styles.mvNeutral}>-</Text>
                  }
                </View>
                <View style={styles.ptsBox}>
                  <Text style={styles.rankPts}>{entry.score.toLocaleString()}</Text>
                  <Text style={styles.rankPtsSub}>pts</Text>
                </View>
              </View>
            </View>
          )
        })}
      </View>

      {myEntry && (
        <View style={styles.footer}>
          <Text style={styles.footerHash}>#</Text>
          <Text style={styles.footerRankNum}>{myEntry.rank}</Text>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
            <Text style={styles.footerLabel}>Your College Rank</Text>
            <View style={styles.footerBar}>
              <View style={[styles.footerBarFill, { width: `${Math.min((myEntry.score / topScore) * 100, 100)}%` as any }]} />
            </View>
            {/* ✅ Real percentile — not hardcoded */}
            <Text style={styles.footerSub}>{footerCopy(myEntry.rank, total)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 10 }}>
            <Text style={styles.footerScore}>{myEntry.score.toLocaleString()}</Text>
            <Text style={styles.footerScoreSub}>total pts</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card:       { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 28, padding: 18, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLine: { width: 18, height: 1, backgroundColor: C.orange, opacity: 0.8 },
  headerLabel:{ color: C.textMute, fontWeight: '800', letterSpacing: 2.2, fontSize: 9.5 },
  headerLink: { color: C.orange, fontSize: 10.5, fontWeight: '700' },

  podiumWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, paddingHorizontal: 4 },
  podSlot:    { flex: 1, alignItems: 'center', marginBottom: 4 },
  crown:      { fontSize: 22, marginBottom: 4, textAlign: 'center' },
  podAvatarBadge:    { position: 'absolute', right: -2, bottom: -2, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.orange, borderWidth: 2, borderColor: C.surface, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  podAvatarBadgeText:{ color: '#fff', fontSize: 10, fontWeight: '800' },
  podName:    { marginTop: 8, color: C.textSub, fontSize: 12.5, fontWeight: '700', maxWidth: 88, textAlign: 'center' },
  podPts:     { marginTop: 2, color: C.textMute, fontSize: 11.5, fontWeight: '600' },
  podBase1:   { marginTop: 10, width: 72, height: 10, borderRadius: 999, backgroundColor: 'rgba(223,168,60,0.20)' },
  podBase2:   { marginTop: 10, width: 62, height: 8,  borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  podBase3:   { marginTop: 10, width: 62, height: 8,  borderRadius: 999, backgroundColor: 'rgba(122,74,40,0.22)' },

  rankSection:      { marginTop: 2 },
  rowDivider:       { height: 1, backgroundColor: C.border },
  rankRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rankRowMe:        { backgroundColor: C.raised, borderRadius: 16, paddingHorizontal: 10 },
  rankNum:          { width: 20, color: C.textMute, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  rankAvatarBox:    { width: 44, height: 44, borderRadius: 14, backgroundColor: C.raised, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', flexShrink: 0 },
  rankAvatarInit:   { color: C.text, fontSize: 17, fontWeight: '800' },
  rankName:         { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  rankUnderline:    { height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  rankUnderlineFill:{ height: '100%', borderRadius: 999, backgroundColor: C.orange },
  mvChip:   { minWidth: 34, alignItems: 'center' },
  mvUp:     { color: C.emerald, fontSize: 11, fontWeight: '800' },
  mvDown:   { color: C.coral,   fontSize: 11, fontWeight: '800' },
  mvNeutral:{ color: C.textMute, fontSize: 11, fontWeight: '700' },
  ptsBox:   { alignItems: 'flex-end', minWidth: 52 },
  rankPts:  { color: C.text, fontSize: 12.5, fontWeight: '800' },
  rankPtsSub:{ color: C.textMute, fontSize: 10 },

  footer:        { marginTop: 16, flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: C.raised, paddingHorizontal: 14, paddingVertical: 14 },
  footerHash:    { color: C.orange, fontSize: 16, fontWeight: '900' },
  footerRankNum: { color: C.text, fontSize: 22, fontWeight: '900', marginLeft: 2, minWidth: 34 },
  footerLabel:   { color: C.text, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  footerBar:     { height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  footerBarFill: { height: '100%', borderRadius: 999, backgroundColor: C.orange },
  footerSub:     { color: C.textMute, fontSize: 10.5, marginTop: 6 },
  footerScore:   { color: C.text, fontSize: 16, fontWeight: '900' },
  footerScoreSub:{ color: C.textMute, fontSize: 10.5 },
})