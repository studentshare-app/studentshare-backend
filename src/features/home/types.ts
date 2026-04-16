// features/home/types.ts
import type { Ionicons } from '@expo/vector-icons'

export type Profile = {
  full_name: string
  avatar_url: string | null
  college_id: string | null
  class_id: string | null
  is_verified: boolean
  is_premium: boolean
  bio: string | null
  role: string | null
  college: { name: string; short_name: string } | null
  class: { name: string } | null
}

export type DashboardStats = {
  total: number
  courses: number
  college_rank: number | null
  global_rank?: number | null
  total_points?: number
  shared_materials_count?: number
}

export type DashboardData = {
  profile: Profile
  materials: Material[]
  stats: DashboardStats
}

export type Material = {
  id: string
  title: string
  type: string
  file_url: string
  created_at: string
  courses: any
}

export type Announcement = {
  id: string
  title: string
  body: string
  image_url?: string | null
  created_at: string
  priority: 'high' | 'normal' | 'low'
}

export type Deadline = {
  id: string
  title: string
  due_date: string
  course: string
  color: string
}

export type IoniconName = React.ComponentProps<typeof Ionicons>['name']

export type PendingAvatarUpload = {
  localUri: string
  base64?: string
  fileExt: string
  userId: string
  queuedAt: number
  retryCount?: number
}

// ✅ C4: ScheduleItem removed — HomeScheduleItem in useStudyPlannerSnapshot.ts
// is the authoritative schedule shape. Import from there directly:
// import type { HomeScheduleItem } from '@/features/home/hooks/useStudyPlannerSnapshot'

export type DashCard = {
  id: string
  emoji: string
  title: string
  sub: string
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  borderColor: string
  glowColor: string
  onPress: () => void
}

export type GradeEntry = {
  id: string
  subject: string
  score: string
  weight: string
}