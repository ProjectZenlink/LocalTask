import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usd, dateShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

const COPY = {
  zh: { title: '我的资料', sub: 'freelancer 在任务页看到的就是这里的联系方式。',
        email: '登录邮箱', joined: '入驻', name: '名字', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名', x: 'X (Twitter) 用户名',
        save: '保存', saving: '保存中…', saved: '已保存。',
        roster: '名下人才', balance: '钱包余额', pending: '待复核' },
  en: { title: 'My profile', sub: 'This contact info is what freelancers see on their task page.',
        email: 'Login email', joined: 'Joined', name: 'Name', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
        save: 'Save', saving: 'Saving…', saved: 'Saved.',
        roster: 'Roster', balance: 'Balance', pending: 'In review' },
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
  const [stats, setStats] = useState({ roster: 0, balance: 0, pending: 0 })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!am) return
    setName(am.name); setWa(am.whatsapp ?? ''); setTg(am.telegram ?? ''); setX(am.x ?? '')
  }, [am])

  const loadStats = useCallback(async () => {
    if (!am) return
    const [ro, led, pa] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('managed_by', am.id).eq('role', 'user'),
      supabase.from('am_wallet_ledger').select('kind, amount').eq('am_id', am.id),
      supabase.from('platform_acceptances').select('amount').eq('am_id', am.id).eq('status', 'pending_admin'),
    ])
    const ledger = (led.data ?? []) as { kind: string; amount: number }[]
    const bal = ledger.reduce((a, r) => a + (r.kind === 'commission' ? 1 : -1) * Number(r.amount), 0)
    const pend = ((pa.data ?? []) as { amount: number }[]).reduce((a, r) => a + Number(r.amount), 0)
    setStats({ roster: ro.count ?? 0, balance: bal, pending: pend })
  }, [am])

  useEffect(() => { void loadStats() }, [loadStats])

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

  const initial = (am.name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {/* 身份卡 */}
      <Card className="mb-4 p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-petrol font-display text-lg font-medium text-paper">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-medium tracking-tight text-ink">{am.name}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-faint">
              {t.email} {user?.email} · {t.joined} {dateShort(am.created_at)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hair pt-4">
          {[
            { label: t.roster, v: String(stats.roster) },
            { label: t.balance, v: usd(stats.balance) },
            { label: t.pending, v: usd(stats.pending) },
          ].map(x2 => (
            <div key={x2.label} className="text-center">
              <p className="font-display text-lg font-medium tracking-tight text-ink">{x2.v}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">{x2.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
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
