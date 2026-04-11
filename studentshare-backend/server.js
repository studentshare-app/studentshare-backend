require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const helmet = require('helmet')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.set('trust proxy', 1) // trust Render's proxy

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS — lock to your app's origins only ───────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman in dev)
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.length === 0) return callback(null, true) // dev fallback
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
}))

// ─── Raw body for webhook (must be before express.json) ───────────────────────
app.use('/api/monime-webhook', express.raw({ type: '*/*' }))
app.use(express.json({ limit: '16kb' })) // prevent large payload attacks

// ─── Supabase — use SERVICE ROLE key server-side (bypasses RLS safely) ────────
// NEVER use SUPABASE_ANON_KEY on the server — it leaks client-level permissions.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ← changed from SUPABASE_ANON_KEY
)

// ─── Rate limiters ────────────────────────────────────────────────────────────

// Subscribe: max 5 attempts per IP per hour (prevents subscription spam)
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many subscription attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// General API: max 60 requests per IP per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Admin routes: max 20 per IP per minute (they're internal but still protected)
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many admin requests.' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(generalLimiter)

// ─── Admin auth middleware ─────────────────────────────────────────────────────
// Secret is now read from the x-admin-secret HEADER (not body/query string)
// This keeps it out of server logs and browser history.
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret']
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' })
  }
  next()
}

// ─── Input validators ─────────────────────────────────────────────────────────
const VALID_PLANS = ['monthly', 'termly', 'yearly']
const VALID_PAYMENT_METHODS = ['mobile_money', 'bank_transfer', 'cash']

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

function isValidPhone(str) {
  return /^\+?[0-9\s\-]{7,20}$/.test(str)
}

const PLANS = {
  monthly: { name: 'Monthly', days: 30,  price: 10  },
  termly:  { name: 'Termly',  days: 120, price: 25  },
  yearly:  { name: 'Yearly',  days: 365, price: 100 },
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/subscribe
app.post('/api/subscribe', subscribeLimiter, async (req, res) => {
  const { user_id, plan, phone, payment_method, amount } = req.body

  // Validate all inputs before touching the database
  if (!user_id || !plan || !phone || !payment_method) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!isValidUUID(user_id)) {
    return res.status(400).json({ error: 'Invalid user_id' })
  }
  if (!VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be monthly, termly, or yearly.' })
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' })
  }
  if (payment_method && !VALID_PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' })
  }

  const planInfo = PLANS[plan]
  const safeAmount = typeof amount === 'number' && amount > 0 ? amount : planInfo.price

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id,
      plan,
      phone,
      payment_method,
      amount: safeAmount,
      currency: 'NLE',
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, subscription_id: data.id })
})

// POST /api/approve — admin only, secret via header
app.post('/api/approve', adminLimiter, requireAdmin, async (req, res) => {
  const { subscription_id } = req.body

  if (!subscription_id || !isValidUUID(subscription_id)) {
    return res.status(400).json({ error: 'Invalid subscription_id' })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscription_id)
    .single()

  if (!sub) return res.status(404).json({ error: 'Subscription not found' })
  if (!PLANS[sub.plan]) return res.status(400).json({ error: 'Unknown plan on subscription' })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + PLANS[sub.plan].days)

  await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      approved_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', subscription_id)

  await supabase
    .from('profiles')
    .update({
      is_premium: true,
      premium_plan: sub.plan,
      premium_expires_at: expiresAt.toISOString(),
    })
    .eq('id', sub.user_id)

  res.json({ success: true, expires_at: expiresAt.toISOString() })
})

// POST /api/reject — admin only, secret via header
app.post('/api/reject', adminLimiter, requireAdmin, async (req, res) => {
  const { subscription_id } = req.body

  if (!subscription_id || !isValidUUID(subscription_id)) {
    return res.status(400).json({ error: 'Invalid subscription_id' })
  }

  await supabase
    .from('subscriptions')
    .update({ status: 'rejected' })
    .eq('id', subscription_id)

  res.json({ success: true })
})

// GET /api/subscription/:user_id
app.get('/api/subscription/:user_id', async (req, res) => {
  const { user_id } = req.params

  if (!isValidUUID(user_id)) {
    return res.status(400).json({ error: 'Invalid user_id' })
  }

  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return res.json({ active: false })

  const now = new Date()
  const expiresAt = new Date(data.expires_at)

  if (now > expiresAt) {
    await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', data.id)
    await supabase.from('profiles').update({ is_premium: false }).eq('id', user_id)
    return res.json({ active: false, reason: 'expired' })
  }

  res.json({
    active: true,
    plan: data.plan,
    expires_at: data.expires_at,
    days_remaining: Math.ceil((expiresAt - now) / 86400000),
  })
})

