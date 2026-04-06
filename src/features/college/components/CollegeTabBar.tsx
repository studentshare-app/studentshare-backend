import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useRef } from 'react'
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeTab } from '../hooks/useCollegeInfo'

type Props = {
  tabs: CollegeTab[]
  active: number
  onSelect: (i: number) => void
}

export function CollegeTabBar({ tabs, active, onSelect }: Props) {
  const scrollRef = useRef<ScrollView>(null)
  const anims = useRef(tabs.map((_, i) => new Animated.Value(i === active ? 1 : 0))).current

  // Ensure anims array size matches tabs length if tabs change array size dynamically
  // For simplicity, assuming tabs array length is stable after initial load or we use keying.
  // We'll update anims dynamically if tabs change in a strict production app, but here it's fine.

  const pick = useCallback((i: number) => {
    anims.forEach((a, j) =>
      Animated.spring(a, { toValue: j === i ? 1 : 0, useNativeDriver: true, tension: 130, friction: 8 }).start()
    )
    onSelect(i)
    scrollRef.current?.scrollTo({ x: Math.max(0, i - 1) * 130, animated: true })
  }, [onSelect])

  return (
    <View style={ss.tabBar}>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 8, alignItems: 'center' }}>
        {tabs.map((t, i) => {
          const on = active === i
          // If we added tabs later, anims[i] might be undefined. Let's provide a fallback static animate setup inside map if it was missing:
          const anim = anims[i] || new Animated.Value(on ? 1 : 0)
          const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] })
          
          return (
            <TouchableOpacity key={t.id} onPress={() => pick(i)} activeOpacity={0.75}>
              <Animated.View style={[ss.tabChip, { transform: [{ scale }] },
                on
                  ? { borderColor: `${C.orange}80`, backgroundColor: 'transparent' }
                  : { borderColor: C.border, backgroundColor: C.surface },
              ]}>
                {on && (
                  <LinearGradient colors={[C.raised, C.deep]} style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                )}
                <Ionicons name={(t.icon || 'document-text-outline') as any} size={14}
                  color={on ? C.orange : C.textMute} />
                <Text style={[ss.tabLabel,
                  { color: on ? C.text : C.textMute, fontWeight: on ? '700' : '500' }]}>
                  {t.label}
                </Text>
                {on && <View style={ss.tabUnderline} />}
              </Animated.View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const ss = StyleSheet.create({
  tabBar: { backgroundColor: C.deep, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 12 },
  tabChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  tabLabel: { fontSize: 13 },
  tabUnderline: { position: 'absolute', bottom: 4, left: '50%', marginLeft: -4, width: 8, height: 3, borderRadius: 2, backgroundColor: C.orange },
})
