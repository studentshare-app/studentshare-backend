import React, { useEffect, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeNotice } from '../hooks/useCollegeInfo'

export function NoticeTicker({ notices }: { notices: CollegeNotice[] }) {
  if (!notices || notices.length === 0) return null

  const [idx, setIdx] = useState(0)
  const [fadeAnim] = useState(new Animated.Value(1))
  const [slideAnim] = useState(new Animated.Value(0))

  useEffect(() => {
    if (notices.length <= 1) return
    const t = setInterval(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -6, duration: 300, useNativeDriver: true })
      ]).start(() => {
        setIdx((prev) => (prev + 1) % notices.length)
        slideAnim.setValue(6)
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start()
      })
    }, 4500)
    return () => clearInterval(t)
  }, [notices.length])

  return (
    <View style={ss.tickerWrap}>
      <View style={ss.tickerBadge}>
        <Text style={ss.tickerBadgeText}>NOTICE</Text>
      </View>
      <View style={{ flex: 1, overflow: 'hidden', height: 18, justifyContent: 'center' }}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], position: 'absolute', width: '100%' }}>
          <Text style={ss.tickerText} numberOfLines={1}>
            {notices[idx].message}
          </Text>
        </Animated.View>
      </View>
    </View>
  )
}

const ss = StyleSheet.create({
  tickerWrap: { backgroundColor: C.orange, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tickerBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  tickerBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  tickerText: { fontSize: 12, fontWeight: '500', color: '#fff' },
})
