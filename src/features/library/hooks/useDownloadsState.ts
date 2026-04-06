import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import * as FileSystem from 'expo-file-system/legacy'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/core/api/supabase'
import { fetchDownloads } from '@/lib/queries/screens'
import { registrySetAll } from '@/lib/useDownloadRegistry'
import {
  calcStorageUsed,
  DOWNLOADS_CACHE_KEY,
  EMPTY_DOWNLOADS,
  ensureDir,
  makeLocalPath,
  type Download,
} from '@/features/library/utils/downloads'

export function useDownloadsState(userId: string | null) {
  const queryClient = useQueryClient()
  const [downloadsWithLocal, setDownloadsWithLocal] = useState<Download[]>([])
  const [storageUsed, setStorageUsed] = useState(0)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const lastFocusRef = useRef(0)

  useEffect(() => { ensureDir() }, [])

  const { data: rawDownloads = EMPTY_DOWNLOADS, isLoading, error } = useQuery({
    queryKey: ['downloads', userId],
    queryFn: async () => {
      try {
        const data = await fetchDownloads(userId!)
        await AsyncStorage.setItem(DOWNLOADS_CACHE_KEY(userId!), JSON.stringify(data))
        setIsOfflineFallback(false)
        return data
      } catch {
        const cached = await AsyncStorage.getItem(DOWNLOADS_CACHE_KEY(userId!))
        if (cached) {
          setIsOfflineFallback(true)
          return JSON.parse(cached)
        }
        throw new Error('No cache available')
      }
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  })

  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`downloads:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'downloads', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ['downloads', userId] })
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, queryClient])

  useEffect(() => {
    if (rawDownloads.length === 0) {
      setDownloadsWithLocal([])
      registrySetAll([])
      return
    }
    let cancelled = false
    ;(async () => {
      const withLocal = await Promise.all(rawDownloads.map(async (d: typeof rawDownloads[number]) => {
        const path = makeLocalPath(d.material.id, d.material.file_url)
        const info = await FileSystem.getInfoAsync(path)
        return { ...d, localPath: path, isOffline: info.exists }
      }))
      if (cancelled) return
      setDownloadsWithLocal(withLocal)
      registrySetAll(withLocal.filter(d => d.isOffline).map(d => d.material.id))
    })()
    return () => { cancelled = true }
  }, [rawDownloads])

  useEffect(() => {
    calcStorageUsed(downloadsWithLocal).then(setStorageUsed)
  }, [downloadsWithLocal])

  useFocusEffect(useCallback(() => {
    const now = Date.now()
    if (userId && now - lastFocusRef.current > 30_000) {
      lastFocusRef.current = now
      queryClient.invalidateQueries({ queryKey: ['downloads', userId] })
    }
  }, [userId, queryClient]))

  const refreshDownloads = useCallback(() => {
    if (!userId) return
    queryClient.invalidateQueries({ queryKey: ['downloads', userId] })
  }, [queryClient, userId])

  return {
    downloadsWithLocal,
    setDownloadsWithLocal,
    storageUsed,
    isOfflineFallback,
    isLoading,
    error,
    refreshDownloads,
  }
}
