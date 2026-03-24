import { supabase } from '../supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────
export type Conversation = {
  id: string
  title: string
  material_title?: string
  file_url?: string
  updated_at: string
  last_message?: string
}

function mergeConversations(local: Conversation[], remote: any[]): Conversation[] {
  const remoteIds = new Set(remote.map(r => r.id))
  const localOnly = local.filter(l => !remoteIds.has(l.id))
  const merged = [
    ...remote.map(r => ({
      id: r.id,
      title: r.title,
      material_title: r.material_title,
      file_url: r.file_url,
      updated_at: r.updated_at,
      last_message: r.last_message,
    })),
    ...localOnly,
  ]
  merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  return merged
}

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  // Always read local first so offline works immediately
  const raw = await AsyncStorage.getItem('conversations')
  const local: Conversation[] = raw ? JSON.parse(raw) : []

  try {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (data && data.length > 0) {
      const merged = mergeConversations(local, data)
      // Keep AsyncStorage in sync so next offline load is fresh
      await AsyncStorage.setItem('conversations', JSON.stringify(merged))
      return merged
    }
  } catch {
    // Network failure — fall through to local data
  }

  local.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  return local
}