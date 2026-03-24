import { supabase } from '../supabase'

export async function fetchProfile(userId: string) {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, college_id, class_id')
    .eq('id', userId)
    .single()
  if (!profileData?.college_id) return { ...profileData, college: null, class: null }

  const [{ data: college }, { data: cls }] = await Promise.all([
    supabase.from('colleges').select('name, short_name').eq('id', profileData.college_id).single(),
    supabase.from('classes').select('name').eq('id', profileData.class_id).single(),
  ])

  return { ...profileData, college, class: cls }
}

export async function fetchHomeStats(classId: string) {
  const { data: courses } = await supabase
    .from('courses').select('id').eq('class_id', classId)
  if (!courses || courses.length === 0) return { materials: [], courses: 0 }

  const courseIds = courses.map(c => c.id)
  const { data: materials } = await supabase
    .from('materials')
    .select('id, title, type, file_url, created_at, courses(name)')
    .in('course_id', courseIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(5)

  return { materials: materials || [], courses: courses.length }
}