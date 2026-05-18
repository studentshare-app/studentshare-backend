function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function loadEnv() {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase()
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  const env = {
    nodeEnv,
    port: process.env.PORT || 3000,
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    adminSecret: requireEnv('ADMIN_SECRET'),
    monimeAccessToken: requireEnv('MONIME_ACCESS_TOKEN'),
    monimeSpaceId: requireEnv('MONIME_SPACE_ID'),
    monimeWebhookSecret: process.env.MONIME_WEBHOOK_SECRET || '',
    backendUrl: process.env.BACKEND_URL || 'https://studentshare-backend.onrender.com',
    allowedOrigins,
  }

  if (env.nodeEnv === 'production' && env.allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS must be set in production')
  }

  if (env.nodeEnv === 'production' && !env.monimeWebhookSecret) {
    throw new Error('MONIME_WEBHOOK_SECRET must be set in production')
  }

  return env
}

module.exports = { loadEnv }
