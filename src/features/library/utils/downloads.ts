import * as FileSystem from 'expo-file-system/legacy'
import type { DownloadRecord } from '@/lib/queries/screens'

export type Download = DownloadRecord & { localPath?: string; isOffline?: boolean }

export const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`
export const EMPTY_DOWNLOADS: DownloadRecord[] = []
export const DOWNLOADS_CACHE_KEY = (uid: string) => `downloads_cache_${uid}`

export function makeLocalPath(materialId: string, fileUrl: string) {
  const ext = fileUrl.split('.').pop()?.split('?')[0] || 'pdf'
  return DOWNLOAD_DIR + materialId + '.' + ext
}

export async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR)
  if (!info.exists) await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true })
}

export async function calcStorageUsed(downloads: Download[]): Promise<number> {
  let total = 0
  for (const d of downloads) {
    if (d.isOffline && d.localPath) {
      const info = await FileSystem.getInfoAsync(d.localPath)
      if (info.exists && 'size' in info) total += (info as any).size ?? 0
    }
  }
  return total
}
