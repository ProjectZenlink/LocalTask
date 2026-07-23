import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeading, Field, Button, Alert } from '../components/ui'
import PasswordField from '../components/PasswordField'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    title: 'Log in', email: 'Email', password: 'Password',
    busy: 'Logging in…', cta: 'Log in',
    noAccount: 'No account?', signup: 'Sign up',
  },
  zh: {
    title: '登录', email: '邮箱', password: '密码',
    busy: '登录中…', cta: '登录',
    noAccount: '还没有账号？', signup: '去注册',
  },
}

export default function Login() {
  const { lang } = useI18n()
  const t = COPY[lang]
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
      <PageHeading>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t.email} type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <PasswordField label={t.password} value={password} onChange={e => setPassword(e.target.value)} />
      <Button onClick={handleLogin} disabled={busy} className="mt-2 w-full">
        {busy ? t.busy : t.cta}
      </Button>
      <p className="mt-5 text-sm text-muted">
        {t.noAccount} <Link to="/signup" className="text-petrol underline underline-offset-2">{t.signup}</Link>
      </p>
    </div>
  )
}
