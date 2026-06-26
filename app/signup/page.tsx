'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleSignup() {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>⬡ DocMind</div>
        <h1 style={styles.heading}>Check your email</h1>
        <p style={styles.sub}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
        <Link href="/login" style={{ color: 'var(--accent)', fontSize: 14 }}>Back to login →</Link>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>⬡ DocMind</div>
        <h1 style={styles.heading}>Create account</h1>
        <p style={styles.sub}>Free forever, no credit card</p>
        {error && <div style={styles.error}>{error}</div>}
        <input style={styles.input} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={styles.input} type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignup()} />
        <button style={styles.btn} onClick={handleSignup} disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
        <p style={styles.link}>Already have an account? <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link></p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 },
  logo: { fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 },
  heading: { fontSize: 24, fontWeight: 700 },
  sub: { fontSize: 14, color: 'var(--text-muted)', marginTop: -8 },
  error: { background: '#3b1515', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  input: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '12px 14px', fontSize: 15, outline: 'none', width: '100%' },
  btn: { background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '13px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  link: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' },
}
