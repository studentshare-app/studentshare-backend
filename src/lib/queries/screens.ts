/**
 * lib/queries/screens.ts
 *
 * All Supabase query helpers used by the tab screens.
 * Centralised here so screens stay lean and logic is testable.
 *
 * CHANGES:
 *  S1  fetchCoursesByClass(classId)    — fetches courses for a class
 *  S2  fetchMyCoursesData(classId)     — returns { courses, className }
 *  S3  fetchAcademicYears(courseId, type) — ADDED: distinct academic years for a
 *      course filtered by material type (e.g. 'past_question')
 *  S4  fetchMaterials(...)             — ADDED: materials filtered by course,
 *      type, academic_year, and/or lecturer_id
 *  S5  fetchLecturers(courseId)        — ADDED: distinct lecturers who have
 *      uploaded slides for a course
 *  S6  fetchBooksMaterials(courseId)   — ADDED: all book materials for a course
 *  S7  MaterialRecord                  — ADDED: shared type used by S4 + S6
 *  S8  DownloadRecord                  — ADDED: shape of a downloads row + material join
 *  S9  fetchDownloads(userId)          — ADDED: all downloads for a user, newest first
 *  S10 BookmarkRecord                  — ADDED: shape of a bookmarks row + material join
 *  S11 fetchBookmarks(userId)          — ADDED: all bookmarks for a user, newest first
 */

import { supabase } from '../supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type TrendingItem = {
  query:            string
  search_count:     number
  is_college_trend: boolean
}

export type CourseRow = {
  id:          string
  name:        string
  code:        string
  description: string
}

/**
 * S7 — MaterialRecord
 * Shared shape returned by fetchMaterials and fetchBooksMaterials.
 */
export type MaterialRecord = {
  id:             string
  title:          string
  type:           string
  file_url:       string
  is_premium:     boolean
  created_at:     string
  academic_year:  string | null
  lecturer_id:    string | null
  download_count: number
  cover_url?:     string | null   // books only
}

/**
 * S8 — DownloadRecord
 * Shape of a row from the `downloads` table, joined with the related material.
 */
export type DownloadRecord = {
  id:            string
  downloaded_at: string
  user_id:       string
  material: {
    id:       string
    title:    string
    type:     string
    file_url: string
  }
}

/**
 * S10 — BookmarkRecord
 * Shape of a row from the `bookmarks` table, joined with the related material
 * and its course name.
 */
