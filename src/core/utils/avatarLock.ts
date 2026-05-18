// ── Avatar Lock ─────────────────────────────────────────────────────
// Extracted to avoid circular dependencies between api/home and hooks/useProfileSync

let avatarUploadLockUntil = 0

export function lockAvatarRefetch() {
  avatarUploadLockUntil = Date.now() + 8000
}

export function isAvatarRefetchLocked() {
  return Date.now() < avatarUploadLockUntil
}
