/**
 * supabase/functions/generate-quiz/index.ts
 *
 * Edge Function proxy for Anthropic API.
 * Keeps the API key server-side — never exposed in the app bundle.
 *
 * Deploy:
 *   supabase functions deploy generate-quiz
 *
 * Set secret:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */

// @ts-nocheck  — Deno globals are not in Node types; errors here are harmless in VS Code.
// To silence them: install the Deno VS Code extension and add
// { "deno.enablePaths": ["supabase/functions"] } to .vscode/settings.json

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    const response = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status:  response.status,
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: String(err) } }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status:  500,
      }
    )
  }
})
