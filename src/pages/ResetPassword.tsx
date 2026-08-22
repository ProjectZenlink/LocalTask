import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, Button, Alert, Input, Label } from '../components/ui'
import LogoMark from '../components/LogoMark'
import { friendly } from '../lib/errors'

/** 设置新密码(v84,与 /confirm 同款防扫描):
 *  第一步真人点按钮核销 recovery 令牌;第二步在已登录会话里改密码。 */
export default function ResetPassword() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const tokenHash = sp.get('token_hash')
  const [phase, setPhase] = useState<'verify' | 'set'>('verify')
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify() {
    if (!tokenHash) { setError('This link is incomplete. Please use the newest email we sent you.'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    setBusy(false)
    if (e) {
      setError('This link has expired or was already used. Request a fresh one from "Forgot password".')
      return
    }
    setPhase('set')
  }

  async function save() {
    if (pwd1.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (pwd1 !== pwd2) { setError('Passwords do not match.'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.auth.updateUser({ password: pwd1 })
    setBusy(false)
    if (e) { setError(friendly(e)); return }
    nav('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex justify-center"><LogoMark className="h-8 w-8 rounded-lg" /></span>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">Set a new password</h1>
        {phase === 'verify' ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              One tap to continue — this button proves a real person clicked, not an email scanner.
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <Button className="mt-4 w-full" disabled={busy} onClick={() => void verify()}>
              {busy ? '…' : 'Continue to reset'}
            </Button>
            <button className="mt-3 font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink"
              onClick={() => nav('/login')}>Back to log in</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted">Choose a new password (at least 8 characters).</p>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="mt-4 space-y-3 text-left">
              <div>
                <Label>New password</Label>
                <Input type="password" value={pwd1} onChange={e => setPwd1(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <Label>Repeat new password</Label>
                <Input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <Button className="mt-4 w-full" disabled={busy} onClick={() => void save()}>
              {busy ? '…' : 'Save & log in'}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
