import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/core/api/supabase'

export type Folder = {
  id: string
  user_id?: string
  name: string
  color: string
  created_at: string
  updated_at?: string
  material_ids: string[]
}

const FOLDERS_CACHE_KEY = (uid: string) => `folders_cache_${uid}`
const FOLDERS_LEGACY_KEY = 'studentshare_download_folders'

async function dbFetchFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('download_folders')
    .select('id,user_id,name,color,created_at,updated_at,material_ids')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Folder[]
}

async function dbInsertFolder(userId: string, name: string, color: string): Promise<Folder> {
  const { data, error } = await supabase
    .from('download_folders')
    .insert({ user_id: userId, name, color, material_ids: [] })
    .select()
    .single()
  if (error) throw error
  return data as Folder
}

async function dbUpdateFolder(
  id: string,
  fields: Partial<Pick<Folder, 'name' | 'color' | 'material_ids'>>,
): Promise<void> {
  const { error } = await supabase
    .from('download_folders')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

async function dbDeleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('download_folders').delete().eq('id', id)
  if (error) throw error
}

export function useFolders(userId: string | null) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [syncing, setSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const userIdRef = useRef(userId)
  const cancelRef = useRef(false)

  useEffect(() => { userIdRef.current = userId }, [userId])

  const persist = useCallback(async (uid: string, list: Folder[]) => {
    try { await AsyncStorage.setItem(FOLDERS_CACHE_KEY(uid), JSON.stringify(list)) } catch {}
  }, [])

  const fetchAndApply = useCallback(async (uid: string) => {
    const fresh = await dbFetchFolders(uid)
    setFolders(fresh)
    setIsOnline(true)
    await persist(uid, fresh)
    return fresh
  }, [persist])

  useEffect(() => {
    if (!userId) return
    cancelRef.current = false

    const init = async () => {
      try {
        const raw = await AsyncStorage.getItem(FOLDERS_CACHE_KEY(userId))
        if (raw && !cancelRef.current) setFolders(JSON.parse(raw))
      } catch {}

      try {
        const rawLegacy = await AsyncStorage.getItem(FOLDERS_LEGACY_KEY)
        if (rawLegacy) {
          const legacy: Folder[] = JSON.parse(rawLegacy)
          await AsyncStorage.removeItem(FOLDERS_LEGACY_KEY)
          for (const folder of legacy) {
            try { await dbInsertFolder(userId, folder.name, folder.color) } catch {}
          }
        }
      } catch {}

      setSyncing(true)
      try {
        if (!cancelRef.current) await fetchAndApply(userId)
      } catch {
        if (!cancelRef.current) setIsOnline(false)
      } finally {
        if (!cancelRef.current) setSyncing(false)
      }
    }

    init()
    return () => { cancelRef.current = true }
  }, [userId, fetchAndApply])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`folders-rt-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'download_folders', filter: `user_id=eq.${userId}` },
        async () => {
          const uid = userIdRef.current
          if (!uid) return
          try { await fetchAndApply(uid) } catch {}
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsOnline(true)
      })

    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchAndApply])

  const createFolder = useCallback(async (name: string, color: string): Promise<Folder | null> => {
    if (!userId) return null
    const optimistic: Folder = {
      id: `__pending_${Date.now()}`,
      user_id: userId,
      name,
      color,
      created_at: new Date().toISOString(),
      material_ids: [],
    }
    setFolders(prev => [...prev, optimistic])
    try {
      const saved = await dbInsertFolder(userId, name, color)
      setFolders(prev => {
        const without = prev.filter(f => f.id !== optimistic.id)
        return [...without, saved].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      })
      const latest = await dbFetchFolders(userId)
      await persist(userId, latest)
      setIsOnline(true)
      return saved
    } catch (e: any) {
      const msg = e?.message ?? JSON.stringify(e)
      Alert.alert(
        'Folder sync failed',
        `Could not save folder to Supabase.\n\nError: ${msg}\n\nCheck that the download_folders table exists and RLS policies are set up correctly.`,
      )
      setFolders(prev => prev.filter(f => f.id !== optimistic.id))
      setIsOnline(false)
      return null
    }
  }, [persist, userId])

  const updateFolder = useCallback(async (id: string, name: string, color: string) => {
    if (!userId) return
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name, color } : f))
    try {
      await dbUpdateFolder(id, { name, color })
      setIsOnline(true)
    } catch {
      setIsOnline(false)
      try { await fetchAndApply(userId) } catch {}
    }
  }, [fetchAndApply, userId])

  const deleteFolder = useCallback(async (id: string) => {
    if (!userId) return
    setFolders(prev => prev.filter(f => f.id !== id))
    try {
      await dbDeleteFolder(id)
      const latest = await dbFetchFolders(userId)
      await persist(userId, latest)
      setIsOnline(true)
    } catch {
      setIsOnline(false)
      try { await fetchAndApply(userId) } catch {}
    }
  }, [fetchAndApply, persist, userId])

  const toggleMaterial = useCallback(async (folderId: string, materialId: string) => {
    if (!userId) return
    let newIds: string[] = []
    setFolders(prev => prev.map(f => {
      if (f.id !== folderId) return f
      const has = f.material_ids.includes(materialId)
      newIds = has ? f.material_ids.filter(id => id !== materialId) : [...f.material_ids, materialId]
      return { ...f, material_ids: newIds }
    }))
    try {
      await dbUpdateFolder(folderId, { material_ids: newIds })
      setIsOnline(true)
    } catch {
      setIsOnline(false)
      try { await fetchAndApply(userId) } catch {}
    }
  }, [fetchAndApply, userId])

  const removeMaterialFromAll = useCallback(async (materialId: string) => {
    if (!userId) return
    const affected: string[] = []
    setFolders(prev => prev.map(f => {
      if (!f.material_ids.includes(materialId)) return f
      affected.push(f.id)
      return { ...f, material_ids: f.material_ids.filter(id => id !== materialId) }
    }))
    for (const folderId of affected) {
      try {
        const current = await dbFetchFolders(userId)
        const target = current.find(f => f.id === folderId)
        if (target) {
          await dbUpdateFolder(folderId, {
            material_ids: target.material_ids.filter(id => id !== materialId),
          })
        }
      } catch {}
    }
  }, [userId])

  return {
    folders,
    syncing,
    isOnline,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleMaterial,
    removeMaterialFromAll,
  }
}
