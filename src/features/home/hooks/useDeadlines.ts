import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEADLINES_KEY } from '@/features/home/constants'
import { sortDeadlines } from '@/features/home/api/home'
import type { Deadline } from '@/features/home/types'
import { supabase } from '@/core/api/supabase'

export function useDeadlines(userId: string | null) {
  const [deadlines,       setDeadlines]       = useState<Deadline[]>([])
  const [deadlinesLoaded, setDeadlinesLoaded] = useState(false)
  const [isSyncing,       setIsSyncing]       = useState(false)

  // ── Scoped key — null when userId unknown (hook stays dormant) ────────
  const storageKey = userId ? `${DEADLINES_KEY}_${userId}` : null

  // ── Sync with Supabase ────────────────────────────────────────────────
  const syncWithSupabase = useCallback(async (uid: string) => {
    try {
      setIsSyncing(true)
      const { data, error } = await supabase
        .from('deadlines')
        .select('id, title, due_date, course, color, is_done')
        .eq('user_id', uid)
        .order('due_date', { ascending: true })

      if (error) throw error
      if (data) {
        setDeadlines(data as Deadline[])
        if (storageKey) {
          await AsyncStorage.setItem(storageKey, JSON.stringify(data)).catch(() => {})
        }
      }
    } catch (err) {
      console.error('[useDeadlines] sync error:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [storageKey])

  // ── Reset + reload whenever userId changes ────────────────────────────
  useEffect(() => {
    // Reset state immediately so old user's deadlines never flash for new user
    setDeadlines([])
    setDeadlinesLoaded(false)

    if (!userId || !storageKey) return

    let cancelled = false
    
    // 1. Load from cache for instant UI
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (cancelled) return
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) setDeadlines(parsed)
        }
      })
      .catch(() => {})
      .finally(() => { 
        if (!cancelled) {
          setDeadlinesLoaded(true)
          // 2. Trigger background sync from Supabase
          syncWithSupabase(userId)
        }
      })

    return () => { cancelled = true }
  }, [userId, storageKey, syncWithSupabase])

  // ── Persist on every change (after first load, only when key exists) ──
  useEffect(() => {
    if (!deadlinesLoaded || !storageKey) return
    AsyncStorage.setItem(storageKey, JSON.stringify(deadlines)).catch(() => {
      Alert.alert('Storage Warning', 'Deadlines could not be saved locally.')
    })
  }, [deadlines, deadlinesLoaded, storageKey])

  // ── Exposed actions ───────────────────────────────────────────────────
  const addDeadline = useCallback(async (deadline: Omit<Deadline, 'id'>) => {
    const newId = Date.now().toString()
    const item = { ...deadline, id: newId, is_done: false }
    
    // Optimistic Update
    setDeadlines(prev => [...prev, item])
    
    if (userId) {
      const { error } = await supabase.from('deadlines').insert({
        ...item,
        user_id: userId
      })
      if (error) {
        Alert.alert('Sync Error', 'Could not save deadline to server.')
        // Rollback
        setDeadlines(prev => prev.filter(d => d.id !== newId))
      }
    }
  }, [userId])

  const removeDeadline = useCallback(async (id: string) => {
    const original = [...deadlines]
    
    // Optimistic Update
    setDeadlines(prev => prev.filter(d => d.id !== id))
    
    if (userId) {
      const { error } = await supabase.from('deadlines').delete().eq('id', id).eq('user_id', userId)
      if (error) {
        Alert.alert('Sync Error', 'Could not delete deadline from server.')
        setDeadlines(original)
      }
    }
  }, [deadlines, userId])

  const toggleDeadlineDone = useCallback(async (id: string, is_done: boolean) => {
    const original = [...deadlines]
    setDeadlines(prev => prev.map(d => d.id === id ? { ...d, is_done } : d))
    
    if (userId) {
      const { error } = await supabase.from('deadlines').update({ is_done }).eq('id', id).eq('user_id', userId)
      if (error) {
        Alert.alert('Sync Error', 'Could not update deadline.')
        setDeadlines(original)
      }
    }
  }, [deadlines, userId])

  const reload = useCallback(async () => {
    if (userId) await syncWithSupabase(userId)
  }, [userId, syncWithSupabase])

  const sortedDeadlines = useMemo(() => sortDeadlines(deadlines), [deadlines])

  return {
    deadlines,
    sortedDeadlines,
    addDeadline,
    removeDeadline,
    toggleDeadlineDone,
    setDeadlines,
    reload,
    isSyncing,
  }
}