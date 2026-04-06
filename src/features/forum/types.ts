// forum/types.ts — single source of truth for all forum types

export type Post = {
  id: string
  isSeed?: boolean
  type: 'normal' | 'repost' | 'poll' | 'quote'
  repostedBy?: string
  authorId?: string
  name: string
  handle: string
  verified: boolean
  time: string
  avatar: string
  avatarGrad: [string, string]
  avatarUri: string | null
  text: string
  poll?: { label: string; pct: number; votes?: number; winning?: boolean }[]
  pollMeta?: string
  pollVoted?: boolean          // true once current user has voted
  quote?: { name: string; handle: string; avatarGrad: [string, string]; text: string }
  imageUrl?: string | null
  replies: number
  reposts: number
  likes: number
  views: string | number
  bookmarks: number
  liked: boolean
  reposted: boolean
  bookmarked: boolean
}

export type Reply = {
  id: string
  postId: string
  authorId?: string
  name: string
  handle: string
  initials: string
  grad: readonly [string, string]
  avatarUri?: string | null
  verified: boolean
  text: string
  imageUrl?: string | null
  likes: number
  liked?: boolean
  time: string
}

export type Notif = {
  id: string
  type: string
  actorName: string
  actorHandle: string
  actorInitials: string
  actorGrad: [string, string]
  actorAvatar: string | null
  postPreview: string | null
  read: boolean
  time: string
}

export type UserProfile = {
  userId: string
  name: string
  handle: string
  initials: string
  grad: [string, string]
  avatarUri: string | null
  collegeId: string | null
  classId: string | null
  verified: boolean
}