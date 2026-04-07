import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { supabase } from '@/core/api/supabase'
import { lockAvatarRefetch } from '@/hooks/useProfileSync'
import { C } from '@/lib/colors'
import {
  AVATAR_LOCK_KEY,
  AVATAR_LOCK_TTL_MS,
  AVATAR_QUEUE_KEY,
  ANNOUNCEMENTS_KEY,
  DASHBOARD_CACHE_KEY,
} from '@/features/home/constants'
import type { Announcement, Deadline, Material, PendingAvatarUpload, Profile } from '@/features/home/types'

const AVATAR_MAX_RETRIES = 3
const AVATAR_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function priorityColor(priority: string): string {
  return priority === 'high' ? C.coral : priority === 'normal' ? C.sapphire : C.emerald
}

export function priorityBg(priority: string): string {
  return priority === 'high' ? C.coralDim : priority === 'normal' ? C.sapphDim : C.emerDim
}

export function safeParseDashboard(raw: string | null): any | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed?.profile?.full_name ? parsed : null
  } catch {
    return null
  }
}

export function safeParseAnnouncements(raw: string | null): Announcement[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function createNotificationsForNewMaterials(userId: string, materials: Material[], seenIds: Set<string>) {
  const newMaterials = materials.filter(material => !seenIds.has(material.id))
  if (!newMaterials.length) return

  await supabase.from('notifications').upsert(
    newMaterials.map(material => ({
      user_id: userId,
      title: 'New material available',
      body: `"${material.title}" has been added.`,
      is_read: false,
      material_id: material.id,
    })),
    { onConflict: 'user_id,material_id', ignoreDuplicates: true },
  )
}

export function parseDueDate(due: string): Date {
  if (!due) return new Date(8640000000000000)
  const iso = new Date(due)
  if (!isNaN(iso.getTime())) return iso
  const normalized = due.replace(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/, '$2 $1, $3')
  const fallback = new Date(normalized)
  return isNaN(fallback.getTime()) ? new Date(8640000000000000) : fallback
}

export function isOverdue(due: string) {
  return parseDueDate(due) < new Date(new Date().setHours(0, 0, 0, 0))
}

export function sortDeadlines(deadlines: Deadline[]) {
  return [...deadlines].sort((a, b) => parseDueDate(a.due_date).getTime() - parseDueDate(b.due_date).getTime())
}

export async function fetchDashboard(userId: string) {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, college_id, class_id, is_verified, bio, role')
    .eq('id', userId)
    .single()

  if (!profileData) return null

  const [collegeRes, classRes, subRes] = await Promise.all([
    profileData.college_id
      ? supabase.from('colleges').select('name, short_name').eq('id', profileData.college_id).single()
      : Promise.resolve({ data: null }),
    profileData.class_id
      ? supabase.from('classes').select('name').eq('id', profileData.class_id).single()
      : Promise.resolve({ data: null }),
    supabase.from('subscriptions').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle(),
  ])

  const isPremium = subRes.data != null
  const profile: Profile = {
    full_name: profileData.full_name,
    avatar_url: profileData.avatar_url,
    college_id: profileData.college_id,
    class_id: profileData.class_id,
    is_verified: profileData.is_verified === true || isPremium,
    is_premium: isPremium,
    bio: (profileData as any).bio ?? null,
    role: (profileData as any).role ?? null,
    college: collegeRes.data as any,
    class: classRes.data as any,
  }

  let materials: Material[] = []
  let totalMaterialCount = 0
  let courseCount = 0

  if (profileData.class_id || profileData.college_id) {
    const filters: string[] = []

    if (profileData.class_id) {
      const { data: courses } = await supabase.from('courses').select('id').eq('class_id', profileData.class_id)
      courseCount = courses?.length || 0
      if (courseCount > 0) {
        const courseIds = courses!.map((c: any) => c.id)
        filters.push(`course_id.in.(${courseIds.join(',')})`)
      }
    }

    if (profileData.college_id) {
      const { data: lecturers } = await supabase.from('lecturers').select('id').eq('college_id', profileData.college_id)
      if (lecturers && lecturers.length > 0) {
        const lecturerIds = lecturers.map((l: any) => l.id)
        filters.push(`lecturer_id.in.(${lecturerIds.join(',')})`)
      }
    }

    filters.push('and(course_id.is.null,lecturer_id.is.null)')
    const orString = filters.join(',')

    const [materialsRes, countRes] = await Promise.all([
      supabase.from('materials').select('id, title, type, file_url, created_at, courses(name)').or(orString).eq('status', 'published').order('created_at', { ascending: false }).limit(5),
      supabase.from('materials').select('id', { count: 'exact', head: true }).or(orString).eq('status', 'published'),
    ])

    materials = materialsRes.data || []
    totalMaterialCount = countRes.count ?? materials.length
  }

  return { profile, materials, stats: { total: totalMaterialCount, courses: courseCount } }
}

export async function fetchAnnouncements(classId: string | null, collegeId: string | null): Promise<Announcement[]> {
  if (!classId && !collegeId) return []
  const filters: string[] = []
  if (classId) filters.push(`class_id.eq.${classId}`)
  if (collegeId) filters.push(`college_id.eq.${collegeId}`)

  const [{ data: targeted }, { data: global }] = await Promise.all([
    supabase.from('announcements').select('id, title, body, image_url, created_at, priority').or(filters.join(',')).order('created_at', { ascending: false }).limit(5),
    supabase.from('announcements').select('id, title, body, image_url, created_at, priority').is('class_id', null).is('college_id', null).order('created_at', { ascending: false }).limit(3),
  ])

  const seen = new Set<string>()
  return [...(targeted || []), ...(global || [])]
    .filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, 5) as Announcement[]
}

