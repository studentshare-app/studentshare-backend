/**
 * components/leaderboard/MyPositionCard.tsx
 * Orange gradient hero card showing:
 *   - Current rank + percentile
 *   - Progress bar towards next rank
 *   - Total score
 *   - Optional "Share Rank" button
 */

import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { C } from '../../src/lib/colors'

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
    ? Math.max(1, Math.round((rank / totalRanked) * 100))
    : 0
  const ptsToNext = nextRankScore && nextRankScore > score ? nextRankScore - score : 0
  const fillPct   = nextRankScore && nextRankScore > 0
    ? Math.min((score / nextRankScore) * 100, 100)
    : 100

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I'm ranked #${rank} on StudentSquare with ${score.toLocaleString()} pts! Top ${topPct}% 🎓\nJoin me on StudentSquare!`,
      })
    } catch {
      Alert.alert('Share', `Rank #${rank} · ${score.toLocaleString()} pts · Top ${topPct}%`)
    }
  }

  return (
    <LinearGradient
      colors={['#FF8C00', '#FF4500']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={st.card}
    >
      {/* Decorative elements */}
      <View style={st.orb1} />
      <View style={st.orb2} />

      <View style={st.header}>
        <View style={st.badge}>
          <Text allowFontScaling={false} style={st.badgeText}>YOUR STATUS</Text>
        </View>
        <Text maxFontSizeMultiplier={1.2} style={st.scopeText}>{scopeLabel}</Text>
      </View>

      <View style={st.mainRow}>
        <View style={st.leftCol}>
          <View style={st.rankRow}>
            <Text maxFontSizeMultiplier={1.2} style={st.rankValue}>#{rank}</Text>
            <View style={st.percentileBox}>
              <Text allowFontScaling={false} style={st.percentileText}>TOP {topPct}%</Text>
            </View>
          </View>
          <Text maxFontSizeMultiplier={1.2} style={st.studentCount}>
            of {totalRanked.toLocaleString()} students
          </Text>
        </View>

        <View style={st.rightCol}>
          <Text maxFontSizeMultiplier={1.2} style={st.scoreValue}>{score.toLocaleString()}</Text>
          <Text allowFontScaling={false} style={st.scoreLabel}>PTS EARNED</Text>
        </View>
      </View>

      {/* Progress Section */}
      <View style={st.progressSection}>
        <View style={st.track}>
          <View style={[st.fill, { width: `${fillPct}%` as any }]} />
        </View>
        <View style={st.progressInfo}>
          {ptsToNext > 0 ? (
            <Text allowFontScaling={false} style={st.progressText}>
              <Text style={{ fontWeight: '900' }}>{ptsToNext.toLocaleString()}</Text> more to reach #{rank - 1}
            </Text>
          ) : (
            <Text allowFontScaling={false} style={st.progressText}>🏆 Highest rank achieved!</Text>
          )}
          {showShare && (
            <TouchableOpacity style={st.shareMini} onPress={handleShare}>
              <Ionicons name="share-outline" size={14} color="#FFF" />
              <Text style={st.shareText}>SHARE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  )
}

const st = StyleSheet.create({
  card:         { 
    borderRadius: 24, 
    marginHorizontal: 16, 
    marginBottom: 8, 
    overflow: 'hidden', 
    padding: 24,
    shadowColor: '#FF4500',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  orb1:         { position: 'absolute', top: -40, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.1)' },
  orb2:         { position: 'absolute', bottom: -50, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.05)' },
  
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  badge:        { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText:    { fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  scopeText:    { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },

  mainRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  leftCol:      { gap: 2 },
  rankRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankValue:    { fontSize: 40, fontWeight: '900', color: '#FFF', letterSpacing: -1 },
  percentileBox:{ backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  percentileText:{ fontSize: 11, fontWeight: '900', color: '#FF4500' },
  studentCount: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

  rightCol:     { alignItems: 'flex-end' },
  scoreValue:   { fontSize: 32, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
  scoreLabel:   { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', marginTop: -2 },

  progressSection: { gap: 10 },
  track:        { height: 8, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 4, overflow: 'hidden' },
  fill:         { height: '100%', backgroundColor: '#FFF', borderRadius: 4 },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  shareMini:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  shareText:    { fontSize: 10, fontWeight: '900', color: '#FFF' },
})
