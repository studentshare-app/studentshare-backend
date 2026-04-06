/**
 * app/(auth)/_layout.tsx  — Auth group layout
 *
 * Simple stack navigator for all auth screens.
 * The root _layout.tsx AuthGuard handles redirecting authenticated users
 * away from this group — no extra logic needed here.
 */

import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="college-selection" />
      <Stack.Screen name="class-selection" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  )
}
