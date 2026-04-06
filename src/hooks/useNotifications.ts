/**
 * hooks/useNotifications.ts
 *
 * Unified notification service for StudentShare.
 *
 * FEATURES:
 * ── Offline-first: all notifications cached in AsyncStorage, rendered
 *    instantly on cold start (even without network).
 * ── Realtime: Supabase channel delivers new notifications live.
 * ── Expo Push Notifications: registers device token on first load,
 *    sends local scheduled reminders for deadlines.
 * ── Deadline reminders: scans AsyncStorage deadlines every time the
 *    hook mounts and schedules local notifications at:
 *      • 24 h before deadline
 *      •  1 h before deadline
 *      • At the exact deadline time
 * ── Material upload notifications: triggered by Realtime inserts.
 * ── Read/delete/mark-all operations with optimistic UI updates.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { supabase } from '../lib/supabase'

// Lazy-load expo-notifications so it never runs its module-level
// DevicePushTokenAutoRegistration code in Expo Go (SDK 53+ crashes on import)
const isExpoGo = Constants.appOwnership === 'expo'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null
if (!isExpoGo) {
  // Dynamic require — only loads in dev builds / production
  Notifications = require('expo-notifications')
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type NotificationType =
  | 'material_upload'
  | 'deadline_reminder'
  | 'deadline_due'
  | 'admin_broadcast'
  | 'leaderboard'
  | 'general'

export type Notification = {
  id:          string
  title:       string
  body:        string
  is_read:     boolean
  material_id?: string | null  // legacy; prefer metadata.material_id
  type:        NotificationType
  metadata:    Record<string, any> | null
  sent_by:     string | null
  created_at:  string
}

export type Deadline = {
  id:    string
  title: string
  date:  string  // ISO string
  color: string
}

export type UseNotificationsResult = {
  notifications:  Notification[]
  loading:        boolean
  isOnline:       boolean
  unreadCount:    number
  markRead:       (id: string) => Promise<void>
  markAllRead:    () => Promise<void>
  deleteNotif:    (id: string) => Promise<void>
  refetch:        () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_CACHE_KEY      = 'studentshare_notifications_cache'
const DEADLINES_KEY        = 'studentshare_deadlines'
const PUSH_TOKEN_SENT_KEY  = 'studentshare_push_token_sent'

// ─────────────────────────────────────────────────────────────────────────────
// Expo Notifications global config (call once at app root)
// ─────────────────────────────────────────────────────────────────────────────
// Set notification handler only when Notifications module is available
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert:   true,
      shouldPlaySound:   true,
      shouldSetBadge:    true,
      shouldShowBanner:  true,
      shouldShowList:    true,
    }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Push token registration
// ─────────────────────────────────────────────────────────────────────────────
export async function registerPushToken(userId: string): Promise<void> {
  try {
    // Notifications module not loaded in Expo Go — skip silently
    if (!Notifications) return

    // Check if already sent this session
    const alreadySent = await AsyncStorage.getItem(PUSH_TOKEN_SENT_KEY)
    if (alreadySent === userId) return

    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    })

    if (!tokenData.data) return

    // Upsert token into push_tokens table
    await supabase.from('push_tokens').upsert(
      {
        user_id:  userId,
        token:    tokenData.data,
        platform: Platform.OS,
      },
      { onConflict: 'user_id,token' },
    )

    await AsyncStorage.setItem(PUSH_TOKEN_SENT_KEY, userId)

    // Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:       'StudentShare',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1A56DB',
      })
      await Notifications.setNotificationChannelAsync('deadlines', {
        name:       'Deadline Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
      })
    }
  } catch (err) {
    // Non-critical — don't crash app if push setup fails
    console.warn('[useNotifications] Push token registration failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deadline local notification scheduler
// ─────────────────────────────────────────────────────────────────────────────
export async function scheduleDeadlineReminders(): Promise<void> {
  try {
    // Local notifications not available in Expo Go
    if (!Notifications) return

    const raw = await AsyncStorage.getItem(DEADLINES_KEY)
    if (!raw) return

    const deadlines: Deadline[] = JSON.parse(raw)
    const now = Date.now()

    // Cancel all existing deadline notifications to avoid duplicates
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    for (const notif of scheduled) {
      if (notif.identifier.startsWith('deadline_')) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier)
      }
    }

    for (const deadline of deadlines) {
      const due = new Date(deadline.date).getTime()
      if (due <= now) continue  // past deadlines — skip

      const h24 = due - 24 * 60 * 60 * 1000
      const h1  = due - 60 * 60 * 1000

      // 24-hour warning
      if (h24 > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `deadline_24h_${deadline.id}`,
          content: {
            title:  '⏰ Deadline Tomorrow',
            body:   `"${deadline.title}" is due in 24 hours!`,
            sound:  true,
            data:   { type: 'deadline_reminder', deadlineId: deadline.id },
            ...(Platform.OS === 'android' ? { channelId: 'deadlines' } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(h24) },
        })
      }

      // 1-hour warning
      if (h1 > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `deadline_1h_${deadline.id}`,
          content: {
            title:  '🚨 Deadline in 1 Hour',
            body:   `"${deadline.title}" is due very soon!`,
            sound:  true,
            data:   { type: 'deadline_reminder', deadlineId: deadline.id },
            ...(Platform.OS === 'android' ? { channelId: 'deadlines' } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(h1) },
        })
      }

      // At due time
      if (due > now + 60_000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `deadline_due_${deadline.id}`,
          content: {
            title:  '🔴 Deadline Due Now',
            body:   `"${deadline.title}" is due right now!`,
            sound:  true,
            data:   { type: 'deadline_due', deadlineId: deadline.id },
            ...(Platform.OS === 'android' ? { channelId: 'deadlines' } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(due) },
        })
      }
    }
  } catch (err) {
    console.warn('[useNotifications] Deadline scheduling failed:', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────
function safeParseNotifications(raw: string | null): Notification[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useNotifications(collegeId: string | null = null, classId: string | null = null): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState<string | null>(null)
  const [isOnline,      setIsOnline]      = useState(true)

  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const cancelledRef = useRef(false)

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false

    const init = async () => {
      // 1. Load cache immediately (offline-first)
      const raw = await AsyncStorage.getItem(NOTIF_CACHE_KEY).catch(() => null)
      const cached = safeParseNotifications(raw)
      if (cached.length > 0 && !cancelledRef.current) {
        setNotifications(cached)
        setLoading(false)
      }

      // 2. Get live auth
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelledRef.current) return

        if (!session?.user) {
          console.warn('[useNotifications] No session — not logged in')
          setIsOnline(false)
          setLoading(false)
          return
        }

        console.log('[useNotifications] Session OK, user:', session.user.id)
        setIsOnline(true)
        setUserId(session.user.id)

        // 3. Register push token (non-blocking)
        void registerPushToken(session.user.id)

        // 4. Schedule deadline reminders (non-blocking)
        void scheduleDeadlineReminders()

        // 5. Fetch fresh notifications
        await fetchNotifications(session.user.id)
      } catch {
        if (!cancelledRef.current) {
          setIsOnline(false)
          setLoading(false)
        }
      }
    }

    void init()

    return () => {
      cancelledRef.current = true
    }
  }, [])

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return

    // Subscribe to new inserts on our user's notifications
          const filterParts = [`user_id=eq.${userId}`]
        if (collegeId) filterParts.push(`college_id=eq.${collegeId}`)
        if (classId) filterParts.push(`class_id=eq.${classId}`)

        channelRef.current = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: filterParts.join(','),
        },
        (payload) => {
          if (cancelledRef.current) return
          const newNotif = payload.new as Notification
          setNotifications(prev => {
            // Prevent duplicates
            if (prev.some(n => n.id === newNotif.id)) return prev
            const updated = [newNotif, ...prev]
            void AsyncStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify(updated)).catch(() => {})
            return updated
          })
        },
      )
      .subscribe()

    // Re-schedule deadline reminders when app comes to foreground
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void scheduleDeadlineReminders()
      }
    })

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      appStateSub.remove()
    }
  }, [userId])

  // ── Fetch ─────────────────────────────────────────────────────────────────
const fetchNotifications = useCallback(async (uid: string) => {
    setLoading(true)
    try {
        let query = supabase
          .from('notifications')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(60)

        if (collegeId) query = query.eq('college_id', collegeId)
        if (classId) query = query.eq('class_id', classId)

        const { data, error } = await query

      if (error) {
        console.warn('[useNotifications] fetch error:', error.message, error.code)
        throw error
      }

      console.log('[useNotifications] fetched', data?.length ?? 0, 'notifications for', uid)
      const notifs = (data ?? []) as Notification[]
      if (!cancelledRef.current) {
        setNotifications(notifs)
        setIsOnline(true)
        void AsyncStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify(notifs)).catch(() => {})
      }
    } catch (e: any) {
      console.warn('[useNotifications] fetch failed:', e?.message)
      // Offline — keep showing cache
      if (!cancelledRef.current) setIsOnline(false)
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [])

const refetch = useCallback(async () => {
    if (userId) await fetchNotifications(userId)
  }, [userId, fetchNotifications, collegeId, classId])

  // ── Mark read ─────────────────────────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    // Optimistic
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    } catch {
      // Rollback if offline
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n))
    }
  }, [])

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    const prev = [...notifications]
    setNotifications(p => p.map(n => ({ ...n, is_read: true })))
    try {
      if (!userId) return
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      // Update cache
      setNotifications(cur => {
        void AsyncStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify(cur)).catch(() => {})
        return cur
      })
    } catch {
      setNotifications(prev)
    }
  }, [notifications, userId])

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteNotif = useCallback(async (id: string) => {
    const prev = [...notifications]
    setNotifications(p => p.filter(n => n.id !== id))
    try {
      await supabase.from('notifications').delete().eq('id', id)
      setNotifications(cur => {
        void AsyncStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify(cur)).catch(() => {})
        return cur
      })
    } catch {
      setNotifications(prev)
    }
  }, [notifications])

  const unreadCount = notifications.filter(n => !n.is_read).length

  return {
    notifications,
    loading,
    isOnline,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotif,
    refetch,
  }
}
