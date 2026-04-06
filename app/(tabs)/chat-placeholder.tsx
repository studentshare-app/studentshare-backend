/**
 * app/(tabs)/chat-placeholder.tsx
 *
 * This file must exist so Expo Router recognises the tab route.
 * The actual navigation is handled by ForumFAB in TabsLayout.
 */
import { Redirect } from 'expo-router'
export default function ChatPlaceholder() {
  return <Redirect href="/student-forum" />
}
