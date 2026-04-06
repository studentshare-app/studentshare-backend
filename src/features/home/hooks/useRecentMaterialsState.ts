import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createNotificationsForNewMaterials } from '@/features/home/api/home'
import { SEEN_MATERIALS_KEY } from '@/features/home/constants'
import type { Material } from '@/features/home/types'

export function useRecentMaterialsState({
  userId,
  recentMaterials,
  onOpenMaterials,
}: {
  userId: string | null
  recentMaterials: Material[]
  onOpenMaterials: () => void
}) {
  const seenMaterialIdsRef = useRef<Set<string>>(new Set())
  const seenLoadedRef = useRef(false)

  useEffect(() => {
    AsyncStorage.getItem(SEEN_MATERIALS_KEY)
      .then(raw => {
        if (raw) {
          try {
            seenMaterialIdsRef.current = new Set(JSON.parse(raw))
          } catch {}
        }
        seenLoadedRef.current = true
      })
      .catch(() => {
        seenLoadedRef.current = true
      })
  }, [])

  const newMaterialCount = useMemo(() => {
    if (!seenLoadedRef.current) return 0
    return recentMaterials.filter(material => !seenMaterialIdsRef.current.has(material.id)).length
  }, [recentMaterials])

  const recentMaterialsKey = recentMaterials.map(material => material.id).join(',')

  useEffect(() => {
    if (!userId || !recentMaterials.length || !seenLoadedRef.current) return
    const newItems = recentMaterials.filter(material => !seenMaterialIdsRef.current.has(material.id))
    if (newItems.length) {
      createNotificationsForNewMaterials(userId, recentMaterials, seenMaterialIdsRef.current).catch(() => {})
    }
  }, [recentMaterialsKey, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openMaterials = useCallback(() => {
    if (seenLoadedRef.current) {
      recentMaterials.forEach(material => seenMaterialIdsRef.current.add(material.id))
      void AsyncStorage.setItem(SEEN_MATERIALS_KEY, JSON.stringify([...seenMaterialIdsRef.current])).catch(() => {})
    }
    onOpenMaterials()
  }, [onOpenMaterials, recentMaterials])

  return {
    newMaterialCount,
    openMaterials,
  }
}
