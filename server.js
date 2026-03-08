const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(cors())

// Raw body ONLY for webhook — must come before express.json()
app.use('/webhook/monime', express.raw({ type: 'application/json' }))
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service_role key — bypasses RLS
)

const MONIME_API_URL      = 'https://api.monime.io/v1'
const MONIME_SPACE_ID     = process.env.MONIME_SPACE_ID
const MONIME_ACCESS_TOKEN = process.env.MONIME_ACCESS_TOKEN
const WEBHOOK_SECRET      = process.env.WEBHOOK_SECRET

const PLANS = {
  monthly:       { name: 'Monthly Plan',       amount: 25,  days: 30  },
  academic_year: { name: 'Academic Year Plan', amount: 150, days: 270 },
  yearly:        { name: 'Yearly Plan',        amount: 300, days: 365 },
}

app.get('/', (req, res) => res.json({ status: 'StudentShare backend running' }))

// Keep Render free instance alive
setInterval(async () => {
  try {
    const r = await fetch('https://studentshare-backend.onrender.com/')
    console.log('Keep-alive ping, status:', r.status)
  } catch (e) {
    console.error('Keep-alive failed:', e.message)
  }
}, 14 * 60 * 1000)

// ════════════════════════════════════════════════════════════════
//  POST /api/create-checkout
// ════════════════════════════════════════════════════════════════
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { plan, userId, userEmail, userName } = req.body
    if (!plan || !userId) return res.status(400).json({ error: 'plan and userId are required' })

    const planConfig = PLANS[plan]
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan' })

    console.log(`Creating checkout — plan: ${plan}, user: ${userId}`)

    // 1. Create Monime checkout session
    const response = await fetch(`${MONIME_API_URL}/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${MONIME_ACCESS_TOKEN}`,
        'Monime-Space-Id': MONIME_SPACE_ID,
        'Idempotency-Key': `${userId}-${plan}-${Date.now()}`,
      },
      body: JSON.stringify({
        name:        planConfig.name,
        description: `StudentShare ${planConfig.name}`,
        lineItems: [{
          type:     'custom',
          name:     planConfig.name,
          quantity: 1,
          price:    { currency: 'SLE', value: planConfig.amount * 100 },
        }],
        successUrl:     'studentshare://payment-pending',
        cancelUrl:      'studentshare://subscription',
        metadata:       { userId, plan, userEmail: userEmail || '', userName: userName || '' },
        paymentOptions: { momo: { enabledProviders: ['m17', 'm18'] } },
      }),
    })

    const rawText = await response.text()
    let data
    try { data = JSON.parse(rawText) }
    catch (e) {
      console.error('Monime non-JSON response:', rawText)
      return res.status(500).json({ error: 'Monime returned unexpected response' })
    }

    if (!response.ok) {
      console.error('Monime error:', response.status, JSON.stringify(data))
      return res.status(500).json({ error: 'Failed to create checkout session', details: data })
    }

    const session = data.result || data
    console.log('Monime session id:', session.id, '| redirectUrl:', session.redirectUrl)

    // 2. INSERT a fresh pending row — never upsert
    //    FIX: old code used upsert({onConflict:'user_id'}) which broke
    //    multiple purchases. Now every checkout gets its own row,
    //    and the webhook matches by monime_session_id.
    const { error: dbError } = await supabase.from('subscriptions').insert({
      user_id:           userId,
      plan,
      status:            'pending',
      monime_session_id: session.id,
      amount:            planConfig.amount,
      currency:          'SLE',
      payment_method:    'monime',
      created_at:        new Date().toISOString(),
    })

    if (dbError) {
      // Non-fatal — log and continue. Webhook can still activate.
      console.error('DB insert error (non-fatal):', dbError.message)
    }

    return res.json({ checkoutUrl: session.redirectUrl, sessionId: session.id })

  } catch (err) {
    console.error('Checkout error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════════════
//  POST /webhook/monime
//  Auto-activates subscription when Monime confirms payment
// ════════════════════════════════════════════════════════════════
app.post('/webhook/monime', async (req, res) => {
  try {
    const signature = req.headers['monime-signature']
    const rawBody   = req.body  // Buffer

    if (signature && WEBHOOK_SECRET) {
      const expectedSig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex')
      if (signature !== expectedSig) {
        console.error('Invalid webhook signature')
        return res.status(401).json({ error: 'Invalid signature' })
      }
    }

    const event = JSON.parse(rawBody.toString())
    console.log('Webhook event:', event.type)

    if (event.type === 'checkout_session.completed') {
      const sessionData = event.result || event.data || {}
      const sessionId   = sessionData.id
      const metadata    = sessionData.metadata || {}
      const { userId, plan } = metadata

      if (!userId || !plan) {
        console.error('Webhook missing userId or plan in metadata:', metadata)
        return res.status(200).json({ received: true })
      }

      const planConfig = PLANS[plan]
      if (!planConfig) {
        console.error('Webhook: unknown plan:', plan)
        return res.status(200).json({ received: true })
      }

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + planConfig.days)

      // FIX: match by monime_session_id, not user_id
      // Old code updated by user_id which breaks when a user buys multiple times
      if (sessionId) {
        await supabase
          .from('subscriptions')
          .update({
            status:       'active',
            expires_at:   expiresAt.toISOString(),
            activated_at: new Date().toISOString(),
          })
          .eq('monime_session_id', sessionId)
          .eq('status', 'pending')   // idempotency — skip if already active
      } else {
        // Fallback: no session ID in webhook payload
        console.warn('Webhook: no session ID — using user_id + most recent pending row')
        await supabase
          .from('subscriptions')
          .update({
            status:       'active',
            expires_at:   expiresAt.toISOString(),
            activated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('status', 'pending')
      }

      // Grant verified badge
      await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', userId)

      console.log(`✅ Auto-activated: user=${userId} plan=${plan} expires=${expiresAt.toISOString()}`)
    }

    return res.status(200).json({ received: true })

  } catch (err) {
    console.error('Webhook error:', err)
    return res.status(200).json({ received: true, warning: 'Internal error' })
  }
})

// ════════════════════════════════════════════════════════════════
//  GET /api/subscription/:userId
// ════════════════════════════════════════════════════════════════
app.get('/api/subscription/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.params.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return res.status(404).json({ status: 'none' })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ════════════════════════════════════════════════════════════════
//  POST /api/approve
//  Manual fallback — admin approves from dashboard
// ════════════════════════════════════════════════════════════════
app.post('/api/approve', async (req, res) => {
  try {
    const { subscription_id, userId, plan, secret } = req.body

    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'studentshare_admin_2024'
    if (secret && secret !== ADMIN_SECRET) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    let targetUserId = userId
    let targetPlan   = plan

    if (subscription_id) {
      const { data: sub, error: fetchErr } = await supabase
        .from('subscriptions')
        .select('user_id, plan, status')
        .eq('id', subscription_id)
        .single()

      if (fetchErr || !sub) return res.status(404).json({ error: 'Subscription not found' })
      if (sub.status === 'active') return res.json({ success: true, message: 'Already active' })

      targetUserId = sub.user_id
      targetPlan   = sub.plan
    }

    const planConfig = PLANS[targetPlan]
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan: ' + targetPlan })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + planConfig.days)

    const updateFilter = subscription_id
      ? { id: subscription_id }
      : { user_id: targetUserId, status: 'pending' }

    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update({
        status:       'active',
        expires_at:   expiresAt.toISOString(),
        activated_at: new Date().toISOString(),
      })
      .match(updateFilter)

    if (updateErr) return res.status(500).json({ error: 'DB update failed: ' + updateErr.message })

    // FIX: grant verified badge — was missing in the old version
    await supabase
      .from('profiles')
      .update({ is_verified: true })
      .eq('id', targetUserId)

    console.log(`✅ Manually approved: user=${targetUserId} plan=${targetPlan} expires=${expiresAt.toISOString()}`)
    return res.json({ success: true, expiresAt })

  } catch (err) {
    console.error('/api/approve error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
