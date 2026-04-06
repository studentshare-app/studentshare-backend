import { C } from '@/lib/colors'

export const MOTIVATIONS = [
  { quote: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { quote: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { quote: "Believe you can and you're halfway there.", author: 'Theodore Roosevelt' },
  { quote: 'Education is the most powerful weapon you can use to change the world.', author: 'Nelson Mandela' },
  { quote: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
  { quote: 'Push yourself, because no one else is going to do it for you.', author: 'Unknown' },
  { quote: 'Great things never come from comfort zones.', author: 'Unknown' },
  { quote: 'Dream it. Believe it. Build it.', author: 'Unknown' },
  { quote: 'Study hard, for the well is deep and our brains are shallow.', author: 'Richard Baxter' },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: 'Sam Levenson' },
  { quote: 'The beautiful thing about learning is that nobody can take it away from you.', author: 'B.B. King' },
]

export const DEADLINE_COLORS = [C.sapphire, C.lavender, C.emerald, C.gold, C.coral, C.pink]
export const DEADLINES_KEY = 'studentshare_deadlines'
export const DASHBOARD_CACHE_KEY = 'studentshare_dashboard_cache'
export const DASH_CUSTOM_CARDS_KEY = 'studentshare_dashboard_custom_cards'
export const ANNOUNCEMENTS_KEY = 'studentshare_announcements_cache'
export const SEEN_MATERIALS_KEY = 'studentshare_seen_material_ids'
export const AVATAR_QUEUE_KEY = 'studentshare_avatar_upload_queue'
export const AVATAR_LOCK_KEY = 'studentshare_avatar_refetch_lock'
export const AVATAR_LOCK_TTL_MS = 60_000
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
