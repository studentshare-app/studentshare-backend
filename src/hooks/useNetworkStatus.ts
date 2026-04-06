/**
 * hooks/useNetworkStatus.ts
 *
 * Initialises to null (unknown) instead of optimistic true.
 * isOffline is only ever true when we have a confirmed false signal from
 * NetInfo — never during the brief window before the first check completes.
 *
 * Returns:
 *   isOnline  — true | false | null (null = still checking on first mount)
 *   isOffline — true only when we have confirmed no connection
 */
import NetInfo from '@react-native-community/netinfo'
import { useEffect, useState } from 'react'

// Sync is triggered by RootLayout's NetInfo listener — not here.
// This hook is purely for UI state (offline banners, disabling buttons, etc.)

export function useNetworkStatus() {
  // null means "not yet determined" — avoids optimistic online assumption
  const [isOnline, setIsOnline] = useState<boolean | null>(null)

  useEffect(() => {
    // Get initial state immediately
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected ?? null)
    })

    // Subscribe to all subsequent changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? null)
    })

    return () => unsubscribe()
  }, [])

  return {
    isOnline,
    // isOffline is only true on a confirmed false — null (checking) is NOT offline
    isOffline: isOnline === false,
  }
}