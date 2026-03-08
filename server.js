const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(cors())

// Raw body for webhook signature verification
app.use('/webhook/monime', express.raw({ type: 'application/json' }))
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const MONIME_API_URL = 'https://api.monime.io/v1'
const MONIME_SPACE_ID = process.env.MONIME_SPACE_ID
const MONIME_ACCESS_TOKEN = process.env.MONIME_ACCESS_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

// Plan config — academic_year = 270 days (9 months)
const PLANS = {
  monthly:       { name: 'Monthly Plan',       amount: 25,  days: 30  },
  academic_year: { name: 'Academic Year Plan', amount: 150, days: 270 },
  yearly:        { name: 'Yearly Plan',         amount: 300, days: 365 },
}

app.get('/', (req, res) => res.json({ status: 'StudentShare backend running' }))

// ─── FIX 3: Keep-alive ping so Render free instance never sleeps ───────────
setInterval(async () => {
  try {
    const res = await fetch('https://studentshare-backend.onrender.com/')
    console.log('Keep-alive ping sent, status:', res.status)
  } catch (e) {
    console.error('Keep-alive failed:', e.message)
  }
}, 14 * 60 * 1000) // every 14 minutes (Render sleeps after 15 min inactivity)

app.post('/api/create-checkout', async (req, res) => {
  try {
    const { plan, userId, userEmail, userName } = req.body
    if (!plan || !userId) return res.status(400).json({ error: 'plan and userId are required' })
    const planConfig = PLANS[plan]
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan' })

    console.log('Plan:', plan, '| Amount:', planConfig.amount, '| UserId:', userId)
    console.log('Space ID set:', !!MONIME_SPACE_ID, '| Token set:', !!MONIME_ACCESS_TOKEN)
    const response = await fetch(`${MONIME_API_URL}/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MONIME_ACCESS_TOKEN}`,
        'Monime-Space-Id': MONIME_SPACE_ID,
        'Idempotency-Key': `${userId}-${plan}-${Date.now()}`,
      },
      body: JSON.stringify({
        name: planConfig.name,
        description: `StudentShare ${planConfig.name}`,
        lineItems: [
          {
            type: 'custom',
            name: planConfig.name,
            quantity: 1,
            price: { currency: 'SLE', value: planConfig.amount },
          }
        ],
        successUrl: `studentshare://payment-pending`,
        cancelUrl:  `studentshare://subscription`,
        metadata: { userId, plan, userEmail: userEmail || '', userName: userName || '' },
        paymentOptions: { momo: { enabledProviders: ['m17', 'm18'] } }
      })
    })

    const rawText = await response.text()
    let data
    try {
      data = JSON.parse(rawText)
    } catch (e) {
      console.error('Monime non-JSON response:', rawText)
      return res.status(500).json({ error: 'Monime returned unexpected response' })
    }
    if (!response.ok) {
      console.error('Monime status:', response.status, '| body:', JSON.stringify(data))
      return res.status(500).json({ error: 'Failed to create checkout session', details: data })
    }
    console.log('Monime full response:', JSON.stringify(data, null, 2))
    // Monime may wrap response in a data object
    const session = data.data || data
    console.log('Session id:', session.id, '| redirectUrl:', session.redirectUrl)

    // ─── FIX 2: Safe insert — never overwrite an active subscription ──────────
    // Check if user already has an active subscription first
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single()

    if (existing?.status === 'active') {
      // Already active — just return the checkout URL without touching the DB
      // (user may be upgrading; let the webhook handle it)
      const session2 = data.data || data
      return res.json({ checkoutUrl: session2.redirectUrl, sessionId: session2.id })
    }

    // Safe to insert/update — user has no active subscription
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan,
      status: 'pending',
      monime_session_id: (data.data || data).id,
      amount: planConfig.amount,
      currency: 'SLE',
      payment_method: 'monime',
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    const sessionData = data.data || data
    res.json({ checkoutUrl: sessionData.redirectUrl, sessionId: sessionData.id })
  } catch (err) {
    console.error('Checkout error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/webhook/monime', async (req, res) => {
  try {
    const signature = req.headers['monime-signature']
    const rawBody = req.body

    if (signature && WEBHOOK_SECRET) {
      const expectedSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
      if (signature !== expectedSig) {
        console.error('Invalid webhook signature')
        return res.status(401).json({ error: 'Invalid signature' })
      }
    }

    const event = JSON.parse(rawBody)
    console.log('Webhook received:', event.type)

    // ─── FIX 1: Confirmed event name from Monime docs is checkout_session.completed
    if (event.type === 'checkout_session.completed') {
      const { userId, plan } = event.data?.metadata || {}
      if (!userId || !plan) return res.status(200).json({ received: true })
      const planConfig = PLANS[plan]
      if (!planConfig) return res.status(200).json({ received: true })

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + planConfig.days)

      // Only activate if not already active (idempotency guard)
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .single()

      if (existing?.status === 'active') {
        console.log(`ℹ️ Already active, skipping: user=${userId}`)
        return res.status(200).json({ received: true })
      }

      const { error } = await supabase.from('subscriptions').update({
        status: 'active',
        expires_at: expiresAt.toISOString(),
        activated_at: new Date().toISOString(),
        monime_session_id: event.data.id,
        amount: planConfig.amount,
        currency: 'SLE',
      }).eq('user_id', userId)

      if (error) {
        console.error('Supabase update error:', error)
        return res.status(500).json({ error: 'DB update failed' })
      }

      console.log(`✅ Activated: user=${userId} plan=${plan} expires=${expiresAt}`)
    }

    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook error:', err)
    res.status(500).json({ error: 'Webhook failed' })
  }
})

app.get('/api/subscription/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.params.userId)
      .single()
    if (error) return res.status(404).json({ status: 'none' })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/api/approve', async (req, res) => {
  try {
    const { userId, plan, subscription_id } = req.body
    let targetPlan = plan, targetUserId = userId

    if (subscription_id) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id,plan')
        .eq('id', subscription_id)
        .single()
      if (sub) { targetUserId = sub.user_id; targetPlan = sub.plan }
    }

    const planConfig = PLANS[targetPlan]
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan' })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + planConfig.days)

    const q = subscription_id
      ? supabase.from('subscriptions').update({
          status: 'active',
          expires_at: expiresAt.toISOString(),
          activated_at: new Date().toISOString()
        }).eq('id', subscription_id)
      : supabase.from('subscriptions').update({
          status: 'active',
          expires_at: expiresAt.toISOString(),
          activated_at: new Date().toISOString()
        }).eq('user_id', targetUserId)

    const { error } = await q
    if (error) return res.status(500).json({ error: 'DB update failed' })
    res.json({ success: true, expiresAt })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
