import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, Button, Field, Alert } from '../components/ui'

/** 员工注册（隐藏页）：全站没有任何链接指向这里，网址 + 邀请码由创始人私下发给新员工。
 *  角色由 admin 在「账户经理」页激活时指派（AM 或 Admin），注册者自己不选。 */
export default function StaffJoin() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function join() {
    setError(null)
    if (!name.trim()) { setError('请填写姓名。'); return }
    if (!email.trim() || !password) { setError('请填写邮箱和密码。'); return }
    if (password.length < 8) { setError('密码至少 8 位。'); return }
    if (!code.trim()) { setError('请填写邀请码。'); return }
    setBusy(true)
    // 先校验邀请码（服务端比对，前端拿不到码本身），再注册
    const { data: ok, error: ckErr } = await supabase.rpc('staff_code_ok', { p_code: code.trim() })
    if (ckErr) { setBusy(false); setError(ckErr.message); return }
    if (!ok) { setBusy(false); setError('邀请码不对，请和给你网址的人核对。'); return }
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim(), staff_code: code.trim() },
        emailRedirectTo: `${window.location.origin}/staff/waiting`,
      },
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    if (data.session) { window.location.href = '/staff/waiting'; return }
    setDone(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5 font-display text-lg font-medium tracking-tight text-ink">
          <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
          LocalTask <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">员工注册</span>
        </div>
        <Card className="p-5">
          {done ? (
            <p className="text-sm leading-relaxed text-ink">
              注册成功。请去邮箱点确认链接，然后回来登录 —— 登录后会看到「等待管理员激活」，管理员激活后你会自动进入自己的后台。
            </p>
          ) : (
            <>
              {error && <Alert tone="error">{error}</Alert>}
              <Field label="姓名" value={name} onChange={e => setName(e.target.value)} placeholder="工作台里显示的名字" />
              <Field label="邮箱" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              <Field label="密码（至少 8 位）" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              <Field label="邀请码" value={code} onChange={e => setCode(e.target.value)} placeholder="向给你这个网址的人索取" />
              <Button className="w-full" disabled={busy} onClick={() => void join()}>
                {busy ? '提交中…' : '提交注册'}
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-faint">
                注册后账号处于「待激活」状态，由管理员指派为账户经理或管理员后方可使用。
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
