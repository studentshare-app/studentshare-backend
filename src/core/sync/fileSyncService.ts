import database from '@/database'
import { Q } from '@nozbe/watermelondb'
import NetInfo from '@react-native-community/netinfo'
import * as FileSystem from 'expo-file-system/legacy'
import { documentDirectory } from 'expo-file-system/legacy'
import { supabase } from '@/core/api/supabase'

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
    // Use remote_id for the filename to stay consistent across syncs
    const filename = `${material.remoteId || material.id}.${ext}`
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

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await supabase.from('downloads').upsert({
          user_id: session.user.id,
          material_id: material.remoteId || material.id,
          downloaded_at: new Date().toISOString()
        })
      }
    } catch(e) {
      console.warn('[FileSync] Could not mark download in server:', e)
    }

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

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await supabase.from('downloads')
          .delete()
          .eq('user_id', session.user.id)
          .eq('material_id', material.remoteId || material.id)
      }
    } catch(e) {
      console.warn('[FileSync] Could not delete download from server:', e)
    }
  } catch (err) {
    console.warn('[FileSync] Delete failed:', err)
  }
}

// ─── Verification engine for app startup ─────────────────────────────────────

/**
 * Ensures that if a material is marked as 'done', the file actually exists.
 * Also cleans up any 'downloading' states that were interrupted by a crash.
 */
export async function verifyDiskCacheConsistency(): Promise<void> {
  try {
    const materials = await database.collections
      .get('materials')
      .query(Q.where('download_status', Q.notEq('none')))
      .fetch()

    for (const material of materials as any[]) {
      // 1. Reset stuck downloads
      if (material.downloadStatus === 'downloading') {
        await database.write(async () => {
          await material.update((m: any) => { m.downloadStatus = 'none' })
        })
        continue
      }

      // 2. Verify file exists for 'done' materials
      if (material.downloadStatus === 'done' && material.localPath) {
        const info = await FileSystem.getInfoAsync(material.localPath)
        if (!info.exists) {
          await database.write(async () => {
            await material.update((m: any) => {
              m.localPath      = null
              m.cached         = false
              m.downloadStatus = 'none'
            })
          })
        }
      }
    }
  } catch (err) {
    console.warn('[FileSync] Consistency check failed:', err)
  }
}

// ─── Obsolete auto-fetcher removed per user feedback ──────────────────────────

export async function processMaterialDownloads(): Promise<void> {
  // Now handles only resuming explicitly interrupted downloads if desired, 
  // or simply calls the consistency check.
  await verifyDiskCacheConsistency()
}


