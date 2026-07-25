import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeading, Field, Button, Alert } from '../components/ui'
import PasswordField from '../components/PasswordField'
import CaptchaBox, { type TurnstileInstance } from '../components/CaptchaBox'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    title: 'Create your account', email: 'Email', password: 'Password',
    busy: 'Creating…', cta: 'Sign up',
    errEmpty: 'Enter your email and a password.',
    errShort: 'Password must be at least 8 characters.',
    errDisposable: 'Disposable email addresses are not allowed. Please sign up with a real inbox you control.',
    info: 'Check your email to confirm your account, then log in.',
    hasAccount: 'Already have an account?', login: 'Log in',
  },
  zh: {
    title: '创建账号', email: '邮箱', password: '密码',
    busy: '创建中…', cta: '注册',
    errEmpty: '请输入邮箱和密码。',
    errShort: '密码至少 8 位。',
    errDisposable: '一次性邮箱不能用来注册，请用你自己的常用邮箱。',
    info: '请到邮箱点确认链接，然后回来登录。',
    hasAccount: '已有账号？', login: '去登录',
  },
}

export default function Signup() {
  const { lang } = useI18n()
  const t = COPY[lang]
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const captchaRef = useRef<TurnstileInstance>(null)
  const navigate = useNavigate()

  async function handleSignup() {
    setError(null)
    setInfo(null)
    if (!email || !password) { setError(t.errEmpty); return }
    if (password.length < 8) { setError(t.errShort); return }
    setBusy(true)
    const { data: okDomain } = await supabase.rpc('email_domain_allowed', { p_email: email })
    if (okDomain === false) {
      setBusy(false)
      setError(t.errDisposable)
      return
    }
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    })
    setBusy(false)
    // Turnstile token 是一次性的：这次请求无论成败都已消耗，重置组件换新 token
    captchaRef.current?.reset()
    setCaptchaToken(null)
    if (err) { setError(err.message); return }
    if (data.session) navigate('/build-profile')
    else setInfo(t.info)
  }

  return (
    <div className="mx-auto max-w-sm">
      <PageHeading>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="info">{info}</Alert>}
      <Field label={t.email} type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <PasswordField label={t.password} value={password} onChange={e => setPassword(e.target.value)} />
      <CaptchaBox ref={captchaRef} action="signup" onToken={setCaptchaToken} />
      <Button onClick={handleSignup} disabled={busy || !captchaToken} className="mt-2 w-full">
        {busy ? t.busy : t.cta}
      </Button>
      <p className="mt-5 text-sm text-muted">
        {t.hasAccount} <Link to="/login" className="text-petrol underline underline-offset-2">{t.login}</Link>
      </p>
    </div>
  )
}
