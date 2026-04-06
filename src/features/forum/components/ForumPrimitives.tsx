import React, { useRef } from 'react'
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// Local tokens (subset)
const T = {
  bg: '#07080c', bg2: '#0e0f14', bg3: '#16171e',
  border: 'rgba(236,91,19,0.12)', border2: 'rgba(236,91,19,0.20)',
  text: '#f0ede8', muted: '#5e5b56', muted2: '#b0ada8',
  accent: '#ec5b13', accentDim: 'rgba(236,91,19,0.14)',
  gold: '#d4a843', green: '#2ecc7a', red: '#e8445a'
} as const

export function fmt(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n) }

export function Avi({ initials, grad, size = 40, uri, verified = false }: { initials: string; grad: readonly [string, string]; size?: number; uri?: string | null; verified?: boolean }) {
  return (
    <View style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <LinearGradient colors={grad as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, position: 'absolute' }} /> : <Text style={{ fontSize: size * 0.34, fontWeight: '800', color: '#fff' }}>{initials}</Text>}
      </LinearGradient>
      {verified && (
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: T.accent, borderWidth: 2, borderColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>✓</Text>
        </View>
      )}
    </View>
  )
}

export function RichText({ text, style, onHashtag }: { text: string; style?: any; onHashtag?: (tag: string) => void }) {
  const parts = text.split(/(#\w+|@\w+)/g)
  return (
    <Text style={[pr.postText, style]}>
      {parts.map((p, i) => {
        if (p.startsWith('#')) return <Text key={i} style={{ color: T.accent, fontWeight: '600' }} onPress={() => onHashtag?.(p)}>{p}</Text>
        if (p.startsWith('@')) return <Text key={i} style={{ color: T.accent, fontWeight: '600' }}>{p}</Text>
        return p
      })}
    </Text>
  )
}

type AV = 'reply' | 'repost' | 'like' | 'bookmark' | 'share'
export const AC: Record<AV, string> = { reply: T.accent, repost: T.green, like: T.red, bookmark: T.gold, share: T.accent }

export function ActionBtn({ variant, icon, activeIcon, label, active, onPress }: { variant: AV; icon: string; activeIcon?: string; label?: string | number; active?: boolean; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current
  const col = active ? AC[variant] : T.muted
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start()
    onPress?.()
  }
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={pr.action}>
      <Animated.Text style={[pr.actionIcon, { color: col, transform: [{ scale }] }]}>{active && activeIcon ? activeIcon : icon}</Animated.Text>
      {label !== undefined && Number(label) > 0 && <Text style={[pr.actionCount, { color: col }]}>{fmt(Number(label))}</Text>}
    </TouchableOpacity>
  )
}

type PollOpt = { label: string; pct: number; winning?: boolean }
export function Poll({ options, meta, onVote }: { options: PollOpt[]; meta?: string; onVote: (i: number) => void }) {
  return (
    <View style={pr.poll}>
      {options.map((opt, i) => (
        <TouchableOpacity key={i} onPress={() => onVote(i)} activeOpacity={0.85} style={[pr.pollOption, opt.winning && { borderColor: T.accent }]}>
          <View style={[pr.pollBar, { width: `${opt.pct}%` as any, backgroundColor: opt.winning ? T.accent : 'rgba(255,255,255,0.04)' }]} />
          <Text style={pr.pollLabel}>{opt.label}</Text>
          <Text style={pr.pollPct}>{opt.pct}%</Text>
        </TouchableOpacity>
      ))}
      {meta && <Text style={pr.pollMeta}>{meta}</Text>}
    </View>
  )
}

type Quote = { name: string; handle: string; avatarGrad: [string, string]; text: string }
export function QuoteBox({ q }: { q: Quote }) {
  return (
    <View style={pr.quoteBox}>
      <View style={pr.quoteHeader}>
        <LinearGradient colors={q.avatarGrad as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pr.quoteAvi}>
          <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{q.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</Text>
        </LinearGradient>
        <Text style={pr.quoteName}>{q.name}</Text>
        <Text style={pr.quoteHandle}>{q.handle}</Text>
      </View>
      <Text style={pr.quoteText} numberOfLines={3}>{q.text}</Text>
    </View>
  )
}

const pr = StyleSheet.create({
  postText: { fontSize: 15, lineHeight: 24, color: T.text },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 50 },
  actionIcon: { fontSize: 17 },
  actionCount: { fontSize: 13, fontWeight: '600' },
  poll: { marginBottom: 10, gap: 7 },
  pollOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: T.border2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, overflow: 'hidden', position: 'relative' },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 10 },
  pollLabel: { fontSize: 14, fontWeight: '500', color: T.text, flex: 1, zIndex: 1 },
  pollPct: { fontSize: 14, fontWeight: '700', color: T.accent, zIndex: 1 },
  pollMeta: { fontSize: 13, color: T.muted },
  quoteBox: { borderWidth: 1, borderColor: T.border2, borderRadius: 14, padding: 13, marginBottom: 10 },
  quoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  quoteAvi: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  quoteName: { fontSize: 13, fontWeight: '700', color: T.text },
  quoteHandle: { fontSize: 13, color: T.muted },
  quoteText: { fontSize: 14, color: T.muted2, lineHeight: 20 },
})
