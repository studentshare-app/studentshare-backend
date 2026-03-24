/**
 * app/(auth)/_components/AuthBackground.tsx
 *
 * Shared decorative background used by all auth screens:
 *   - Two gradient blobs
 *   - WiFi / signal arc decorations
 *   - Dot grid (single <View> with pre-computed children — avoids
 *     re-generating 48 Views on every render via Array.from)
 *
 * Previously copy-pasted into login, forgot-password, reset-password.
 */

import React, { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { C } from '../constants/colors'

// ── Signal arcs (WiFi icon shape) ────────────────────────────
export const SignalArcs = memo(function SignalArcs({
  size    = 48,
  color   = C.sky,
  opacity = 0.4,
}: {
  size?:    number
  color?:   string
  opacity?: number
}) {
  const s = size
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Centre dot */}
      <View style={{
        width: s * 0.12, height: s * 0.12, borderRadius: 99,
        backgroundColor: color, opacity, marginBottom: 3,
      }} />
      {/* Inner arc */}
      <View style={{
        position: 'absolute', bottom: s * 0.14,
        width: s * 0.38, height: s * 0.38, borderRadius: 99,
        borderWidth: s * 0.055, borderColor: color,
        borderBottomColor: 'transparent',
        borderLeftColor:   'transparent',
        borderRightColor:  'transparent',
        opacity,
      }} />
      {/* Mid arc */}
      <View style={{
        position: 'absolute', bottom: s * 0.14,
        width: s * 0.65, height: s * 0.65, borderRadius: 99,
        borderWidth: s * 0.045, borderColor: color,
        borderBottomColor: 'transparent',
        borderLeftColor:   'transparent',
        borderRightColor:  'transparent',
        opacity: opacity * 0.65,
      }} />
      {/* Outer arc */}
      <View style={{
        position: 'absolute', bottom: s * 0.14,
        width: s * 0.92, height: s * 0.92, borderRadius: 99,
        borderWidth: s * 0.038, borderColor: color,
        borderBottomColor: 'transparent',
        borderLeftColor:   'transparent',
        borderRightColor:  'transparent',
        opacity: opacity * 0.35,
      }} />
    </View>
  )
})

// ── Pre-computed dot positions (48 dots, never changes) ───────
// Building these outside the component avoids re-creating 48
// position objects on every render cycle.
const DOT_POSITIONS = Array.from({ length: 8 }, (_, row) =>
  Array.from({ length: 6 }, (_, col) => ({
    key: `${row}-${col}`,
    top:  row * 90 + 60,
    left: col * 70 + 20,
  }))
).flat()

// ── Full background assembly ──────────────────────────────────
export const AuthBackground = memo(function AuthBackground() {
  return (
    <>
      {/* Gradient blobs */}
      <View style={s.bgLayer1} />
      <View style={s.bgLayer2} />

      {/* Top-right decorative arcs */}
      <View style={s.arcTopRight} pointerEvents="none">
        <SignalArcs size={130} color={C.sky} opacity={1} />
      </View>

      {/* Bottom-left decorative arcs (flipped) */}
      <View style={s.arcBottomLeft} pointerEvents="none">
        <SignalArcs size={100} color={C.navy} opacity={1} />
      </View>

      {/* Dot grid */}
      <View style={s.dotGrid} pointerEvents="none">
        {DOT_POSITIONS.map(({ key, top, left }) => (
          <View key={key} style={[s.dot, { top, left, opacity: 0.04 }]} />
        ))}
      </View>
    </>
  )
})

const s = StyleSheet.create({
  bgLayer1: {
    position: 'absolute', top: -120, right: -120,
    width: 420, height: 420, borderRadius: 210,
    backgroundColor: C.navy, opacity: 0.25,
  },
  bgLayer2: {
    position: 'absolute', bottom: -80, left: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: C.blue, opacity: 0.12,
  },
  arcTopRight: {
    position: 'absolute', top: 60, right: -10, opacity: 0.3,
  },
  arcBottomLeft: {
    position: 'absolute', bottom: 80, left: -18, opacity: 0.2,
    transform: [{ rotate: '180deg' }],
  },
  dotGrid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dot:     { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: C.sky },
})