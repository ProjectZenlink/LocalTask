import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Card, Button, Alert, Field } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

const COPY = {
  zh: { title: '我的资料', sub: 'freelancer 在任务页看到的就是这里的联系方式。',
        email: '登录邮箱', name: '名字', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名', x: 'X (Twitter) 用户名',
        save: '保存', saving: '保存中…', saved: '已保存。' },
  en: { title: 'My profile', sub: 'This contact info is what freelancers see on their task page.',
        email: 'Login email', name: 'Name', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
        save: 'Save', saving: 'Saving…', saved: 'Saved.' },
}

export default function AmMe() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am, refresh } = useAm()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [wa, setWa] = useState('')
  const [tg, setTg] = useState('')
  const [x, setX] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!am) return
    setName(am.name); setWa(am.whatsapp ?? ''); setTg(am.telegram ?? ''); setX(am.x ?? '')
  }, [am])

  if (!am) return <p className="text-muted">…</p>

  async function save() {
    setError(null); setSaved(false); setBusy(true)
    const { error: e } = await supabase.from('account_managers').update({
      name: name.trim() || am!.name,
      whatsapp: wa.trim() || null,
      telegram: tg.trim() || null,
      x: x.trim() || null,
    }).eq('id', am!.id)
    setBusy(false)
    if (e) { setError(e.message); return }
    setSaved(true)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="p-5">
        <p className="mb-4 font-mono text-xs text-faint">{t.email}: {user?.email}</p>
        <Field label={t.name} value={name} onChange={e => setName(e.target.value)} />
        <Field label={t.wa} value={wa} onChange={e => setWa(e.target.value)} placeholder="+1 555 000 0000" />
        <Field label={t.tg} value={tg} onChange={e => setTg(e.target.value)} placeholder="@username" />
        <Field label={t.x} value={x} onChange={e => setX(e.target.value)} placeholder="@username" />
        <Button onClick={() => void save()} disabled={busy} className="w-full">{busy ? t.saving : t.save}</Button>
        {saved && <p className="mt-3 text-sm text-verified-text">{t.saved}</p>}
      </Card>
    </div>
  )
}
