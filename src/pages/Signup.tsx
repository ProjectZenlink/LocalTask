import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
    if (!email || !password) { setError('Please enter your email and a password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true)
    const { data, error: err } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (err) { setError(err.message); return }
    if (data.session) {
      navigate('/build-profile')
    } else {
      setInfo('Check your email to confirm your account, then log in.')
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">Create your account</h1>
      {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {info && <div className="mb-4 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">{info}</div>}
      <label className="mb-1 block text-sm text-gray-600">Email</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2" />
      <label className="mb-1 block text-sm text-gray-600">Password</label>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        className="mb-6 w-full rounded border border-gray-300 px-3 py-2" />
      <button onClick={handleSignup} disabled={busy}
        className="w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50">
        {busy ? 'Creating…' : 'Sign up'}
      </button>
      <p className="mt-4 text-sm text-gray-600">
        Already have an account? <Link to="/login" className="text-gray-900 underline">Log in</Link>
      </p>
    </div>
  )
}