export type BookmarkRecord = {
  id:          string
  created_at:  string
  material_id: string
  material: {
    id:       string
    title:    string
    type:     string
    file_url: string
    courses:  { name: string } | null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Downloads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S9 — fetchDownloads
 * Returns all download records for a user, newest first.
 * Joins the related material so the screen has title, type, and file_url.
 */
export async function fetchDownloads(userId: string, collegeId?: string, classId?: string): Promise<DownloadRecord[]> {
  let query = supabase
    .from('downloads')
    .select(`
      id,
      downloaded_at,
      user_id,
      material:material_id!inner (
        id,
        title,
        type,
        file_url,
        course_id,
        courses!inner(class_id),
        courses!courses_class_fkey1!inner(classes(college_id, class_id))
      )
    `)
    .eq('user_id', userId)
    .order('downloaded_at', { ascending: false })

  if (collegeId) query = query.eq('material.courses.classes.college_id', collegeId)
  if (classId) query = query.eq('material.courses.class_id', classId)

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as DownloadRecord[]
}

export async function addDownload(userId: string, materialId: string) {
  const { error } = await supabase
    .from('downloads')
    .upsert({ user_id: userId, material_id: materialId, downloaded_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function removeDownload(userId: string, materialId: string) {
  const { error } = await supabase
    .from('downloads')
    .delete()
    .eq('user_id', userId)
    .eq('material_id', materialId)
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookmarks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S11 — fetchBookmarks
 * Returns all bookmark records for a user, newest first.
 * Joins the related material (+ course name) so the screen has everything
 * it needs to render each card without extra queries.
 */
export async function fetchBookmarks(userId: string): Promise<BookmarkRecord[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select(`
      id,
      created_at,
      material_id,
      material:material_id (
        id,
        title,
        type,
        file_url,
        courses ( name )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BookmarkRecord[]
}

export async function fetchBookmarkedIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('bookmarks')
    .select('material_id')
    .eq('user_id', userId)
  return new Set((data ?? []).map((b: any) => b.material_id as string))
}

export async function addBookmark(userId: string, materialId: string) {
  await supabase
    .from('bookmarks')
    .upsert({ user_id: userId, material_id: materialId })
}

export async function removeBookmark(userId: string, materialId: string) {
  await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('material_id', materialId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Courses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S1 — fetchCoursesByClass
 * Fetches all courses belonging to a class.
 */
export async function fetchCoursesByClass(classId: string): Promise<CourseRow[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, name, code, description')
    .eq('class_id', classId)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as CourseRow[]
}

/**
 * S2 — fetchMyCoursesData
 * Fetches courses + class name for the My Courses screen.
 */
export async function fetchMyCoursesData(classId: string): Promise<{
  courses:   CourseRow[]
  className: string
}> {
  const [coursesRes, classRes] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name, code, description')
      .eq('class_id', classId)
      .order('name', { ascending: true }),
    supabase
      .from('classes')
      .select('name')
      .eq('id', classId)
      .single(),
  ])

  if (coursesRes.error) throw new Error(coursesRes.error.message)

  return {
    courses:   (coursesRes.data ?? []) as CourseRow[],
    className: (classRes.data as any)?.name ?? '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Academic Years
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S3 — fetchAcademicYears
 *
 * Returns a sorted, deduplicated list of academic year strings for a given
 * course and material type (e.g. 'past_question', 'tutorial').
 */
export async function fetchAcademicYears(
  courseId: string,
  type: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('academic_year')
    .eq('course_id', courseId)
    .eq('type', type)
    .eq('status', 'published')
    .not('academic_year', 'is', null)

  if (error) throw new Error(error.message)

  const unique = [...new Set((data ?? []).map((r: any) => r.academic_year as string))]
  return unique.sort((a, b) => b.localeCompare(a))
}

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S4 — fetchMaterials
 *
 * Returns published materials for a course, optionally filtered by:
 *   - type          (e.g. 'past_question', 'slide', 'tutorial')
 *   - academicYear  (e.g. '2023/2024') — used by past questions & tutorials
 *   - lecturerId    — used by slides
 */
export async function fetchMaterials({
  courseId,
  type,
  academicYear,
  lecturerId,
}: {
  courseId:     string
  type:         string
  academicYear?: string
  lecturerId?:  string
}): Promise<MaterialRecord[]> {
  let query = supabase
    .from('materials')
    .select('id, title, type, file_url, is_premium, created_at, academic_year, lecturer_id, download_count')
    .eq('course_id', courseId)
    .eq('status', 'published')

  if (type)         query = query.eq('type', type)
  if (academicYear) query = query.eq('academic_year', academicYear)
  if (lecturerId)   query = query.eq('lecturer_id', lecturerId)

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as MaterialRecord[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturers  (for Slides flow)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S5 — fetchLecturers
 *
 * Returns distinct lecturers who have published slide materials for a course.
 */
export async function fetchLecturers(
  courseId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('lecturers')
    .select('id, name')
    .eq('course_id', courseId)
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as { id: string; name: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Books
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S6 — fetchBooksMaterials
 *
 * Returns all published book materials for a course, including cover_url.
 */
export async function fetchBooksMaterials(courseId: string): Promise<MaterialRecord[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('id, title, type, file_url, is_premium, created_at, academic_year, lecturer_id, download_count, cover_url')
    .eq('course_id', courseId)
    .eq('type', 'book')
    .eq('status', 'published')
    .order('title', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as MaterialRecord[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Search history
// ─────────────────────────────────────────────────────────────────────────────
const MAX_HISTORY = 10

export async function fetchSearchHistory(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('search_history')
    .select('queries')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.queries as string[]) ?? []
}

export async function saveSearchHistory(userId: string, query: string): Promise<void> {
  const existing = await fetchSearchHistory(userId)
  const updated  = [query, ...existing.filter(q => q !== query)].slice(0, MAX_HISTORY)
  await supabase
    .from('search_history')
    .upsert({ user_id: userId, queries: updated }, { onConflict: 'user_id' })
}

export async function clearSearchHistory(userId: string): Promise<void> {
  await supabase
    .from('search_history')
    .upsert({ user_id: userId, queries: [] }, { onConflict: 'user_id' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Search logging
// ─────────────────────────────────────────────────────────────────────────────
export async function logSearch(
  userId:    string,
  query:     string,
  collegeId: string | null,
): Promise<void> {
  if (!query.trim() || query.trim().length < 2) return
  try {
    await supabase.from('search_logs').insert({
      user_id:    userId,
      college_id: collegeId ?? null,
      query:      query.trim().toLowerCase(),
    })
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trending searches
// ─────────────────────────────────────────────────────────────────────────────
const TRENDING_FALLBACK: TrendingItem[] = [
  { query: 'DSA past questions',     search_count: 0, is_college_trend: false },
  { query: 'Machine learning notes', search_count: 0, is_college_trend: false },
  { query: 'Database SQL tutorial',  search_count: 0, is_college_trend: false },
  { query: 'Linear algebra book',    search_count: 0, is_college_trend: false },
  { query: 'OS Tanenbaum',           search_count: 0, is_college_trend: false },
]

export async function fetchTrendingSearches(
  collegeId: string | null,
): Promise<TrendingItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_trending_searches', {
      p_college_id:  collegeId,
      p_limit:       5,
      p_min_results: 3,
    })
    if (error) throw error
    const rows = (data ?? []) as TrendingItem[]
    return rows.length > 0 ? rows : TRENDING_FALLBACK
  } catch {
    return TRENDING_FALLBACK
  }
}
