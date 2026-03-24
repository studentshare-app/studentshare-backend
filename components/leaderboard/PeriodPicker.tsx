/**
 * components/leaderboard/PeriodPicker.tsx
 * Horizontal pill selector: Weekly | Monthly | All-time
 * Hidden on the "Weekly Gainers" tab (period is locked to weekly there).
 */

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { C } from '../../lib/colors'
import type { LeaderPeriod } from '../../lib/leaderboard'

const PERIODS: { key: LeaderPeriod; label: string }[] = [
  { key: 'weekly',  label: 'Weekly'   },
  { key: 'monthly', label: 'Monthly'  },
  { key: 'alltime', label: 'All‑time' },
]

type Props = {
  active: LeaderPeriod
  onChange: (p: LeaderPeriod) => void
}

export function PeriodPicker({ active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={st.row}
    >
      {PERIODS.map(p => {
        const isActive = p.key === active
        return (
          <TouchableOpacity
            key={p.key}
            style={[st.pill, isActive && st.pillActive]}
            onPress={() => onChange(p.key)}
            activeOpacity={0.8}
          >
            <Text
              maxFontSizeMultiplier={1.2}
              style={[st.pillText, isActive && st.pillTextActive]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  row:           { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row' },
  pill:          { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent' },
  pillActive:    { backgroundColor: C.orangeDim, borderColor: C.orange + '50' },
  pillText:      { fontSize: 12, fontWeight: '600', color: C.textSub },
  pillTextActive:{ color: C.orange },
})