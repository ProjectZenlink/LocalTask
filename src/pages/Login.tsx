import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AuthShell from '../components/AuthShell'
import { PageHeading, Field, Button, Alert } from '../components/ui'
import PasswordField from '../components/PasswordField'
import CaptchaBox, { type TurnstileInstance } from '../components/CaptchaBox'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    title: 'Log in', email: 'Email', password: 'Password',
    busy: 'Logging in…', cta: 'Log in',
    noAccount: 'No account?', signup: 'Sign up', forgot: 'Forgot password?',
  },
  zh: {
    title: '登录', email: '邮箱', password: '密码',
    busy: '登录中…', cta: '登录',
    noAccount: '还没有账号？', signup: '去注册', forgot: '忘记密码？',
  },
}

export default function Login() {
  const { lang } = useI18n()
  const t = COPY[lang]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(() => {
    const h = new URLSearchParams(window.location.hash.slice(1))
    return h.get('error_description')
  })
  const [resent, setResent] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const captchaRef = useRef<TurnstileInstance>(null)
  const navigate = useNavigate()

  async function handleLogin() {
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    })
    setBusy(false)
    // Turnstile token 是一次性的：这次请求无论成败都已消耗，重置组件换新 token
    captchaRef.current?.reset()
    setCaptchaToken(null)
    if (err) {
      setError(err.message === 'Email not confirmed'
        ? 'Email not confirmed — check your inbox for our newest email, or resend below.'
        : err.message)
      return
    }
    navigate('/')
  }

  return (
    <AuthShell>
    <div>
      <PageHeading>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
        {error && error.toLowerCase().includes('not confirmed') && (
          <button type="button" disabled={resendBusy || resent}
            onClick={() => {
              setResendBusy(true)
              void supabase.auth.resend({ type: 'signup', email: email.trim() })
                .then(() => { setResendBusy(false); setResent(true) })
            }}
            className="mb-3 w-full rounded-xl border border-hair bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:border-petrol/40 disabled:opacity-50">
            {resent ? 'Sent — check your inbox ✓' : resendBusy ? '…' : 'Resend confirmation email'}
          </button>
        )}
      <Field label={t.email} type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <PasswordField label={t.password} value={password} onChange={e => setPassword(e.target.value)} />
      <CaptchaBox ref={captchaRef} action="login" onToken={setCaptchaToken} />
      <Button onClick={handleLogin} disabled={busy || !captchaToken} className="mt-2 w-full">
        {busy ? t.busy : t.cta}
      </Button>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-4">
          <span className="text-sm text-muted">
            {t.noAccount}{' '}
            <Link to="/signup" className="text-petrol underline underline-offset-2">{t.signup}</Link>
          </span>
          <button type="button" onClick={() => navigate('/forgot')}
            className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
            {t.forgot}
          </button>
        </div>
    </div>
    </AuthShell>
  )
}