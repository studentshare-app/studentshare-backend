import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { C } from '@/lib/colors'
import { CollegeNotice } from '../hooks/useCollegeInfo'

export function NoticeTicker({ notices }: { notices: CollegeNotice[] }) {
  const [containerWidth, setContainerWidth] = useState(0)
  const [textWidth, setTextWidth] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current

  const fullText = notices.map(n => n.message).join('    •    ')

  useEffect(() => {
    if (!notices || notices.length === 0 || !containerWidth || !textWidth) return

    // Speed: 50 pixels per second
    const duration = (textWidth + containerWidth) * 20

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scrollX, {
          toValue: -textWidth,
          duration: duration,
          useNativeDriver: true,
          easing: (t) => t, // Linear
        }),
        Animated.timing(scrollX, {
          toValue: containerWidth,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    )

    anim.start()
    return () => anim.stop()
  }, [notices.length, containerWidth, textWidth])

  if (!notices || notices.length === 0) return null

  return (
    <View style={ss.tickerWrap} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      <View style={ss.tickerBadge}>
        <Text style={ss.tickerBadgeText}>NOTICE</Text>
      </View>
      <View style={{ flex: 1, overflow: 'hidden', height: 20, justifyContent: 'center' }}>
        <Animated.View
          style={{
            flexDirection: 'row',
            transform: [{ translateX: scrollX }],
          }}
          onLayout={e => setTextWidth(e.nativeEvent.layout.width)}
        >
          <Text style={ss.tickerText} numberOfLines={1}>
            {fullText}
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
