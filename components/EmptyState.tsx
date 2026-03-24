/**
 * components/EmptyState.tsx
 * Reusable empty state component
 * 
 * Shows when a section has no data, with clear CTA
 * Improves UX by explaining why content is empty
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '../designTokens'

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>['name']
  iconColor?: string
  title: string
  description?: string
  ctaText?: string
  onCTA?: () => void
  size?: 'sm' | 'md' | 'lg'
  style?: any
}

/**
 * Empty State Component
 * Shows a friendly message when no content exists
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  iconColor = COLORS.text.tertiary,
  title,
  description,
  ctaText,
  onCTA,
  size = 'md',
  style,
}) => {
  const iconSize = size === 'sm' ? 32 : size === 'lg' ? 56 : 40
  const containerHeight = size === 'sm' ? 120 : size === 'lg' ? 240 : 180

  return (
    <View
      style={[
        styles.container,
        {
          minHeight: containerHeight,
        },
        style,
      ]}
    >
      {/* Icon */}
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: `${iconColor}15`,
            borderColor: `${iconColor}25`,
          },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={iconColor} />
      </View>

      {/* Title */}
      <Text
        maxFontSizeMultiplier={1.3}
        style={[
          styles.title,
          size === 'sm' && styles.titleSmall,
          size === 'lg' && styles.titleLarge,
        ]}
      >
        {title}
      </Text>

      {/* Description */}
      {description && (
        <Text
          maxFontSizeMultiplier={1.3}
          style={[
            styles.description,
            size === 'sm' && styles.descriptionSmall,
          ]}
        >
          {description}
        </Text>
      )}

      {/* CTA Button */}
      {ctaText && onCTA && (
        <TouchableOpacity
          style={[
            styles.ctaButton,
            size === 'sm' && styles.ctaButtonSmall,
          ]}
          onPress={onCTA}
          activeOpacity={0.8}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={styles.ctaText}
          >
            {ctaText}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={16}
            color="#fff"
            style={{ marginLeft: SPACING.sm }}
          />
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * Empty State Variants for specific sections
 */

export const NoAnnouncementsEmpty: React.FC<{ onPress?: () => void }> = ({
  onPress,
}) => (
  <EmptyState
    icon="megaphone-outline"
    iconColor={COLORS.accent.blue}
    title="No announcements yet"
    description="Check back soon for important updates"
    size="md"
  />
)

export const NoMaterialsEmpty: React.FC<{ onPress?: () => void }> = ({
  onPress,
}) => (
  <EmptyState
    icon="document-text-outline"
    iconColor={COLORS.accent.blue}
    title="No materials yet"
    description="Start by exploring categories or asking the AI"
    ctaText="Browse Categories"
    onCTA={onPress}
    size="md"
  />
)

export const NoDeadlinesEmpty: React.FC<{ onPress?: () => void }> = ({
  onPress,
}) => (
  <EmptyState
    icon="calendar-outline"
    iconColor={COLORS.accent.orange}
    title="No deadlines yet"
    description="Add assignments and exams to stay organized"
    ctaText="Add Deadline"
    onCTA={onPress}
    size="md"
  />
)

export const NoLeaderboardDataEmpty: React.FC = () => (
  <EmptyState
    icon="trophy-outline"
    iconColor={COLORS.accent.yellow}
    title="No leaderboard data"
    description="Participate in activities to see rankings"
    size="md"
  />
)

export const NoCoursesMaterialEmpty: React.FC<{
  courseName: string
  onPress?: () => void
}> = ({ courseName, onPress }) => (
  <EmptyState
    icon="folder-outline"
    iconColor={COLORS.accent.purple}
    title={`No materials in ${courseName}`}
    description="Materials will appear here as your teacher uploads them"
    size="sm"
  />
)

export const NoSearchResultsEmpty: React.FC<{
  query: string
  onPress?: () => void
}> = ({ query, onPress }) => (
  <EmptyState
    icon="search-outline"
    iconColor={COLORS.text.tertiary}
    title={`No results for "${query}"`}
    description="Try searching with different keywords"
    ctaText="Clear Search"
    onCTA={onPress}
    size="md"
  />
)

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background.tertiary,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },

  iconBox: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  title: {
    ...TYPOGRAPHY.body.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },

  titleSmall: {
    ...TYPOGRAPHY.body.sm,
    fontWeight: '600',
  },

  titleLarge: {
    ...TYPOGRAPHY.heading.sm,
    fontWeight: '700',
  },

  description: {
    ...TYPOGRAPHY.body.sm,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },

  descriptionSmall: {
    ...TYPOGRAPHY.caption.lg,
    color: COLORS.text.tertiary,
  },

  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
  },

  ctaButtonSmall: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },

  ctaText: {
    ...TYPOGRAPHY.label.md,
    color: '#fff',
    fontWeight: '600',
  },
})