import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: { title: 'Email confirmation', body: 'If you just confirmed your email, you can now log in.', cta: 'Go to login' },
  zh: { title: '邮箱确认', body: '如果你刚点完确认邮件，现在可以登录了。', cta: '去登录' },
}

export default function Verify() {
  const { lang } = useI18n()
  const t = COPY[lang]
  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-3 font-display text-2xl font-medium tracking-tight text-ink">{t.title}</h1>
      <p className="mb-6 text-sm text-muted">{t.body}</p>
      <Link to="/login"><Button>{t.cta}</Button></Link>
    </div>
  )
}
