import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, Button, Alert, Input, Label } from '../components/ui'
import LogoMark from '../components/LogoMark'

/** 忘记密码(v84):只发一封带按钮式核销链接的重置邮件——
 *  真正的令牌消耗发生在 /reset 页的人手点击,扫描器点不掉。 */
export default function Forgot() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const v = email.trim()
    if (!v) { setError('Enter the email you signed up with.'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.auth.resetPasswordForEmail(v)
    setBusy(false)
    if (e) { setError(e.message); return }
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex justify-center"><LogoMark className="h-8 w-8 rounded-lg" /></span>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">Reset your password</h1>
        {sent ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Check your inbox — open the newest email and tap the button inside to set a new password.
            </p>
            <button className="mt-4 font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink"
              onClick={() => nav('/login')}>Back to log in</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Tell us your account email and we'll send a secure reset link.
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="mt-4 text-left">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" />
            </div>
            <Button className="mt-4 w-full" disabled={busy} onClick={() => void send()}>
              {busy ? '…' : 'Send reset email'}
            </Button>
            <button className="mt-3 font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink"
              onClick={() => nav('/login')}>Back to log in</button>
          </>
        )}
      </Card>
    </div>
  )
}
