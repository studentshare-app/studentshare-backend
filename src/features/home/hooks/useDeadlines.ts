/**
 * features/home/hooks/useDeadlines.ts
 *
 * Fix 4 / Fix 6: DEADLINES_KEY is now scoped to userId.
 * - Pass userId (string | null) into the hook
 * - Key becomes `${DEADLINES_KEY}_${userId}` — different users never share data
 * - When userId is null, hook stays dormant (no read, no write)
 * - When userId changes (account switch), state resets and re-reads from the
 *   new user's scoped key immediately
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEADLINES_KEY } from '@/features/home/constants'
import { sortDeadlines } from '@/features/home/api/home'
import type { Deadline } from '@/features/home/types'

export function useDeadlines(userId: string | null) {
  const [deadlines,       setDeadlines]       = useState<Deadline[]>([])
  const [deadlinesLoaded, setDeadlinesLoaded] = useState(false)

  // ── Scoped key — null when userId unknown (hook stays dormant) ────────
  const storageKey = userId ? `${DEADLINES_KEY}_${userId}` : null

  // ── Reset + reload whenever userId changes ────────────────────────────
  useEffect(() => {
    // Reset state immediately so old user's deadlines never flash for new user
    setDeadlines([])
    setDeadlinesLoaded(false)

    if (!storageKey) return   // no userId yet — stay dormant

    let cancelled = false
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (cancelled) return
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) setDeadlines(parsed)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDeadlinesLoaded(true) })

    return () => { cancelled = true }
  }, [storageKey])

  // ── Persist on every change (after first load, only when key exists) ──
  useEffect(() => {
    if (!deadlinesLoaded || !storageKey) return
    AsyncStorage.setItem(storageKey, JSON.stringify(deadlines)).catch(() => {
      Alert.alert('Storage Warning', 'Deadlines could not be saved locally.')
    })
  }, [deadlines, deadlinesLoaded, storageKey])

  // ── Exposed actions ───────────────────────────────────────────────────
  const addDeadline = useCallback((deadline: Omit<Deadline, 'id'>) => {
    setDeadlines(prev => [...prev, { ...deadline, id: Date.now().toString() }])
  }, [])

  const removeDeadline = useCallback((id: string) => {
    setDeadlines(prev => prev.filter(d => d.id !== id))
  }, [])

  // ── reload: re-reads from scoped key — call inside useFocusEffect ─────
  const reload = useCallback(async () => {
    if (!storageKey) return
    try {
      const raw = await AsyncStorage.getItem(storageKey)
      if (!raw) { setDeadlines([]); return }
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setDeadlines(parsed)
    } catch {}
  }, [storageKey])

  const sortedDeadlines = useMemo(() => sortDeadlines(deadlines), [deadlines])

  return {
    deadlines,
    sortedDeadlines,
    addDeadline,
    removeDeadline,
    setDeadlines,
    reload,
  }
}