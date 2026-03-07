const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(cors())
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const MONIME_API_URL = 'https://api.monime.io'
const MONIME_SPACE_ID = process.env.MONIME_SPACE_ID
const MONIME_ACCESS_TOKEN = process.env.MONIME_ACCESS_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'studentshare-webhook-secret'

// Plan config
const PLANS = {
  monthly:  { name: 'Monthly Plan',  amount: 1000,  days: 30  }, // NLE 10 = 1000 leones
  termly:   { name: 'Termly Plan',   amount: 2500,  days: 120 }, // NLE 25
  yearly:   { name: 'Yearly Plan',   amount: 10000, days: 365 }, // NLE 100
}

// Health check
app.get('/', (req, res) => res.json({ status: 'StudentShare backend running' }))

// Create checkout session
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { plan, userId, userEmail, userName } = req.body

    if (!plan || !userId) {
      return res.status(400).json({ error: 'plan and userId are required' })
    }

    const planConfig = PLANS[plan]
    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan' })
    }

    const appUrl = process.env.APP_URL || 'https://studentshare.app'

    const response = await fetch(`${MONIME_API_URL}/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MONIME_ACCESS_TOKEN}`,
        'Monime-Space-Id': MONIME_SPACE_ID,
      },
      body: JSON.stringify({
        name: planConfig.name,
        description: `StudentShare ${planConfig.name} subscription`,
        lineItems: [
          {
            type: 'custom',
            name: planConfig.name,
            quantity: 1,
            unitAmount: planConfig.amount,
            currency: 'SLE',
          }
        ],
        successUrl: `${appUrl}/payment-success?plan=${plan}&userId=${userId}`,
        cancelUrl: `${appUrl}/payment-cancelled`,
        metadata: {
          userId,
          plan,
          userEmail: userEmail || '',
          userName: userName || '',
        },
        paymentOptions: {
          momo: {
            enabledProviders: ['m17', 'm18'] // Orange Money SL + Afrimoney
          }
        }
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Monime API error:', data)
      return res.status(500).json({ error: 'Failed to create checkout session' })
    }

    // Save pending subscription to Supabase
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan,
      status: 'pending',
      monime_session_id: data.id,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    res.json({
      checkoutUrl: data.redirectUrl,
      sessionId: data.id,
    })
  } catch (err) {
    console.error('Create checkout error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Monime webhook handler
app.post('/webhook/monime', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const crypto = require('crypto')
    const signature = req.headers['monime-signature']
    const rawBody = req.body

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

    const event = JSON.parse(rawBody)

    console.log('Webhook received:', event.type)

    // Handle checkout session completed
    if (event.type === 'checkout_session.completed') {
      const session = event.data
      const { userId, plan } = session.metadata || {}

      if (!userId || !plan) {
        console.error('Missing metadata in webhook:', session.metadata)
        return res.status(200).json({ received: true })
      }

      const planConfig = PLANS[plan]
      if (!planConfig) {
        console.error('Invalid plan in webhook:', plan)
        return res.status(200).json({ received: true })
      }

      // Calculate expiry date
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + planConfig.days)

      // Activate subscription in Supabase
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          expires_at: expiresAt.toISOString(),
          activated_at: new Date().toISOString(),
          monime_session_id: session.id,
        })
        .eq('user_id', userId)

      if (error) {
        console.error('Supabase update error:', error)
        return res.status(500).json({ error: 'Database update failed' })
      }

      console.log(`Subscription activated for user ${userId}, plan ${plan}, expires ${expiresAt}`)
    }

    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook error:', err)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// Check subscription status (polled by app)
app.get('/api/subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) return res.status(404).json({ status: 'none' })

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Manual approve (admin fallback)
app.post('/api/approve', async (req, res) => {
  try {
    const { userId, plan } = req.body

    const planConfig = PLANS[plan]
    if (!planConfig) return res.status(400).json({ error: 'Invalid plan' })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + planConfig.days)

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        expires_at: expiresAt.toISOString(),
        activated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (error) return res.status(500).json({ error: 'Database update failed' })

    res.json({ success: true, expiresAt })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
