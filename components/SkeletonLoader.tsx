/**
 * components/SkeletonLoader.tsx
 * Reusable skeleton loading component with shimmer animation
 * 
 * Shows a placeholder while content is loading to improve
 * perceived performance (WCAG 2.1 compliance)
 */

import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { COLORS, SPACING, BORDER_RADIUS, ANIMATIONS } from '../designTokens'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: number
  marginBottom?: number
  style?: any
}

interface SkeletonRowProps {
  width?: number | string
  height?: number
  count?: number
  gap?: number
  marginBottom?: number
}

/**
 * Single Skeleton Placeholder
 * Animated shimmer effect
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = BORDER_RADIUS.sm,
  marginBottom = SPACING.md,
  style,
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const startShimmer = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: ANIMATIONS.slow,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: ANIMATIONS.slow,
            useNativeDriver: true,
          }),
        ])
      ).start()
    }
    startShimmer()
    return () => shimmerAnim.setValue(0)
  }, [shimmerAnim])

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          marginBottom,
          opacity: shimmerAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.5, 0.8],
          }),
        },
        style,
      ]}
    />
  )
}

/**
 * Skeleton Row - Multiple lines of text
 */
export const SkeletonRow: React.FC<SkeletonRowProps> = ({
  width = '100%',
  height = 12,
  count = 2,
  gap = SPACING.sm,
  marginBottom = SPACING.lg,
}) => {
  return (
    <View style={{ marginBottom }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          width={width}
          height={height}
          marginBottom={i < count - 1 ? gap : 0}
        />
      ))}
    </View>
  )
}

/**
 * Card Skeleton - Simulates a card layout
 */
export const SkeletonCard: React.FC<{
  height?: number
  marginBottom?: number
}> = ({ height = 120, marginBottom = SPACING.lg }) => {
  return (
    <View
      style={[
        styles.card,
        {
          height,
          marginBottom,
        },
      ]}
    >
      {/* Avatar/Icon area */}
      <Skeleton
        width={48}
        height={48}
        borderRadius={BORDER_RADIUS.md}
        marginBottom={SPACING.md}
      />

      {/* Text area */}
      <View style={{ flex: 1 }}>
        <Skeleton width="80%" height={14} marginBottom={SPACING.sm} />
        <Skeleton width="60%" height={12} marginBottom={0} />
      </View>
    </View>
  )
}

/**
 * Dashboard Skeleton - Hero section + multiple cards
 */
export const DashboardSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Hero section */}
      <View style={styles.heroSection}>
        <View style={styles.heroTop}>
          <View style={styles.heroLeft}>
            <Skeleton width={200} height={34} marginBottom={SPACING.md} />
            <Skeleton width={150} height={12} marginBottom={0} />
          </View>
          <Skeleton
            width={58}
            height={58}
            borderRadius={BORDER_RADIUS.lg}
            marginBottom={0}
          />
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Skeleton
              width="60%"
              height={20}
              marginBottom={SPACING.sm}
            />
            <Skeleton width="80%" height={12} marginBottom={0} />
          </View>
        ))}
      </View>

      {/* Section skeletons */}
      <View style={styles.sections}>
        {/* Announcements */}
        <View style={styles.section}>
          <Skeleton width="40%" height={18} marginBottom={SPACING.lg} />
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} height={100} marginBottom={SPACING.md} />
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Skeleton width="40%" height={18} marginBottom={SPACING.lg} />
          <View style={styles.quickActionsGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ flex: 1 }}>
                <Skeleton
                  width="100%"
                  height={88}
                  borderRadius={BORDER_RADIUS.lg}
                  marginBottom={0}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Materials */}
        <View style={styles.section}>
          <Skeleton width="40%" height={18} marginBottom={SPACING.lg} />
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} height={80} marginBottom={SPACING.md} />
          ))}
        </View>
      </View>
    </View>
  )
}

/**
 * Leaderboard Skeleton
 */
export const LeaderboardSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      {/* Header */}
      <Skeleton width="60%" height={24} marginBottom={SPACING.lg} />

      {/* Podium skeletons */}
      <View style={styles.podiumSkeletons}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            <Skeleton width={56} height={56} borderRadius={28} marginBottom={SPACING.md} />
            <Skeleton width="70%" height={12} marginBottom={SPACING.sm} />
            <Skeleton width="60%" height={10} marginBottom={0} />
          </View>
        ))}
      </View>

      {/* Rank list */}
      <View style={{ marginTop: SPACING.xl }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.rankSkeleton}>
            <Skeleton width={24} height={16} marginBottom={0} />
            <Skeleton width={40} height={40} borderRadius={12} marginBottom={0} />
            <Skeleton width="40%" height={12} marginBottom={0} />
            <Skeleton width={60} height={12} marginBottom={0} />
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.background.elevated,
    borderRadius: BORDER_RADIUS.sm,
  },

  card: {
    backgroundColor: COLORS.background.tertiary,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    padding: SPACING.lg,
  },

  heroSection: {
    marginBottom: SPACING.xl,
  },

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },

  heroLeft: {
    flex: 1,
  },

  statsStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.background.tertiary,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    gap: SPACING.lg,
  },

  sections: {
    gap: SPACING.xl,
  },

  section: {
    marginBottom: SPACING.xl,
  },

  quickActionsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },

  podiumSkeletons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.xl,
  },

  rankSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
})
