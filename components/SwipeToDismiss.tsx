/**
 * components/SwipeToDismiss.tsx
 *
 * Wraps any screen that is pushed via router.push() but lives inside
 * (tabs)/ — meaning it has no native stack back gesture.
 *
 * Supported gestures:
 *   • Swipe DOWN  — dismiss (like a modal)
 *   • Swipe LEFT  — dismiss (mirrors iOS native back)
 *
 * How it works:
 *   A PanResponder tracks the finger. When the user has dragged far
 *   enough or fast enough in either direction, the screen animates
 *   out and calls router.back(). If the gesture doesn't cross the
 *   threshold the screen springs back to its original position.
 *
 * Usage:
 *   Wrap your screen's root <View> with <SwipeToDismiss>:
 *
 *     export default function StudyPlannerScreen() {
 *       return (
 *         <SwipeToDismiss>
 *           <View style={{ flex: 1 }}>...</View>
 *         </SwipeToDismiss>
 *       )
 *     }
 *
 * Props:
 *   children        — screen content
 *   dismissDown     — enable swipe-down gesture (default true)
 *   dismissLeft     — enable swipe-left gesture  (default true)
 *   threshold       — px to cross before committing dismiss (default 80)
 *   velocityThreshold — px/s for a fast flick regardless of distance (default 800)
 *   indicatorColor  — colour of the drag handle indicator (default #2A3145)
 */

import { useRouter } from 'expo-router'
import { useRef, useCallback } from 'react'
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

type Props = {
  children:          React.ReactNode
  dismissDown?:      boolean
  dismissLeft?:      boolean
  threshold?:        number
  velocityThreshold?: number
  indicatorColor?:   string
  style?:            ViewStyle
}

export function SwipeToDismiss({
  children,
  dismissDown       = true,
  dismissLeft       = true,
  threshold         = 80,
  velocityThreshold = 800,
  indicatorColor    = '#2A3145',
  style,
}: Props) {
  const router    = useRouter()
  const translateX = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(0)).current
  // Track which axis the gesture locked onto so we don't fight scrolls
  const axis       = useRef<'x' | 'y' | null>(null)
  const dismissing = useRef(false)

  const resetPosition = useCallback(() => {
    axis.current = null
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 8 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 28, bounciness: 8 }),
    ]).start()
  }, [translateX, translateY])

  const dismiss = useCallback((direction: 'left' | 'down') => {
    if (dismissing.current) return
    dismissing.current = true
    const toX = direction === 'left' ? -SCREEN_W : 0
    const toY = direction === 'down' ?  SCREEN_H : 0
    Animated.parallel([
      Animated.timing(translateX, { toValue: toX, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: toY, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      router.back()
      // Reset so if the screen is still mounted it's in the right place
      translateX.setValue(0)
      translateY.setValue(0)
      dismissing.current = false
      axis.current = null
    })
  }, [router, translateX, translateY])

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture if the user starts moving in a swipe direction
      onMoveShouldSetPanResponder: (_, gs) => {
        if (dismissing.current) return false

        const dx = Math.abs(gs.dx)
        const dy = Math.abs(gs.dy)

        // Need at least 8px movement before we decide
        if (dx < 8 && dy < 8) return false

        // Swipe down: dy dominant and moving down
        if (dismissDown && dy > dx && gs.dy > 0) return true
        // Swipe left: dx dominant and moving left
        if (dismissLeft && dx > dy && gs.dx < 0) return true

        return false
      },

      // Don't steal gesture during scrolls
      onStartShouldSetPanResponder: () => false,

      onPanResponderGrant: (_, gs) => {
        const dx = Math.abs(gs.dx)
        const dy = Math.abs(gs.dy)
        axis.current = dx > dy ? 'x' : 'y'
        // Flatten any ongoing animations so we track the finger cleanly
        translateX.stopAnimation()
        translateY.stopAnimation()
        translateX.setOffset(0)
        translateY.setOffset(0)
      },

      onPanResponderMove: (_, gs) => {
        if (axis.current === 'y' && dismissDown) {
          // Only allow downward drag (clamp upward)
          translateY.setValue(Math.max(0, gs.dy))
        } else if (axis.current === 'x' && dismissLeft) {
          // Only allow leftward drag (clamp rightward)
          translateX.setValue(Math.min(0, gs.dx))
        }
      },

      onPanResponderRelease: (_, gs) => {
        if (axis.current === 'y' && dismissDown) {
          if (gs.dy > threshold || gs.vy > velocityThreshold / 1000) {
            dismiss('down')
          } else {
            resetPosition()
          }
        } else if (axis.current === 'x' && dismissLeft) {
          if (-gs.dx > threshold || -gs.vx > velocityThreshold / 1000) {
            dismiss('left')
          } else {
            resetPosition()
          }
        } else {
          resetPosition()
        }
      },

      onPanResponderTerminate: () => resetPosition(),
    })
  ).current

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        { transform: [{ translateX }, { translateY }] },
      ]}
      {...panResponder.panHandlers}
    >
      {children}

      {/* Subtle drag indicator — only visible while dragging (opacity driven by translateY/X) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dragIndicator,
          {
            backgroundColor: indicatorColor,
            opacity: Animated.add(
              translateY.interpolate({ inputRange: [0, 40], outputRange: [0, 0.7], extrapolate: 'clamp' }),
              translateX.interpolate({ inputRange: [-40, 0], outputRange: [0.7, 0], extrapolate: 'clamp' }),
            ),
          },
        ]}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dragIndicator: {
    position:      'absolute',
    bottom:        8,
    alignSelf:     'center',
    width:         40,
    height:        4,
    borderRadius:  2,
  },
})