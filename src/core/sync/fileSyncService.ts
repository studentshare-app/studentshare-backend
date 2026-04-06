import database from '@/database'
import { Q } from '@nozbe/watermelondb'
import NetInfo from '@react-native-community/netinfo'
import * as FileSystem from 'expo-file-system/legacy'
import { documentDirectory } from 'expo-file-system/legacy'

const DOWNLOADS_DIR = (documentDirectory ?? '') + 'downloads/'

// ─── Ensure download directory exists ────────────────────────────────────────

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DOWNLOADS_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true })
  }
}

// ─── Download a single material (called when user taps download) ──────────────
// WhatsApp model — user explicitly requests a download.

export async function downloadMaterial(material: any): Promise<boolean> {
  const isOnline = await NetInfo.fetch().then(s => s.isConnected)
  if (!isOnline) {
    console.warn('[FileSync] Offline — cannot download', material.id)
    return false
  }

  try {
    await ensureDir()

    const url = new URL(material.fileUrl)
    const pathname = url.pathname.split('/').pop() || ''
    const ext = pathname.split('.').pop()?.toLowerCase() || 'pdf'
    const filename = `${material.id}.${ext}`
    const localPath = DOWNLOADS_DIR + filename

    await database.write(async () => {
      await material.update((m: any) => {
        m.downloadStatus = 'downloading'
      })
    })

    const result = await FileSystem.downloadAsync(material.fileUrl, localPath)

    if (result.status !== 200) {
      throw new Error(`Download failed with status ${result.status}`)
    }

    await database.write(async () => {
      await material.update((m: any) => {
        m.localPath      = result.uri
        m.cached         = true
        m.downloadStatus = 'done'
      })
    })

    return true

  } catch (err) {
    console.warn('[FileSync] Download failed:', err)

    await database.write(async () => {
      await material.update((m: any) => {
        m.downloadStatus = 'failed'
      })
    }).catch(() => {})

    return false
  }
}

// ─── Delete a downloaded file (free up space) ────────────────────────────────

export async function deleteMaterialFile(material: any): Promise<void> {
  try {
    if (material.localPath) {
      const info = await FileSystem.getInfoAsync(material.localPath)
      if (info.exists) {
        await FileSystem.deleteAsync(material.localPath)
      }
    }

    await database.write(async () => {
      await material.update((m: any) => {
        m.localPath      = null
        m.cached         = false
        m.downloadStatus = 'none'
      })
    })
  } catch (err) {
    console.warn('[FileSync] Delete failed:', err)
  }
}

// ─── Resume any interrupted downloads on reconnect ───────────────────────────
// Only resumes materials that were mid-download when connection was lost.
// Does NOT auto-download everything — that's the user's choice.

export async function processMaterialDownloads(): Promise<void> {
  try {
    const isOnline = await NetInfo.fetch().then(s => s.isConnected)
    if (!isOnline) return

    const interrupted = await database.collections
      .get('materials')
      .query(Q.where('download_status', 'downloading'))
      .fetch()

    for (const material of interrupted) {
      await downloadMaterial(material)
    }

  } catch (err) {
    console.warn('[FileSync] processMaterialDownloads error:', err)
  }
}

// ─── Check if a file is still on disk (handles app reinstalls) ───────────────

export async function verifyLocalFile(material: any): Promise<boolean> {
  if (!material.localPath) return false
  try {
    const info = await FileSystem.getInfoAsync(material.localPath)
    if (!info.exists) {
      await database.write(async () => {
        await material.update((m: any) => {
          m.localPath      = null
          m.cached         = false
          m.downloadStatus = 'none'
        })
      })
      return false
    }
    return true
  } catch {
    return false
  }
}

// ─── Network listener for resuming interrupted downloads ─────────────────────

export function startMaterialSync(): () => void {
  return NetInfo.addEventListener(state => {
    if (state.isConnected) {
      processMaterialDownloads()
    }
  })
}

