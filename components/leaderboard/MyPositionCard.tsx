/**
 * components/leaderboard/MyPositionCard.tsx
 * Orange gradient hero card showing:
 *   - Current rank + percentile
 *   - Progress bar towards next rank
 *   - Total score
 *   - Optional "Share Rank" button
 */

import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C } from '../../lib/colors'

type Props = {
  rank: number
  totalRanked: number
  score: number
  nextRankScore?: number
  scopeLabel: string          // e.g. "College Rank" | "Global Rank" | "Campus Rank"
  userName?: string
  showShare?: boolean
}

export function MyPositionCard({
  rank,
  totalRanked,
  score,
  nextRankScore,
  scopeLabel,
  userName,
  showShare = true,
}: Props) {
  const topPct    = totalRanked > 0
    ? Math.max(1, Math.round(((totalRanked - rank + 1) / totalRanked) * 100))
    : 0
  const ptsToNext = nextRankScore && nextRankScore > score ? nextRankScore - score : 0
  const fillPct   = nextRankScore && nextRankScore > 0
    ? Math.min((score / nextRankScore) * 100, 99)
    : 99

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I'm ranked #${rank} on StudentShare with ${score.toLocaleString()} pts! Top ${topPct}% of all students 🎓`,
      })
    } catch {
      Alert.alert('Share', `Rank #${rank} · ${score.toLocaleString()} pts · Top ${topPct}%`)
    }
  }

  return (
    <LinearGradient
      colors={['#E8692A', '#C44E14']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={st.card}
    >
      {/* Decorative orbs */}
      <View style={st.orbTR} />
      <View style={st.orbBL} />

      <View style={st.inner}>
        {/* Left: status badge + rank + subtitle */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={st.statusBadge}>
            <Text allowFontScaling={false} style={st.statusText}>Current Status</Text>
          </View>
          <Text maxFontSizeMultiplier={1.2} style={st.rankText}>Top {topPct}%</Text>
          <Text maxFontSizeMultiplier={1.2} style={st.subText}>
            Rank #{rank} of {totalRanked.toLocaleString()} students
          </Text>

          {/* Progress bar */}
          {ptsToNext > 0 ? (
            <View style={{ marginTop: 10, gap: 5 }}>
              <View style={st.progressTrack}>
                <View style={[st.progressFill, { width: `${fillPct}%` as any }]} />
              </View>
              <Text allowFontScaling={false} style={st.progressLabel}>
                {ptsToNext.toLocaleString()} pts to #{rank - 1}
              </Text>
            </View>
          ) : (
            <Text allowFontScaling={false} style={[st.progressLabel, { marginTop: 6 }]}>
              🏆 You're at the top! Keep going.
            </Text>
          )}
        </View>

        {/* Right: score + share */}
        <View style={{ alignItems: 'flex-end', gap: 8, flexShrink: 0, marginLeft: 16 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text maxFontSizeMultiplier={1.2} style={st.scoreText}>
              {score.toLocaleString()}
            </Text>
            <Text allowFontScaling={false} style={st.scoreSub}>total pts</Text>
          </View>
          {showShare && (
            <TouchableOpacity style={st.shareBtn} onPress={handleShare} activeOpacity={0.85}>
              <Text allowFontScaling={false} style={st.shareBtnText}>Share Rank</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  )
}

const st = StyleSheet.create({
  card:         { borderRadius: 20, marginHorizontal: 16, marginBottom: 6, overflow: 'hidden', padding: 20 },
  orbTR:        { position: 'absolute', top: -32, right: -32, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbBL:        { position: 'absolute', bottom: -24, left: -24, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.10)' },
  inner:        { flexDirection: 'row', alignItems: 'center' },
  statusBadge:  { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  statusText:   { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  rankText:     { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5, lineHeight: 34 },
  subText:      { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  progressTrack:{ height: 5, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden', width: 140 },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  progressLabel:{ fontSize: 10.5, color: 'rgba(255,255,255,0.80)', fontWeight: '600' },
  scoreText:    { fontSize: 26, fontWeight: '900', color: '#fff', lineHeight: 28 },
  scoreSub:     { fontSize: 10.5, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  shareBtn:     { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  shareBtnText: { fontSize: 12, fontWeight: '800', color: C.orange },
})