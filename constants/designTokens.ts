/**
 * designTokens.ts
 * Centralized design system tokens
 * 
 * This file defines all design tokens used throughout the app:
 * - Colors
 * - Typography
 * - Spacing
 * - Border radius
 * - Shadows
 * - Breakpoints
 * - Animations
 */

// ═══════════════════════════════════════════════════════════════════════════
// COLOR SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export const COLORS = {
  // Semantic Colors
  primary: '#5B8DEF',      // sapphire - primary actions, links
  secondary: '#A78BFA',    // lavender - secondary actions
  success: '#44D4A0',      // emerald - success states
  error: '#FF7B7B',        // coral - errors, destructive
  warning: '#FBBD34',      // amber - warnings
  info: '#38BDF8',         // sky - informational

  // Backgrounds
  background: {
    primary: '#08090C',    // void - main background
    secondary: '#0C0E14',  // deep - secondary background
    tertiary: '#111318',   // surface - cards, containers
    elevated: '#161A22',   // raised - elevated elements
  },

  // Text Colors
  text: {
    primary: '#EEF0F6',    // main text
    secondary: '#8B93A8',  // secondary text
    tertiary: '#4A5168',   // muted text
    disabled: '#2A3145',   // disabled text
  },

  // Borders
  border: {
    default: '#1E2330',    // standard border
    light: '#2A3145',      // lighter border
  },

  // Status Colors
  status: {
    online: '#44D4A0',
    away: '#FBBD34',
    offline: '#4A5168',
    premium: '#F0C060',    // gold
  },

  // Accent Colors (for specific UI elements)
  accent: {
    blue: '#5B8DEF',
    purple: '#A78BFA',
    green: '#44D4A0',
    red: '#FF7B7B',
    orange: '#FB923C',
    yellow: '#FBBD34',
    pink: '#E879F9',
  },

  // Semantic Color Variants
  variants: {
    primary: {
      base: '#5B8DEF',
      light: '#0D1A35',      // for backgrounds
      lighter: '#5B8DEF20',  // 20% opacity
      glow: '#2D5AB8',       // for glows
    },
    success: {
      base: '#44D4A0',
      light: '#0A2C1E',
      lighter: '#44D4A020',
      glow: '#2D9A7D',
    },
    error: {
      base: '#FF7B7B',
      light: '#2A0E0E',
      lighter: '#FF7B7B20',
      glow: '#D94A4A',
    },
    warning: {
      base: '#FBBD34',
      light: '#2A1E08',
      lighter: '#FBBD3420',
      glow: '#D4983A',
    },
  },

  // Deprecated: Direct color names (use semantic colors above)
  // Keeping for backward compatibility during migration
  sapphire: '#5B8DEF',
  sapphDim: '#0D1A35',
  emerald: '#44D4A0',
  emerDim: '#0A2C1E',
  coral: '#FF7B7B',
  coralDim: '#2A0E0E',
  lavender: '#A78BFA',
  lavDim: '#1E1040',
  gold: '#F0C060',
  goldDim: '#2A1E08',
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY SCALE
// ═══════════════════════════════════════════════════════════════════════════

