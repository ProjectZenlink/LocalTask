import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Card, Button, Alert, Field } from '../components/ui'
import { useLang } from './i18n'
import { friendly } from '../lib/errors'

const COPY = {
  zh: { title: '我的资料', sub: '控制台身份与显示名。', email: '登录邮箱', name: '显示名',
        save: '保存', saving: '保存中…', saved: '已保存。' },
  en: { title: 'My profile', sub: 'Console identity and display name.', email: 'Login email', name: 'Display name',
        save: 'Save', saving: 'Saving…', saved: 'Saved.' },
}

export default function AdminMe() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => setName((data as { display_name: string | null } | null)?.display_name ?? ''))
  }, [user])

  async function save() {
    if (!user) return
    setBusy(true); setError(null); setSaved(false)
    const { error: e } = await supabase.from('profiles')
      .update({ display_name: name.trim() || null }).eq('id', user.id)
    setBusy(false)
    if (e) { setError(friendly(e)); return }
    setSaved(true)
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-faint">{t.email}</span>
          <span className="break-all text-right font-mono text-xs text-ink">{user?.email}</span>
        </div>
        <Field label={t.name} value={name} onChange={e => setName(e.target.value)} />
        <Button onClick={() => void save()} disabled={busy} className="w-full">{busy ? t.saving : t.save}</Button>
        {saved && <p className="mt-3 text-sm text-verified-text">{t.saved}</p>}
      </Card>
    </div>
  )
}
