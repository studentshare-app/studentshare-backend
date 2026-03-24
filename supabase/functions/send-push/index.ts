// supabase/functions/send-push/index.ts
//
// Triggered via a Supabase Database Webhook on notifications INSERT.
// Reads the user's Expo push token and calls Expo's push API.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

Deno.serve(async (req) => {
  try {
    const payload = await req.json()

    // Database webhook sends: { type, table, record, old_record }
    const record = payload.record
    if (!record) {
      return new Response('No record', { status: 400 })
    }

    const { user_id, title, body, type, metadata } = record

    if (!user_id || !title || !body) {
      return new Response('Missing fields', { status: 400 })
    }

    // Init Supabase client with service role to bypass RLS
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get user's push token(s)
    const { data: tokens, error } = await sb
      .from('push_tokens')
      .select('token')
      .eq('user_id', user_id)

    if (error || !tokens || tokens.length === 0) {
      // No token — user hasn't enabled push or not on a real device
      return new Response('No push token for user', { status: 200 })
    }

    // Build Expo push messages
    const messages = tokens.map((t: { token: string }) => ({
      to:    t.token,
      title,
      body,
      sound: 'default',
      data:  { type, metadata: metadata ?? {} },
      channelId: (type === 'deadline_reminder' || type === 'deadline_due')
        ? 'deadlines'
        : 'default',
    }))

    // Send to Expo push service
    const expoRes = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })

    const expoData = await expoRes.json()
    console.log('Expo push response:', JSON.stringify(expoData))

    // Log any delivery errors
    if (expoData.data) {
      for (const result of expoData.data) {
        if (result.status === 'error') {
          console.error('Push error:', result.message, result.details)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, results: expoData }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})