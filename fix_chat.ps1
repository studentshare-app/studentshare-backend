$path = "e:\StudentShare\src\features\chat\screens\StudentMessageScreen.tsx"
$content = Get-Content -Path $path -Raw
# The corruption is from 'function avatarColor(id: string) {' to the end of the broken 'uploadFile'
# We'll use a regex to replace the whole mess between line 67 and line 77 area.
$before = $content.Substring(0, $content.IndexOf("function avatarColor(id: string) {"))
$afterStart = $content.IndexOf("async function downloadAndOpen(fileUrl: string, fileName: string) {")
$after = $content.Substring($afterStart)

$newHelpers = @"
function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(n: string) {
  if (!n || n === 'Unknown') return '?'
  const parts = n.trim().split(/\s+/).filter(Boolean)
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtDate(iso: string) {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
function fmtSize(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function fmtDur(ms: number) {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function safeName(n: string | null | undefined): string {
  if (!n || n === 'undefined' || n === 'null' || n.trim() === '') return 'Unknown'
  return n.trim()
}
function safeContent(c: string | null | undefined): string | null {
  if (!c || c === 'undefined' || c === 'null') return null
  return c
}
function safeAvatarUri(uri: string | null | undefined): string | null {
  if (!uri || !uri.startsWith('http')) return null
  return uri
}
function getMime(n: string): string {
  const ext = n.split('.').pop()?.toLowerCase()
  const m: Record<string, string> = {
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/m4a', zip: 'application/zip',
  }
  return m[ext ?? ''] ?? 'application/octet-stream'
}
function cacheKey(convId: string) { return `@chat_cache_${convId}` }

// ─────────────────────────────────────────────────────────────────────────────
// FIX #4: normMsg lives OUTSIDE the component so realtime callbacks never
//         capture a stale closure.
// ─────────────────────────────────────────────────────────────────────────────
function normMsg(raw: any, uid: string): StudentMessage {
  const rm: Record<string, { count: number; by_me: boolean; user_ids: string[] }> = {}
  ;(raw.reactions ?? []).forEach((r: any) => {
    if (!rm[r.emoji]) rm[r.emoji] = { count: 0, by_me: false, user_ids: [] }
    rm[r.emoji].count++
    rm[r.emoji].user_ids.push(r.user_id)
    if (r.user_id === uid) rm[r.emoji].by_me = true
  })
  const msg: StudentMessage = {
    id: raw.id,
    conversation_id: raw.conversation_id,
    sender_id: raw.sender_id,
    type: raw.type,
    content: safeContent(raw.content),
    file_url: raw.file_url ?? null,
    file_name: raw.file_name ?? null,
    file_size: raw.file_size ?? null,
    mime_type: raw.mime_type ?? null,
    reply_to_id: raw.reply_to_id ?? null,
    is_deleted: raw.is_deleted ?? false,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    sender_name: safeName(raw.sender?.full_name),
    sender_avatar: safeAvatarUri(raw.sender?.avatar_url),
    reactions: Object.entries(rm).map(([emoji, v]) => ({ emoji, ...v })),
    reply_to: null,
  }
  if (raw.voice_duration_ms != null) {
    ;(msg as any).voice_duration_ms = raw.voice_duration_ms
  }
  return msg
}

async function loadCachedMessages(convId: string): Promise<StudentMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(convId))
    if (!raw) return []
    return JSON.parse(raw) as StudentMessage[]
  } catch {
    return []
  }
}
async function saveMessagesToCache(convId: string, msgs: StudentMessage[]) {
  try {
    const toStore = msgs.slice(-200)
    await AsyncStorage.setItem(cacheKey(convId), JSON.stringify(toStore))
  } catch {
  }
}

async function uploadFile(
  bucket: string, fileName: string, localUri: string, contentType: string,
): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  })
  const binary = globalThis.atob
    ? globalThis.atob(b64)
    : Buffer.from(b64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, bytes.buffer as ArrayBuffer, { contentType, upsert: false })
  if (error) throw new Error(error.message)
  return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl
}

"@

$finalContent = $before + $newHelpers + $after
[System.IO.File]::WriteAllText($path, $finalContent, [System.Text.Encoding]::UTF8)
