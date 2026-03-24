/**
 * app/(tabs)/chat-placeholder.tsx
 *
 * This file must exist so Expo Router recognises the tab route.
 * It immediately redirects to the student chat screen.
 */
import { Redirect } from 'expo-router'

export default function ChatPlaceholder() {
  return <Redirect href={'/student-chat' as any} />
}