export function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = clean.length
  const bytes = new Uint8Array(Math.floor(len * 3 / 4))
  let i = 0
  let j = 0
  while (i < len) {
    const a = lookup[clean.charCodeAt(i++)]
    const b = lookup[clean.charCodeAt(i++)]
    const c = lookup[clean.charCodeAt(i++)]
    const d = lookup[clean.charCodeAt(i++)]
    bytes[j++] = (a << 2) | (b >> 4)
    if (j < bytes.length) bytes[j++] = ((b & 0xf) << 4) | (c >> 2)
    if (j < bytes.length) bytes[j++] = ((c & 0x3) << 6) | d
  }
  return bytes
}

export async function retryPendingAvatarUpload(queryClient: { setQueryData: Function }): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AVATAR_QUEUE_KEY)
    if (!raw) return
    const pending: PendingAvatarUpload = JSON.parse(raw)
    if (Date.now() - pending.queuedAt > AVATAR_QUEUE_MAX_AGE_MS) {
      await AsyncStorage.removeItem(AVATAR_QUEUE_KEY).catch(() => {})
      return
    }
    if ((pending.retryCount ?? 0) >= AVATAR_MAX_RETRIES) {
      await AsyncStorage.removeItem(AVATAR_QUEUE_KEY).catch(() => {})
      Alert.alert('Upload failed', 'Could not upload your queued profile picture after several attempts.')
      return
    }
    let session: any
    try {
      const res = await supabase.auth.getSession()
      session = res.data?.session
    } catch {
      return
    }
    if (!session?.user || session.user.id !== pending.userId) return
    await AsyncStorage.setItem(AVATAR_QUEUE_KEY, JSON.stringify({ ...pending, retryCount: (pending.retryCount ?? 0) + 1 })).catch(() => {})
    if (!pending.base64) throw new Error('No image data in retry queue')
    const blob = base64ToBytes(pending.base64)
    const fileName = `${pending.userId}_${pending.queuedAt}.${pending.fileExt}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, blob, { contentType: `image/${pending.fileExt}`, upsert: true })
    if (uploadError) throw uploadError
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
    const newUrl = `${urlData.publicUrl}?t=${pending.queuedAt}`
    lockAvatarRefetch()
    await AsyncStorage.setItem(AVATAR_LOCK_KEY, String(Date.now())).catch(() => {})
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', pending.userId)
    queryClient.setQueryData(['dashboard', pending.userId], (old: any) => old ? { ...old, profile: { ...old.profile, avatar_url: newUrl } } : old)
    const cached = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY).then(result => result ? JSON.parse(result) : null).catch(() => null)
    if (cached) {
      await AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...cached, profile: { ...cached.profile, avatar_url: newUrl } })).catch(() => {})
    }
    await AsyncStorage.removeItem(AVATAR_QUEUE_KEY)
    Alert.alert('Avatar updated', 'Your profile picture was uploaded successfully.')
  } catch {}
}

export { ANNOUNCEMENTS_KEY, AVATAR_LOCK_TTL_MS }
