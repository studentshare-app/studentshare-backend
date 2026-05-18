const assert = require('node:assert/strict')
const crypto = require('crypto')
const request = require('supertest')
const mock = require('mock-require')

function mockSupabaseClient() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => ({ data: null, error: null }),
    insert: () => chain,
    update: () => chain,
  }
  return {
    from: () => chain,
  }
}

function buildApp() {
  mock('@supabase/supabase-js', {
    createClient: () => mockSupabaseClient(),
  })
  delete require.cache[require.resolve('../server')]
  const { app } = require('../server')
  mock.stopAll()
  return app
}

async function run() {
  process.env.NODE_ENV = 'production'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  process.env.ADMIN_SECRET = 'top-secret'
  process.env.MONIME_ACCESS_TOKEN = 'monime-token'
  process.env.MONIME_SPACE_ID = 'space-id'
  process.env.MONIME_WEBHOOK_SECRET = 'webhook-secret'
  process.env.ALLOWED_ORIGINS = 'https://admin.studentshare.app'

  const app = buildApp()

  const createCheckout = await request(app)
    .post('/api/create-checkout')
    .send({ userId: 'bad-id', plan: 'monthly' })
  assert.equal(createCheckout.status, 400)

  const approveNoSecret = await request(app)
    .post('/api/approve')
    .send({ subscription_id: '11111111-1111-1111-1111-111111111111' })
  assert.equal(approveNoSecret.status, 403)

  const webhookNoSig = await request(app)
    .post('/api/monime-webhook')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event: { name: 'checkout_session.completed' }, data: { metadata: {} } }))
  assert.equal(webhookNoSig.status, 401)

  const payload = JSON.stringify({ event: { name: 'checkout_session.completed' }, data: { metadata: {} } })
  const badSig = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex')
  const webhookBadSig = await request(app)
    .post('/api/monime-webhook')
    .set('Content-Type', 'application/json')
    .set('monime-signature', badSig)
    .send(payload)
  assert.equal(webhookBadSig.status, 401)

  console.log('Backend integration checks passed')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
