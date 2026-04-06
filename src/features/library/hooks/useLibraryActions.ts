import * as FileSystem from 'expo-file-system/legacy'
import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/core/api/supabase'
import { registryAdd, registryRemove } from '@/lib/useDownloadRegistry'
import { ensureDir, makeLocalPath, type Download } from '@/features/library/utils/downloads'

export function useLibraryActions({
  userId,
  isPremium,
  downloadsWithLocal,
  setDownloadsWithLocal,
  removeMaterialFromAll,
  refreshDownloads,
  setShowPremModal,
  setOpenMenuId,
  router,
}: {
  userId: string | null
  isPremium: boolean
  downloadsWithLocal: Download[]
  setDownloadsWithLocal: React.Dispatch<React.SetStateAction<Download[]>>
  removeMaterialFromAll: (materialId: string) => Promise<void>
  refreshDownloads: () => void
  setShowPremModal: React.Dispatch<React.SetStateAction<boolean>>
  setOpenMenuId: React.Dispatch<React.SetStateAction<string | null>>
  router: { push: (route: any) => void }
}) {
  const [cachingId, setCachingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      if (next.size === 0) setSelectMode(false)
      return next
    })
  }, [])

  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true)
    setSelectedIds(new Set([id]))
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const cacheFile = useCallback(async (item: Download) => {
    if (!isPremium) {
      setShowPremModal(true)
      return
    }
    if (item.isOffline) return

    try {
      setCachingId(item.id)
      await ensureDir()
      const path = makeLocalPath(item.material.id, item.material.file_url)
      const existing = await FileSystem.getInfoAsync(path)

      if (existing.exists) {
        setDownloadsWithLocal(prev => prev.map(d => d.id === item.id ? { ...d, localPath: path, isOffline: true } : d))
        registryAdd(item.material.id)
        return
      }

      const result = await FileSystem.downloadAsync(item.material.file_url, path)
      if (result.status === 200) {
        setDownloadsWithLocal(prev => prev.map(d => d.id === item.id ? { ...d, localPath: path, isOffline: true } : d))
        registryAdd(item.material.id)
      } else {
        Alert.alert('Download failed', 'Could not save the file offline.')
      }
    } catch {
      Alert.alert('Error', 'Failed to download file for offline use.')
    } finally {
      setCachingId(null)
    }
  }, [isPremium, setDownloadsWithLocal, setShowPremModal])

  const openFile = useCallback((item: Download) => {
    if (selectMode) {
      toggleSelect(item.id)
      return
    }
    setOpenMenuId(null)
    router.push({
      pathname: '/viewer',
      params: {
        file_url: item.isOffline && item.localPath ? item.localPath : item.material.file_url,
        title: item.material.title,
        material_id: item.material.id,
        is_local: item.isOffline ? '1' : '0',
        from: '/(tabs)/downloads',
      },
    })
  }, [router, selectMode, setOpenMenuId, toggleSelect])

  const removeDownload = useCallback(async (item: Download) => {
    setOpenMenuId(null)
    Alert.alert('Remove Download', `Remove "${item.material.title}" from your downloads?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('downloads').delete().eq('id', item.id)
          if (error) {
            Alert.alert('Error', 'Could not remove download.')
            return
          }
          if (item.localPath) await FileSystem.deleteAsync(item.localPath, { idempotent: true })
          registryRemove(item.material.id)
          await removeMaterialFromAll(item.material.id)
          setDownloadsWithLocal(prev => prev.filter(d => d.id !== item.id))
          refreshDownloads()
        },
      },
    ])
  }, [refreshDownloads, removeMaterialFromAll, setDownloadsWithLocal, setOpenMenuId])

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    Alert.alert('Remove Downloads', `Remove ${selectedIds.size} download${selectedIds.size > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const toDelete = downloadsWithLocal.filter(d => selectedIds.has(d.id))
          const { error } = await supabase.from('downloads').delete().in('id', toDelete.map(d => d.id))
          if (error) {
            Alert.alert('Error', 'Could not remove some downloads.')
            return
          }
          for (const item of toDelete) {
            if (item.localPath) await FileSystem.deleteAsync(item.localPath, { idempotent: true })
            registryRemove(item.material.id)
            await removeMaterialFromAll(item.material.id)
          }
          setDownloadsWithLocal(prev => prev.filter(d => !selectedIds.has(d.id)))
          setSelectedIds(new Set())
          setSelectMode(false)
          refreshDownloads()
        },
      },
    ])
  }, [downloadsWithLocal, refreshDownloads, removeMaterialFromAll, selectedIds, setDownloadsWithLocal])

  const openChat = useCallback((item: Download) => {
    setOpenMenuId(null)
    router.push({
      pathname: '/chat',
      params: {
        material_title: item.material.title,
        file_url: item.isOffline && item.localPath ? item.localPath : item.material.file_url,
        conversation_id: 'new',
      },
    })
  }, [router, setOpenMenuId])

  const openQuiz = useCallback((item: Download) => {
    setOpenMenuId(null)
    router.push({
      pathname: '/quiz-flashcards' as any,
      params: {
        material_id: item.material.id,
        title: item.material.title,
        file_url: item.isOffline && item.localPath ? item.localPath : item.material.file_url,
        type: item.material.type,
        auto_generate: '1',
      },
    })
  }, [router, setOpenMenuId])

  return {
    bulkDelete,
    cacheFile,
    cachingId,
    enterSelectMode,
    exitSelectMode,
    openChat,
    openFile,
    openQuiz,
    removeDownload,
    selectMode,
    selectedIds,
    toggleSelect,
  }
}
