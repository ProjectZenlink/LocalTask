import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeading, Field, Button, Alert } from '../components/ui'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSignup() {
    setError(null)
    setInfo(null)
    if (!email || !password) { setError('Enter your email and a password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true)
    const { data, error: err } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (err) { setError(err.message); return }
    if (data.session) navigate('/build-profile')
    else setInfo('Check your email to confirm your account, then log in.')
  }

  return (
    <div className="mx-auto max-w-sm">
      <PageHeading>Create your account</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="info">{info}</Alert>}
      <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <Button onClick={handleSignup} disabled={busy} className="mt-2 w-full">
        {busy ? 'Creating…' : 'Sign up'}
      </Button>
      <p className="mt-5 text-sm text-muted">
        Already have an account? <Link to="/login" className="text-petrol underline underline-offset-2">Log in</Link>
      </p>
    </div>
  )
}
