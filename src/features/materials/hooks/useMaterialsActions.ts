import { useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { useDownloadRegistry } from '@/lib/useDownloadRegistry'
import { usePremium } from '@/core/entitlements/PremiumProvider'
import {
  addBookmark,
  removeBookmark,
  fetchBookmarkedIds,
  fetchBookmarks,
  addDownload,
  type BookmarkRecord,
} from '@/lib/queries/screens'
import { makeLocalPath, ensureDir } from '@/features/library/utils/downloads'

/**
 * useMaterialsActions — Production-ready hook for bookmarks and downloads.
 * Shared across Study Materials and Library screens to ensure state parity.
 */
export function useMaterialsActions(userId: string | null) {
  const { isPremium } = usePremium()
  const { add: registryAdd, has: registryHas } = useDownloadRegistry()
  
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Hydrate bookmarks on mount or userId change
  const refreshBookmarks = useCallback(async () => {
    if (!userId) {
      setBookmarkedIds(new Set())
      setBookmarks([])
      return
    }
    try {
      // We fetch both the IDs (for fast lookups) and full records (for Library)
      const [ids, records] = await Promise.all([
        fetchBookmarkedIds(userId),
        fetchBookmarks(userId),
      ])
      setBookmarkedIds(ids)
      setBookmarks(records)
    } catch (error) {
      console.warn('[useMaterialsActions] Bookmark refresh failed:', error)
    }
  }, [userId])

  useEffect(() => {
    refreshBookmarks()
  }, [refreshBookmarks])

  const toggleBookmark = useCallback(async (materialId: string) => {
    if (!userId) {
      Alert.alert('Sign In', 'You need to be signed in to save materials.')
      return
    }

    const isBookmarked = bookmarkedIds.has(materialId)
    
    // Optimistic UI update
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      if (isBookmarked) next.delete(materialId)
      else next.add(materialId)
      return next
    })

    try {
      if (isBookmarked) {
        await removeBookmark(userId, materialId)
        setBookmarks(prev => prev.filter(b => b.material_id !== materialId))
      } else {
        await addBookmark(userId, materialId)
        // Refresh to get the full Material record for the Library
        refreshBookmarks()
      }
    } catch (error) {
      // Rollback
      setBookmarkedIds(prev => {
        const next = new Set(prev)
        if (isBookmarked) next.add(materialId)
        else next.delete(materialId)
        return next
      })
      Alert.alert('Error', 'Failed to update bookmark. Please try again.')
    }
  }, [userId, bookmarkedIds, refreshBookmarks])

  const downloadMaterial = useCallback(async (material: { id: string; file_url: string; title: string; is_premium: boolean }) => {
    if (!userId) {
      Alert.alert('Sign In', 'You need to be signed in to download materials.')
      return
    }

    if (material.is_premium && !isPremium) {
      Alert.alert('Premium Content', 'This material is for Premium members only.')
      return
    }

    if (registryHas(material.id)) {
      Alert.alert('Already Offline', 'This file is already available offline in your Library.')
      return
    }

    setIsSyncing(true)

    try {
      await ensureDir()
      const localPath = makeLocalPath(material.id, material.file_url)
      
      const result = await FileSystem.downloadAsync(material.file_url, localPath)
      
      if (result.status !== 200) {
        throw new Error(`Download failed with status ${result.status}`)
      }

      await addDownload(userId, material.id)
      registryAdd(material.id)

      Alert.alert('Saved Offline', 'Material is now available in your Library Downloads.')
    } catch (error: any) {
      console.error('[downloadMaterial] Error:', error)
      Alert.alert('Save Failed', 'Could not save for offline access. Please check your connection.')
    } finally {
      setIsSyncing(false)
    }
  }, [userId, isPremium, registryAdd, registryHas])

  return {
    bookmarks,
    bookmarkedIds,
    toggleBookmark,
    downloadMaterial,
    isSyncing,
    isLoading,
    refreshBookmarks,
  }
}
