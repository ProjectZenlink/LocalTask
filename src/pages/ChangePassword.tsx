import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { Card, Button, Alert, Input, Label } from '../components/ui'
import LogoMark from '../components/LogoMark'
import { friendly } from '../lib/errors'

/** 首登强制改密(v85.3):AM 建号的统一初始密码在此一次性作废。
 *  流程:两次输入新密码(≥8) → auth.updateUser → confirm_password_changed 清旗 → 回首页。 */
export default function ChangePassword() {
  const nav = useNavigate()
  const { refresh } = useProfile()
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (pwd1.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (pwd1 !== pwd2) { setError('Passwords do not match.'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.auth.updateUser({ password: pwd1 })
    if (e) { setBusy(false); setError(friendly(e)); return }
    await supabase.rpc('confirm_password_changed')
    await refresh()
    setBusy(false)
    nav('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex justify-center"><LogoMark className="h-8 w-8 rounded-lg" /></span>
        <h1 className="mt-4 font-display text-xl font-medium text-ink">Set your own password</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          For your security, replace the starter password before continuing (at least 8 characters).
        </p>
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
          {busy ? '…' : 'Save & continue'}
        </Button>
      </Card>
    </div>
  )
}
