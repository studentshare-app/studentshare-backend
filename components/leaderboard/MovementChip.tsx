/**
 * components/leaderboard/MovementChip.tsx
 * Displays rank movement: ↑N (green), ↓N (red), or — (muted).
 */

import { StyleSheet, Text } from 'react-native'
import { C } from '../../lib/colors'

type Props = { movement?: number }

export function MovementChip({ movement }: Props) {
  if (movement === undefined || movement === 0) {
    return <Text allowFontScaling={false} style={st.same}>—</Text>
  }
  return (
    <Text allowFontScaling={false} style={movement > 0 ? st.up : st.down}>
      {movement > 0 ? `↑${movement}` : `↓${Math.abs(movement)}`}
    </Text>
  )
}

const st = StyleSheet.create({
  up:   { fontSize: 11, fontWeight: '700', color: C.emerald,  minWidth: 28, textAlign: 'center' },
  down: { fontSize: 11, fontWeight: '700', color: C.coral,    minWidth: 28, textAlign: 'center' },
  same: { fontSize: 11, fontWeight: '700', color: C.textMute, minWidth: 28, textAlign: 'center' },
})