/**
 * components/leaderboard/MovementChip.tsx
 * Displays rank movement: ↑N (green), ↓N (red), or — (muted).
 */

import { StyleSheet, Text, View } from 'react-native'
import { C } from '../../src/lib/colors'

type Props = { movement?: number }

export function MovementChip({ movement }: Props) {
  if (movement === undefined || movement === 0) {
    return (
      <View style={[st.chip, st.chipSame]}>
        <Text allowFontScaling={false} style={st.textSame}>—</Text>
      </View>
    )
  }
  
  const isUp = movement > 0
  return (
    <View style={[st.chip, isUp ? st.chipUp : st.chipDown]}>
      <Text allowFontScaling={false} style={isUp ? st.textUp : st.textDown}>
        {isUp ? '↑' : '↓'}{Math.abs(movement)}
      </Text>
    </View>
  )
}

const st = StyleSheet.create({
  chip:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, minWidth: 28, alignItems: 'center' },
  chipUp:   { backgroundColor: C.emerald + '15' },
  chipDown: { backgroundColor: C.coral + '15' },
  chipSame: { backgroundColor: C.raised },
  textUp:   { fontSize: 10, fontWeight: '800', color: C.emerald },
  textDown: { fontSize: 10, fontWeight: '800', color: C.coral },
  textSame: { fontSize: 10, fontWeight: '800', color: C.textMute },
})
