import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeading, Field, Button, Alert } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleLogin() {
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) { setError(err.message); return }
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-sm">
      <PageHeading>Log in</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <Button onClick={handleLogin} disabled={busy} className="mt-2 w-full">
        {busy ? 'Logging in…' : 'Log in'}
      </Button>
      <p className="mt-5 text-sm text-muted">
        No account? <Link to="/signup" className="text-petrol underline underline-offset-2">Sign up</Link>
      </p>
    </div>
  )
}
