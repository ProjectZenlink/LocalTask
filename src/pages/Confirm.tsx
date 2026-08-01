import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, Button, Alert } from '../components/ui'
import LogoMark from '../components/LogoMark'

/** 邮箱确认页(v55):链接跳到这里,真人点按钮才核销令牌——
 *  邮箱服务商的链接预扫描机器人无法替用户消耗一次性令牌。 */
export default function Confirm() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const tokenHash = sp.get('token_hash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!tokenHash) { setError('This link is incomplete. Please use the newest email we sent you.'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.auth.verifyOtp({ type: 'signup', token_hash: tokenHash })
    setBusy(false)
    if (e) {
      setError('This link has expired or was already used. Sign in below and tap "Resend confirmation email" to get a fresh one.')
      return
    }
    nav('/build-profile')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex justify-center"><LogoMark className="h-8 w-8 rounded-lg" /></span>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">Confirm your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">One tap and you're in — this button proves a real person clicked, not an email scanner.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Button className="mt-4 w-full" disabled={busy} onClick={() => void confirm()}>{busy ? '…' : 'Confirm my email'}</Button>
        <button className="mt-3 font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink" onClick={() => nav('/login')}>Back to log in</button>
      </Card>
    </div>
  )
}
