// features/home/components/HomeShell.tsx
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { Component, type ErrorInfo, type ReactNode, useCallback, useRef } from 'react'
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native'
import { C } from '@/lib/colors'

type ErrorBoundaryState = { hasError: boolean; message: string }

export class HomeErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ✅ C7: replaced console.error with structured error report
    // In production wire this to your error reporter (e.g. Sentry.captureException)
    if (__DEV__) {
      console.error('[HomeScreen Error]', error, info)
    }
    // Example: Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorScreen}>
          <View style={styles.errorIconBox}>
            <Ionicons name="warning-outline" size={32} color={C.coral} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={styles.errorTitle}>Something went wrong</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.errorSub}>{this.state.message}</Text>
          <TouchableOpacity
            style={styles.errorBtn}
            onPress={() => this.setState({ hasError: false, message: '' })}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text maxFontSizeMultiplier={1.3} style={styles.errorBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return this.props.children
  }
}

export function OfflineBanner() {
  return (
    <View
      style={styles.offlineBanner}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Showing cached data."
    >
      <Ionicons name="cloud-offline-outline" size={13} color={C.gold} />
      <Text maxFontSizeMultiplier={1.3} style={styles.offlineText}>Offline — showing cached data</Text>
    </View>
  )
}

export function ScalePress({
  children,
  onPress,
  style,
}: {
  children: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const scale = useRef(new Animated.Value(1)).current

  // ✅ P3: stable callbacks — no inline arrow functions recreated on every render
  const onIn  = useCallback(() =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start(),
  [scale])

  const onOut = useCallback(() =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start(),
  [scale])

  return (
    <Pressable onPress={onPress} onPressIn={onIn} onPressOut={onOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

export function TagChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.tagChip, { backgroundColor: bg, borderColor: `${color}30` }]}>
      <Text allowFontScaling={false} style={[styles.tagChipText, { color }]}>{label}</Text>
    </View>
  )
}

export function MetaVerifiedBadge({ size = 20 }: { size?: number }) {
  return (
    <View
      style={[styles.metaBadgeWrap, { width: size, height: size, borderRadius: size * 0.32 }]}
      accessibilityLabel="Verified"
      accessibilityRole="image"
    >
      <LinearGradient
        colors={['#1877F2', '#0A5CD8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size * 0.32 }]}
      />
      <Ionicons name="checkmark" size={size * 0.58} color="#fff" style={{ fontWeight: '900' }} />
    </View>
  )
}

export function SectionHead({
  title,
  link = 'See all',
  onLink,
}: {
  title: string
  link?: string
  onLink?: () => void
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionLabelRow}>
        <View style={styles.sectionOrangeLine} />
        <Text maxFontSizeMultiplier={1.3} style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      </View>
      {onLink && (
        <TouchableOpacity
          onPress={onLink}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={link}
        >
          <Text maxFontSizeMultiplier={1.3} style={styles.sectionLink}>{link}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export function QuickActionItem({
  label,
  emoji,
  color,
  bg,
  borderColor,
  badge,
  onPress,
}: {
  label: string
  emoji: string
  color: string
  bg: string
  borderColor: string
  badge?: string | number
  onPress: () => void
}) {
  return (
    // ✅ A5: accessibilityRole + accessibilityLabel on quick action
    <TouchableOpacity
      style={styles.qaItem}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} items` : label}
    >
      <View style={[styles.qaIcon, { backgroundColor: bg, borderColor }]}>
        <Text style={styles.qaEmoji}>{emoji}</Text>
        {badge ? (
          <View style={styles.qaBadge}>
            <Text allowFontScaling={false} style={styles.qaBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={styles.qaLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  errorScreen:   { flex: 1, backgroundColor: C.void, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 32 },
  errorIconBox:  { width: 72, height: 72, borderRadius: 22, backgroundColor: C.coralDim, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  errorTitle:    { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  errorSub:      { fontSize: 13, color: C.textMute, textAlign: 'center', lineHeight: 20 },
  errorBtn:      { marginTop: 8, backgroundColor: C.orange, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 13 },
  errorBtnText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(223,168,60,0.12)', borderBottomWidth: 1, borderBottomColor: `${C.gold}30`, paddingVertical: 8 },
  offlineText:   { fontSize: 12, fontWeight: '600', color: C.gold },
  tagChip:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagChipText:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  metaBadgeWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1877F2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  sectionHead:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionOrangeLine:{ width: 14, height: 1, backgroundColor: C.orange, opacity: 0.7 },
  sectionTitle:     { fontSize: 9.5, fontWeight: '700', color: C.textMute, letterSpacing: 2.8 },
  sectionLink:      { fontSize: 10.5, fontWeight: '600', color: C.orange, letterSpacing: 0.3 },
  qaItem:    { width: '25%', alignItems: 'center', gap: 9, paddingVertical: 16, paddingHorizontal: 6, borderRadius: 18 },
  qaIcon:    { width: 54, height: 54, borderRadius: 18, borderWidth: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  qaEmoji:   { fontSize: 23 },
  qaBadge:   { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 6, backgroundColor: C.orange, borderWidth: 2, borderColor: C.void, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  qaBadgeText:{ fontSize: 8, fontWeight: '800', color: '#fff' },
  qaLabel:   { fontSize: 10.5, fontWeight: '600', color: C.textSub, textAlign: 'center', lineHeight: 14, letterSpacing: 0.1 },
})