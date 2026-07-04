import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
      <h1 className="mb-6 text-xl font-semibold">Log in</h1>
      {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <label className="mb-1 block text-sm text-gray-600">Email</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2" />
      <label className="mb-1 block text-sm text-gray-600">Password</label>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        className="mb-6 w-full rounded border border-gray-300 px-3 py-2" />
      <button onClick={handleLogin} disabled={busy}
        className="w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50">
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <p className="mt-4 text-sm text-gray-600">
        No account? <Link to="/signup" className="text-gray-900 underline">Sign up</Link>
      </p>
    </div>
  )
}