export const TYPOGRAPHY = {
  // Display sizes - for hero/large headlines
  display: {
    xl: {
      fontSize: 72,
      fontWeight: '800',
      lineHeight: 80,
      letterSpacing: -2,
    },
    lg: {
      fontSize: 48,
      fontWeight: '800',
      lineHeight: 56,
      letterSpacing: -1.5,
    },
  },

  // Heading sizes
  heading: {
    xl: {
      fontSize: 32,
      fontWeight: '800',
      lineHeight: 40,
      letterSpacing: -0.5,
    },
    lg: {
      fontSize: 26,
      fontWeight: '800',
      lineHeight: 32,
      letterSpacing: -0.4,
    },
    md: {
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 28,
      letterSpacing: -0.3,
    },
    sm: {
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
      letterSpacing: -0.2,
    },
    xs: {
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 20,
      letterSpacing: 0,
    },
  },

  // Body text sizes
  body: {
    lg: {
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
      letterSpacing: 0,
    },
    md: {
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
      letterSpacing: 0,
    },
    sm: {
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 18,
      letterSpacing: 0.2,
    },
  },

  // Label sizes (for buttons, inputs)
  label: {
    lg: {
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
      letterSpacing: 0.3,
    },
    md: {
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 18,
      letterSpacing: 0.4,
    },
    sm: {
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 16,
      letterSpacing: 0.5,
    },
  },

  // Caption sizes
  caption: {
    lg: {
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
      letterSpacing: 0,
    },
    md: {
      fontSize: 11,
      fontWeight: '500',
      lineHeight: 14,
      letterSpacing: 0.1,
    },
    sm: {
      fontSize: 10,
      fontWeight: '500',
      lineHeight: 12,
      letterSpacing: 0.2,
    },
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// SPACING SCALE (8pt grid system)
// ═══════════════════════════════════════════════════════════════════════════

export const SPACING = {
  // 4pt increments (half-unit)
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  xxxxl: 48,

  // Aliases for clarity
  gap: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },

  padding: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },

  margin: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// BORDER RADIUS SCALE
// ═══════════════════════════════════════════════════════════════════════════

export const BORDER_RADIUS = {
  none: 0,
  sm: 8,      // Small elements, icon buttons
  md: 12,     // Cards, inputs, small modals
  lg: 16,     // Large cards, dialogs
  xl: 20,     // Extra large components
  full: 9999, // Fully rounded (pills, circles)
}

// ═══════════════════════════════════════════════════════════════════════════
// SHADOWS (Elevation System)
// ═══════════════════════════════════════════════════════════════════════════

export const SHADOWS = {
  // Elevation 1 - Subtle shadows for cards
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },

  // Elevation 2 - Medium shadows
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 4,
  },

  // Elevation 3 - Prominent shadows for modals
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 8,
  },

  // Elevation 4 - Deep shadows for overlays
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSIVE BREAKPOINTS
// ═══════════════════════════════════════════════════════════════════════════

export const BREAKPOINTS = {
  xs: 320,    // Small phones (iPhone SE)
  sm: 375,    // Standard small phones (iPhone 12 mini)
  md: 390,    // Standard phones (iPhone 12, 13)
  lg: 768,    // Tablets (iPad)
  xl: 1024,   // Large tablets (iPad Pro)
}

// Helper function to check screen size
export const getScreenSize = (width: number): keyof typeof BREAKPOINTS => {
  if (width < BREAKPOINTS.sm) return 'xs'
  if (width < BREAKPOINTS.md) return 'sm'
  if (width < BREAKPOINTS.lg) return 'md'
  if (width < BREAKPOINTS.xl) return 'lg'
  return 'xl'
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION DURATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ANIMATIONS = {
  // Micro-interactions
  fast: 150,      // Button press, quick feedback
  normal: 250,    // Standard transitions
  slow: 350,      // Entrance animations
  verySlow: 500,  // Complex animations

  // Easing functions (using React Native Animated)
  easing: {
    // Linear motion
    linear: 'linear',
    // Ease out - natural feeling
    easeOut: 'ease-out',
    // Spring-like
    easeOutQuart: 'cubic-bezier(0.25, 1, 0.25, 1)',
    easeOutElastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT SIZES
// ═══════════════════════════════════════════════════════════════════════════

export const SIZES = {
  // Button sizes (height x horizontal padding)
  button: {
    sm: { height: 32, paddingHorizontal: SPACING.lg },
    md: { height: 40, paddingHorizontal: SPACING.lg },
    lg: { height: 48, paddingHorizontal: SPACING.xl },
  },

  // Icon sizes
  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 48,
  },

  // Avatar sizes
  avatar: {
    sm: 32,
    md: 40,
    lg: 56,
    xl: 64,
  },

  // Touch target minimum (Apple HIG: 44pt)
  touchTarget: 44,

  // Modal widths
  modal: {
    sm: 300,
    md: 400,
    lg: 600,
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const LAYOUT = {
  // Screen padding/margins
  screenPadding: SPACING.lg,        // 16px
  screenPaddingLarge: SPACING.xl,   // 24px
  
  // Content max width (for tablets)
  maxContentWidth: 600,

  // Safe area insets (will be overridden at runtime)
  safeArea: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const FORM = {
  // Input heights
  input: {
    sm: 32,
    md: 40,
    lg: 48,
  },

  // Input padding
  inputPadding: {
    horizontal: SPACING.md,
    vertical: SPACING.sm,
  },

  // Field gap
  fieldGap: SPACING.lg,
  labelGap: SPACING.sm,
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT COLORS ALIAS FOR BACKWARD COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

export const C = COLORS // Short alias for use in existing code
