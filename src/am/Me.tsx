import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usd, dateShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field } from '../components/ui'
import { useLang } from '../admin/i18n'
import { Link } from 'react-router-dom'
import { useAm } from './AmLayout'

const COPY = {
  zh: { title: '我的资料', sub: '你的身份、数据一览与联系方式。',
        email: '登录邮箱', joined: '入驻', name: '名字', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名', x: 'X (Twitter) 用户名',
        save: '保存', saving: '保存中…', saved: '已保存。',
        roster: '名下人才', balance: '钱包余额', pending: '待复核', active: '进行中任务',
        quick: '快捷入口', qFl: '我的 Freelancer', qPool: '人才库', qWallet: '钱包',
        ratesT: '当前费率', ratesGo: '去钱包调整 →', contactT: '联系方式', contactSub: 'freelancer 在任务页看到的就是这里的联系方式。' },
  en: { title: 'My profile', sub: 'Your identity, numbers at a glance and contact info.',
        email: 'Login email', joined: 'Joined', name: 'Name', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
        save: 'Save', saving: 'Saving…', saved: 'Saved.',
        roster: 'Roster', balance: 'Balance', pending: 'In review', active: 'Active tasks',
        quick: 'Shortcuts', qFl: 'My freelancers', qPool: 'Pool', qWallet: 'Wallet',
        ratesT: 'Current rates', ratesGo: 'Adjust in wallet →', contactT: 'Contact', contactSub: 'This contact info is what freelancers see on their task page.' },
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
  const [stats, setStats] = useState({ roster: 0, balance: 0, pending: 0, active: 0 })
  const [rates, setRates] = useState<{ label: string; amount: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!am) return
    setName(am.name); setWa(am.whatsapp ?? ''); setTg(am.telegram ?? ''); setX(am.x ?? '')
  }, [am])

  const loadStats = useCallback(async () => {
    if (!am) return
    const [ro, led, pa, at, rt] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('managed_by', am.id).eq('role', 'user'),
      supabase.from('am_wallet_ledger').select('kind, amount').eq('am_id', am.id),
      supabase.from('platform_acceptances').select('amount').eq('am_id', am.id).eq('status', 'pending_admin'),
      supabase.from('tasks').select('id', { count: 'exact', head: true })
        .eq('created_by', am.user_id).in('status', ['in_progress', 'under_review', 'pending_payment']),
      supabase.from('custom_rate_items').select('label, amount').order('label'),
    ])
    const ledger = (led.data ?? []) as { kind: string; amount: number }[]
    const bal = ledger.reduce((a, r) => a + (r.kind === 'commission' ? 1 : -1) * Number(r.amount), 0)
    const pend = ((pa.data ?? []) as { amount: number }[]).reduce((a, r) => a + Number(r.amount), 0)
    setStats({ roster: ro.count ?? 0, balance: bal, pending: pend, active: at.count ?? 0 })
    setRates((rt.data ?? []) as { label: string; amount: number }[])
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
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {/* 报头式身份卡 */}
      <Card className="mb-4 p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-petrol font-display text-xl font-medium text-paper">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-display text-xl font-medium tracking-tight text-ink">
              {am.name}
              <span className="rounded border border-hair px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">AM</span>
            </p>
            <p className="mt-1 truncate font-mono text-xs text-faint">
              {t.email} {user?.email} · {t.joined} {dateShort(am.created_at)}
            </p>
          </div>
        </div>
      </Card>

      {/* 四枚数据瓦片:等宽大数字 = 单据感 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t.roster, v: String(stats.roster) },
          { label: t.active, v: String(stats.active) },
          { label: t.pending, v: usd(stats.pending) },
          { label: t.balance, v: usd(stats.balance) },
        ].map(x2 => (
          <Card key={x2.label} className="p-4">
            <p className="font-mono text-xl font-medium tracking-tight text-ink">{x2.v}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x2.label}</p>
          </Card>
        ))}
      </div>

      {/* 快捷入口 */}
      <Card className="mb-4 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.quick}</p>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/am/my"><Button variant="ghost" className="px-3.5 py-2 text-sm">{t.qFl}</Button></Link>
          <Link to="/am/pool"><Button variant="ghost" className="px-3.5 py-2 text-sm">{t.qPool}</Button></Link>
          <Link to="/am/wallet"><Button variant="ghost" className="px-3.5 py-2 text-sm">{t.qWallet}</Button></Link>
        </div>
      </Card>

      {/* 费率速览(只读;调整在钱包) */}
      {rates.length > 0 && (
        <Card className="mb-4 p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.ratesT}</p>
            <Link to="/am/wallet" className="text-xs text-petrol underline underline-offset-2">{t.ratesGo}</Link>
          </div>
          {rates.map(r => (
            <div key={r.label} className="flex items-center justify-between border-b border-hair py-2 last:border-b-0">
              <span className="text-sm text-ink">{r.label}</span>
              <span className="font-mono text-sm text-ink">{usd(r.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* 联系方式编辑 */}
      <Card className="p-5">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-faint">{t.contactT}</p>
        <p className="mb-4 text-xs text-muted">{t.contactSub}</p>
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
