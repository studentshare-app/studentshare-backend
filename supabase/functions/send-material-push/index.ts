// supabase/functions/send-material-push/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const CHUNK_SIZE    = 100

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

serve(async (req: Request) => {
  try {
    const {
      material_id,
      title,
      course_id,
      class_id,
      uploaded_by,
    } = await req.json()

    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id is required' }), { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Step 1: Get college_id from course ───────────────────────────────
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('college_id')
      .eq('id', course_id)
      .single()

    if (courseError || !course) {
      console.error('[send-material-push] Course not found:', courseError)
      return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404 })
    }

    const college_id = course.college_id

    // ── Step 2: Get push tokens for matching users ────────────────────────
    let query = supabase
      .from('push_tokens')
      .select('token, profiles!inner(id, college_id, class_id)')
      .eq('profiles.college_id', college_id)
      .neq('profiles.id', uploaded_by)

    if (class_id) {
      query = query.eq('profiles.class_id', class_id)
    }

    const { data: tokenRows, error: tokenError } = await query

    if (tokenError) {
      console.error('[send-material-push] Token fetch error:', tokenError)
      return new Response(JSON.stringify({ error: tokenError.message }), { status: 500 })
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.log('[send-material-push] No push tokens found.')
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    const tokens = tokenRows.map((r: any) => r.token).filter(Boolean)

    // ── Step 3: Build and send Expo push messages ─────────────────────────
    const messages = tokens.map((token: string) => ({
      to:       token,
      title:    '📚 New Material Added',
      body:     `"${title}" has been uploaded${class_id ? ' in your class' : ' in your college'}.`,
      sound:    'default',
      data: {
        type:        'material_upload',
        material_id: material_id,
        course_id:   course_id,
        class_id:    class_id ?? null,
        college_id:  college_id,
      },
      channelId: 'default',
    }))

    const batches  = chunkArray(messages, CHUNK_SIZE)
    let totalSent  = 0

    for (const batch of batches) {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: JSON.stringify(batch),
      })

      if (!res.ok) {
        console.error('[send-material-push] Expo API error:', await res.text())
        continue
      }

      const result = await res.json()
      console.log('[send-material-push] Expo response:', JSON.stringify(result))
      totalSent += batch.length
    }

    return new Response(JSON.stringify({ sent: totalSent }), { status: 200 })

  } catch (err) {
    console.error('[send-material-push] Unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})