/**
 * useOfflineFile
 * Single source of truth for local file resolution.
 * Used by viewer.tsx, materials.tsx, and downloads screen.
 *
 * Zero new dependencies — uses expo-file-system + AsyncStorage only.
 */

import * as FileSystem from 'expo-file-system/legacy'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const DOWNLOAD_DIR = FileSystem.documentDirectory + 'downloads/'
const INDEX_KEY = 'offline_index' // { [material_id]: localPath }

// ── Pure helpers (usable outside React) ──────────────────────────────────────

export function buildLocalPath(materialId: string, fileUrl: string): string {
  const ext = fileUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'pdf'
  return DOWNLOAD_DIR + materialId + '.' + ext
}

export async function ensureDownloadDir() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true })
  }
}

async function readIndex(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

async function writeIndex(index: Record<string, string>) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

/**
 * Resolve the best URI for a material without React.
 * Returns local path if file exists on device, otherwise remote URL.
 */
export async function resolveUri(materialId: string, remoteUrl: string): Promise<string> {
  const index = await readIndex()
  const path = index[materialId]
  if (path) {
    const info = await FileSystem.getInfoAsync(path)
    if (info.exists) return path
    // Stale entry — clean up
    const updated = { ...index }
    delete updated[materialId]
    await writeIndex(updated)
  }
  return remoteUrl
}

/**
 * Check if a material is available offline without React.
 */
export async function isAvailableOffline(materialId: string): Promise<boolean> {
  const index = await readIndex()
  const path = index[materialId]
  if (!path) return false
  const info = await FileSystem.getInfoAsync(path)
  return info.exists
}

/**
 * Register an already-downloaded file into the index.
 * Call this from materials.tsx after FileSystem.downloadAsync succeeds.
 */
export async function registerDownload(materialId: string, localPath: string) {
  const index = await readIndex()
  index[materialId] = localPath
  await writeIndex(index)
}

/**
 * Remove a file from device and index.
 */
export async function removeOfflineFile(materialId: string, fileUrl: string) {
  const path = buildLocalPath(materialId, fileUrl)
  await FileSystem.deleteAsync(path, { idempotent: true })
  const index = await readIndex()
  delete index[materialId]
  await writeIndex(index)
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useOfflineFile(materialId: string, remoteUrl: string) {
  const [resolvedUri, setResolvedUri] = useState<string>(remoteUrl)
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState(0) // 0–1

  useEffect(() => {
    if (!materialId || !remoteUrl) return
    let cancelled = false
    resolveUri(materialId, remoteUrl).then(uri => {
      if (cancelled) return
      setResolvedUri(uri)
      setIsDownloaded(uri !== remoteUrl)
    })
    return () => { cancelled = true }
  }, [materialId, remoteUrl])

  async function download(): Promise<string> {
    if (isDownloading) throw new Error('Already downloading')
    if (isDownloaded) return resolvedUri

    try {
      setIsDownloading(true)
      setProgress(0)
      await ensureDownloadDir()

      const path = buildLocalPath(materialId, remoteUrl)

      // Fast path — file already exists but not in index
      const existing = await FileSystem.getInfoAsync(path)
      if (existing.exists) {
        await registerDownload(materialId, path)
        setResolvedUri(path)
        setIsDownloaded(true)
        setProgress(1)
        return path
      }

      // Download with progress
      const task = FileSystem.createDownloadResumable(
        remoteUrl,
        path,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(totalBytesWritten / totalBytesExpectedToWrite)
          }
        }
      )

      const result = await task.downloadAsync()
      if (!result?.uri) throw new Error('Download returned no URI')

      await registerDownload(materialId, path)

      // Best-effort Supabase sync
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('downloads').upsert({ user_id: user.id, material_id: materialId })
        }
      } catch { /* offline — fine */ }

      setResolvedUri(path)
      setIsDownloaded(true)
      setProgress(1)
      return path
    } finally {
      setIsDownloading(false)
    }
  }

  async function remove() {
    await removeOfflineFile(materialId, remoteUrl)
    setResolvedUri(remoteUrl)
    setIsDownloaded(false)
    setProgress(0)
  }

  return {
    resolvedUri,    // Pass this to WebView source / viewer
    isDownloaded,   // Show offline badge / checkmark
    isDownloading,  // Show progress indicator
    progress,       // 0–1 for progress bar
    download,       // Call to start download
    remove,         // Call to delete local copy
  }
}