// GET /api/pending — admin only, secret via header
app.get('/api/pending', adminLimiter, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/all-subscriptions — admin only, secret via header
app.get('/api/all-subscriptions', adminLimiter, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})
// POST /api/create-checkout — creates a Monime checkout session
app.post('/api/create-checkout', generalLimiter, async (req, res) => {
  const { plan, userId, userEmail, userName } = req.body

  if (!userId || !plan) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!isValidUUID(userId)) {
    return res.status(400).json({ error: 'Invalid userId' })
  }

  const MONIME_PLANS = {
    monthly:       { name: 'Monthly Plan',       price: 2500,  days: 30  },
    academic_year: { name: 'Academic Year Plan', price: 15000, days: 270 },
    yearly:        { name: 'Yearly Plan',        price: 30000, days: 365 },
  }

  const planInfo = MONIME_PLANS[plan]
  if (!planInfo) {
    return res.status(400).json({ error: 'Invalid plan' })
  }

  try {
    // 1. Create subscription record in pending state
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan,
        status: 'pending',
        amount: planInfo.price / 100,
        currency: 'SLE',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (subError) throw new Error(subError.message)

    // 2. Create Monime checkout session
    const idempotencyKey = `sub_${sub.id}_${Date.now()}`
    const backendUrl = process.env.BACKEND_URL || 'https://studentshare-backend.onrender.com'

    const monimeRes = await fetch(`https://api.monime.io/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MONIME_ACCESS_TOKEN}`,
        'Monime-Space-Id': process.env.MONIME_SPACE_ID,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        name: `StudentShare ${planInfo.name}`,
        description: `Premium subscription for ${userName || userEmail || 'student'}`,
        reference: sub.id,
        successUrl: `${backendUrl}/payment-success?sub=${sub.id}`,
        cancelUrl: `${backendUrl}/payment-cancel?sub=${sub.id}`,
        lineItems: [
          {
            name: planInfo.name,
            type: 'custom',
            quantity: 1,
            price: {
              currency: 'SLE',
              value: planInfo.price,
            },
          },
        ],
        paymentOptions: {
          card:   { disable: true },
          bank:   { disable: true },
          momo:   { disable: false },
          wallet: { disable: true },
        },
        brandingOptions: {
          primaryColor: '#F59E0B',
        },
        metadata: {
          userId,
          plan,
          subscriptionId: sub.id,
        },
      }),
    })

    const monimeData = await monimeRes.json()
    if (!monimeRes.ok) {
      throw new Error(monimeData?.message || 'Monime checkout creation failed')
    }

    // 3. Store monime session ID on subscription
    await supabase
      .from('subscriptions')
      .update({ monime_session_id: monimeData.result.id })
      .eq('id', sub.id)

    res.json({
      checkoutUrl: monimeData.result.redirectUrl,
      sessionId: monimeData.result.id,
      subscriptionId: sub.id,
    })

  } catch (err) {
    console.error('[create-checkout]', err)
    res.status(500).json({ error: err.message || 'Failed to create checkout' })
  }
})

// POST /api/monime-webhook — receives Monime payment events
app.post('/api/monime-webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const body = req.body.toString('utf8')
    const event = JSON.parse(body)
    const eventName = event.event?.name
    const session = event.data

    console.log('[Monime Webhook]', eventName, session?.id)

    if (eventName !== 'checkout_session.completed') {
      return res.json({ received: true })
    }

    const userId = session?.metadata?.userId
    const plan = session?.metadata?.plan
    const monimeSessionId = session?.id

    if (!userId || !plan) {
      console.error('[Webhook] Missing userId or plan in metadata', session?.metadata)
      return res.status(400).json({ error: 'Missing metadata' })
    }

    const MONIME_PLANS = {
      monthly:       { days: 30  },
      academic_year: { days: 270 },
      yearly:        { days: 365 },
    }

    const planInfo = MONIME_PLANS[plan]
    if (!planInfo) return res.status(400).json({ error: 'Unknown plan' })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + planInfo.days)

    // Find subscription by monime session ID
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('monime_session_id', monimeSessionId)
      .single()

    if (sub?.id) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          approved_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', sub.id)
    }

    // Always update profile directly using userId from metadata
    await supabase
      .from('profiles')
      .update({
        is_premium: true,
        premium_plan: plan,
        premium_expires_at: expiresAt.toISOString(),
      })
      .eq('id', userId)

    console.log(`[Webhook] ✅ Activated premium for user ${userId}, plan ${plan}`)
    res.json({ received: true })

  } catch (err) {
    console.error('[Webhook Error]', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// GET /payment-success — redirect back to app after payment
app.get('/payment-success', (req, res) => {
  res.redirect('studentshare://payment-success')
})

// GET /payment-cancel — redirect back to app if cancelled
app.get('/payment-cancel', (req, res) => {
  res.redirect('studentshare://payment-cancel')
})

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`StudentShare backend running on port ${PORT}`))