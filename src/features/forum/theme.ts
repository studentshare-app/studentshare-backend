/**
 * forum/theme.ts
 * Single source of truth for ALL design tokens used across every forum component.
 * Import from here — never define a local T object in individual files.
 */

export const T = {
  // Backgrounds
  bg:        '#000000',
  bg2:       '#0d0d0d',
  bg3:       '#16181c',
  bg4:       '#202327',

  // Borders
  border:    '#2f3336',
  border2:   '#3e4144',

  // Text
  text:      '#e7e9ea',
  muted:     '#71767b',
  muted2:    '#8b98a5',

  // Brand — Twitter/X blue (consistent across the whole forum)
  accent:    '#1DA1F2',
  accentDim: 'rgba(29,161,242,0.12)',
  accentGlow:'rgba(29,161,242,0.2)',

  // Semantics
  green:     '#00ba7c',
  red:       '#f91880',
  amber:     '#ffd400',
  gold:      '#ffd400',
} as const

export type TType = typeof T