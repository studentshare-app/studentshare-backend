import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>StudentShare</h1>
        <p style={styles.subtitle}>Admin Dashboard</p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#F9FAFB' },
  card: { backgroundColor: '#fff', padding: '40px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', width: '100%', maxWidth: '400px' },
  logo: { fontSize: '28px', fontWeight: 'bold', color: '#1A56DB', marginBottom: '4px', textAlign: 'center' },
  subtitle: { color: '#6B7280', textAlign: 'center', marginBottom: '32px' },
  error: { backgroundColor: '#FEE2E2', color: '#DC2626', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  field: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '6px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '15px', boxSizing: 'border-box' },
  button: { width: '100%', padding: '14px', backgroundColor: '#1A56DB', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginTop: '8px' },
}