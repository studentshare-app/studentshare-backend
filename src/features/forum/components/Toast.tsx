import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'

const T = {
  bg3: '#16171e',
  border2: 'rgba(236,91,19,0.20)',
  text: '#f0ede8',
} as const

export function Toast({ message, visible }: { message: string; visible: boolean }) {
  const y = useRef(new Animated.Value(100)).current
  const opa = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(y, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(opa, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(y, { toValue: 100, duration: 240, useNativeDriver: true }),
        Animated.timing(opa, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start()
    }
  }, [opa, visible, y])

  return (
    <Animated.View pointerEvents="none" style={[styles.box, { transform: [{ translateY: y }], opacity: opa }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 26,
    backgroundColor: T.bg3,
    borderWidth: 1,
    borderColor: T.border2,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  text: { color: T.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
})
