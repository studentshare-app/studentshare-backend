require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')
const nodemailer = require('nodemailer')

const app = express()
app.use(cors())
app.use(express.json())

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

const PLANS = {
  monthly: { name: 'Monthly', days: 30, price: 10 },
  termly: { name: 'Termly', days: 120, price: 25 },
  yearly: { name: 'Yearly', days: 365, price: 100 },
}

app.post('/api/subscribe', async (req, res) => {
  const { user_id, plan, phone, payment_method, amount } = req.body
  if (!user_id || !plan || !phone || !payment_method) return res.status(400).json({ error: 'Missing fields' })
  const planInfo = PLANS[plan]
  if (!planInfo) return res.status(400).json({ error: 'Invalid plan' })
  const { data, error } = await supabase.from('subscriptions').insert({ user_id, plan, phone, payment_method, amount: amount || planInfo.price, currency: 'NLE', status: 'pending', created_at: new Date().toISOString() }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true, subscription_id: data.id })
})

app.post('/api/approve', async (req, res) => {
  const { subscription_id, secret } = req.body
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' })
  const { data: sub } = await supabase.from('subscriptions').select('*').eq('id', subscription_id).single()
  if (!sub) return res.status(404).json({ error: 'Not found' })
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + PLANS[sub.plan].days)
  await supabase.from('subscriptions').update({ status: 'active', approved_at: new Date().toISOString(), expires_at: expiresAt.toISOString() }).eq('id', subscription_id)
  await supabase.from('profiles').update({ is_premium: true, premium_plan: sub.plan, premium_expires_at: expiresAt.toISOString() }).eq('id', sub.user_id)
  res.json({ success: true, expires_at: expiresAt.toISOString() })
})

app.post('/api/reject', async (req, res) => {
  const { subscription_id, secret } = req.body
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' })
  await supabase.from('subscriptions').update({ status: 'rejected' }).eq('id', subscription_id)
  res.json({ success: true })
})

app.get('/api/subscription/:user_id', async (req, res) => {
  const { user_id } = req.params
  const { data } = await supabase.from('subscriptions').select('*').eq('user_id', user_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).single()
  if (!data) return res.json({ active: false })
  const now = new Date()
  const expiresAt = new Date(data.expires_at)
  if (now > expiresAt) {
    await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', data.id)
    await supabase.from('profiles').update({ is_premium: false }).eq('id', user_id)
    return res.json({ active: false, reason: 'expired' })
  }
  res.json({ active: true, plan: data.plan, expires_at: data.expires_at, days_remaining: Math.ceil((expiresAt - now) / 86400000) })
})

app.get('/api/pending', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' })
  const { data, error } = await supabase.from('subscriptions').select('*').eq('status', 'pending').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.get('/api/all-subscriptions', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' })
  const { data, error } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('StudentShare backend running on port ' + PORT))
