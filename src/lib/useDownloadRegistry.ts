/**
 * lib/useDownloadRegistry.ts
 *
 * Single source of truth for "which material IDs has the user downloaded?"
 *
 * HOW IT WORKS
 * ─────────────
 * • A module-level Set<string> (`registeredIds`) tracks every material_id
 *   whose file currently exists on-device AND has a live downloads row in
 *   Supabase.
 * • A tiny EventEmitter lets any screen subscribe to changes without React
 *   Context, Redux, or prop-drilling.
 * • AsyncStorage is used to persist the set across app restarts so the
 *   registry is instantly available before the first network call.
 *
 * API
 * ────
 *   registryAdd(materialId)     – called after a successful download
 *   registryRemove(materialId)  – called after deletion in downloads.tsx
 *   registryHas(materialId)     – synchronous check used by other screens
 *   useDownloadRegistry()       – React hook; returns { downloadedIds, add, remove }
 *
 * GUARANTEE
 * ──────────
 * When downloads.tsx deletes a file it calls registryRemove().
 * Every other screen that calls useDownloadRegistry() will re-render with
 * the updated set in the same JS event loop tick — no polling, no focus
 * effect needed for this specific flag.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

// ── Persistence key ────────────────────────────────────────────────────────
const STORAGE_KEY = 'download_registry_v1'

// ── Module-level state (shared across all hook instances) ──────────────────
let registeredIds: Set<string> = new Set()
let hydrated = false

type Listener = (ids: Set<string>) => void
const listeners = new Set<Listener>()

function notify() {
  const snapshot = new Set(registeredIds)
  listeners.forEach(fn => fn(snapshot))
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...registeredIds]))
  } catch {}
}

// ── Public imperative API (safe to call outside React) ─────────────────────

export function registryAdd(materialId: string) {
  registeredIds.add(materialId)
  notify()
  persist()
}

export function registryRemove(materialId: string) {
  registeredIds.delete(materialId)
  notify()
  persist()
}

export function registryHas(materialId: string): boolean {
  return registeredIds.has(materialId)
}

/** Replace the entire set (used on initial load from Supabase) */
export function registrySetAll(materialIds: string[]) {
  registeredIds = new Set(materialIds)
  hydrated = true
  notify()
  persist()
}

// ── Hydrate from AsyncStorage on first import ─────────────────────────────
;(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      const ids: string[] = JSON.parse(raw)
      ids.forEach(id => registeredIds.add(id))
      hydrated = true
      notify()
    }
  } catch {}
})()

// ── React hook ────────────────────────────────────────────────────────────

export function useDownloadRegistry() {
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(
    () => new Set(registeredIds)
  )

  useEffect(() => {
    // Sync with any updates that happened before mount
    setDownloadedIds(new Set(registeredIds))

    const listener: Listener = snapshot => setDownloadedIds(snapshot)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return {
    downloadedIds,
    /** Mark a material as downloaded — persists cross-session */
    add: registryAdd,
    /** Mark a material as removed — all screens re-render immediately */
    remove: registryRemove,
    /** Synchronous point-in-time check */
    has: registryHas,
  }
}
