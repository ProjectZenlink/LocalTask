import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager, CommissionRate } from '../types/database'
import { PLATFORMS } from '../types/database'
import { dateShort, waLink, tgLink, xLink } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field, StatusBadge, Input } from '../components/ui'
import { useLang } from './i18n'
import { PromptDialog, ConfirmDialog } from './bits'

const COPY = {
  zh: {
    title: '账户经理',
    add: '＋ 新建 AM', search: '按名字或联系方式搜索…', name: '名字(必填)', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名', x: 'X (Twitter) 用户名',
    save: '保存', saving: '保存中…', cancelEdit: '取消',
    edit: '编辑', deactivate: '停用', activate: '启用', active: '在职', inactive: '已停用',
    empty: '还没有账户经理。', joined: '录入', vName: '名字必填。',
    deactivateHint: '停用后不再出现在建任务下拉里;历史任务不受影响。',
    bound: '已绑定', unbound: '未绑定', bind: '绑定登录', unbind: '解绑', dlgCancel: '取消',
    bindQ: '输入 TA 注册 LocalTask 时用的邮箱(需先自行注册):', unbindQ: '解绑后该账号回到普通用户身份,确认?',
    payout: '记发放', payoutQ: '发放金额(美元),可空格后跟备注,如:100 六月提成',
    payoutBad: '金额格式不对。', ratesTitle: '提成费率(验收那一刻按当时值记账)', ratesSave: '保存费率', ratesSaved: '费率已保存。',
  },
  en: {
    title: 'Account managers',
    add: '＋ New AM', search: 'Search by name or contact…', name: 'Name (required)', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
    save: 'Save', saving: 'Saving…', cancelEdit: 'Cancel',
    edit: 'Edit', deactivate: 'Deactivate', activate: 'Activate', active: 'Active', inactive: 'Inactive',
    empty: 'No account managers yet.', joined: 'Added', vName: 'Name is required.',
    deactivateHint: 'Deactivated AMs disappear from the new-task dropdown; existing tasks are unaffected.',
    bound: 'Bound', unbound: 'Not bound', bind: 'Bind login', unbind: 'Unbind', dlgCancel: 'Cancel',
    bindQ: 'Enter the email they registered with (they must sign up first):', unbindQ: 'Unbinding turns the account back into a regular user. Confirm?',
    payout: 'Record payout', payoutQ: 'Payout amount (USD), optionally followed by a note, e.g. "100 June commission"',
    payoutBad: 'Bad amount format.', ratesTitle: 'Commission rates (snapshotted at acceptance time)', ratesSave: 'Save rates', ratesSaved: 'Rates saved.',
  },
}

const EMPTY = { name: '', whatsapp: '', telegram: '', x: '' }

export default function AdminAms() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [rows, setRows] = useState<AccountManager[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [q, setQ] = useState('')
  const [rates, setRates] = useState<Record<string, string>>({})
  const [ratesBusy, setRatesBusy] = useState(false)
  const [ratesMsg, setRatesMsg] = useState(false)
  const [bindFor, setBindFor] = useState<AccountManager | null>(null)
  const [unbindFor, setUnbindFor] = useState<AccountManager | null>(null)
  const [payoutFor, setPayoutFor] = useState<AccountManager | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('account_managers').select('*').order('created_at', { ascending: false })
    if (e) { setError(e.message); return }
    setRows((data ?? []) as AccountManager[])
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    supabase.from('commission_rates').select('*').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const r of (data ?? []) as CommissionRate[]) m[r.task_type] = String(r.amount)
      setRates(m)
    })
  }, [])

  async function saveRates() {
    setRatesBusy(true); setError(null); setRatesMsg(false)
    for (const p of PLATFORMS) {
      const v = Number(rates[p] ?? 0)
      const { error: e } = await supabase.from('commission_rates')
        .update({ amount: Number.isFinite(v) && v >= 0 ? v : 0 }).eq('task_type', p)
      if (e) { setError(e.message); setRatesBusy(false); return }
    }
    setRatesBusy(false); setRatesMsg(true)
  }

  async function doBind(email: string) {
    const a = bindFor; setBindFor(null)
    if (!a) return
    setError(null)
    const { error: e } = await supabase.rpc('bind_am_login', { p_am: a.id, p_email: email })
    if (e) { setError(e.message); return }
    await load()
  }

  async function doUnbind() {
    const a = unbindFor; setUnbindFor(null)
    if (!a) return
    const { error: e } = await supabase.rpc('unbind_am_login', { p_am: a.id })
    if (e) { setError(e.message); return }
    await load()
  }

  async function doPayout(text: string) {
    const a = payoutFor; setPayoutFor(null)
    if (!a) return
    const m = text.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/)
    if (!m) { setError(t.payoutBad); return }
    const { error: e } = await supabase.from('am_wallet_ledger').insert({
      am_id: a.id, kind: 'payout', amount: Number(m[1]),
      note: m[2] || null, created_by: user?.id ?? null,
    })
    if (e) { setError(e.message); return }
  }

  function startEdit(a: AccountManager | null) {
    setError(null)
    if (!a) { setEditing('new'); setForm(EMPTY); return }
    setEditing(a.id)
    setForm({ name: a.name, whatsapp: a.whatsapp ?? '', telegram: a.telegram ?? '', x: a.x ?? '' })
  }

  async function save() {
    if (!form.name.trim()) { setError(t.vName); return }
    setBusy(true); setError(null)
    const payload = {
      name: form.name.trim(),
      whatsapp: form.whatsapp.trim() || null,
      telegram: form.telegram.trim() || null,
      x: form.x.trim() || null,
    }
    const res = editing === 'new'
      ? await supabase.from('account_managers').insert({ ...payload, created_by: user?.id ?? null })
      : await supabase.from('account_managers').update(payload).eq('id', editing!)
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    setEditing(null); setForm(EMPTY)
    await load()
  }

  async function toggleActive(a: AccountManager) {
    setError(null)
    const { error: e } = await supabase.from('account_managers')
      .update({ is_active: !a.is_active }).eq('id', a.id)
    if (e) { setError(e.message); return }
    await load()
  }

  const formCard = (
    <Card className="mb-5 p-5">
      <Field label={t.name} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Field label={t.wa} value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+1 555 000 0000" />
      <Field label={t.tg} value={form.telegram} onChange={e => setForm({ ...form, telegram: e.target.value })} placeholder="@username" />
      <Field label={t.x} value={form.x} onChange={e => setForm({ ...form, x: e.target.value })} placeholder="@username" />
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? t.saving : t.save}</Button>
        <Button variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY) }}>{t.cancelEdit}</Button>
      </div>
    </Card>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeading>{t.title}</PageHeading>
        <Button onClick={() => startEdit(null)}>{t.add}</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {editing === 'new' && formCard}

      <Card className="mb-5 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.ratesTitle}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PLATFORMS.map(p => (
            <div key={p}>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">{p}</p>
              <Input type="number" min="0" step="any" value={rates[p] ?? ''} className="py-1.5 font-mono text-sm"
                onChange={e => setRates({ ...rates, [p]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button className="px-3 py-1.5 text-xs" disabled={ratesBusy} onClick={() => void saveRates()}>{t.ratesSave}</Button>
          {ratesMsg && <span className="text-sm text-verified-text">{t.ratesSaved}</span>}
        </div>
      </Card>

      <div className="mb-4 w-72">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="py-1.5 text-sm" />
      </div>

      <Card className="p-5">
        {rows.filter(a => {
          const s = q.trim().toLowerCase()
          if (!s) return true
          return a.name.toLowerCase().includes(s)
            || (a.whatsapp ?? '').toLowerCase().includes(s)
            || (a.telegram ?? '').toLowerCase().includes(s)
            || (a.x ?? '').toLowerCase().includes(s)
        }).length === 0 ? (
          <p className="py-2 text-center text-sm text-faint">{t.empty}</p>
        ) : rows.filter(a => {
          const s = q.trim().toLowerCase()
          if (!s) return true
          return a.name.toLowerCase().includes(s)
            || (a.whatsapp ?? '').toLowerCase().includes(s)
            || (a.telegram ?? '').toLowerCase().includes(s)
            || (a.x ?? '').toLowerCase().includes(s)
        }).map(a => (
          <div key={a.id} className="border-b border-hair py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {a.whatsapp && <a className="text-petrol underline underline-offset-2" href={waLink(a.whatsapp)} target="_blank" rel="noreferrer">WA {a.whatsapp}</a>}
                  {a.whatsapp && a.telegram && ' · '}
                  {a.telegram && <a className="text-petrol underline underline-offset-2" href={tgLink(a.telegram)} target="_blank" rel="noreferrer">TG {a.telegram}</a>}
                  {a.telegram && a.x && ' · '}
                  {a.x && <a className="text-petrol underline underline-offset-2" href={xLink(a.x)} target="_blank" rel="noreferrer">X {a.x}</a>}
                  {(a.whatsapp || a.telegram || a.x) && ' · '}
                  {t.joined} {dateShort(a.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.user_id ? 'verified' : 'unverified'} label={a.user_id ? t.bound : t.unbound} />
                <StatusBadge status={a.is_active ? 'verified' : 'unverified'} label={a.is_active ? t.active : t.inactive} />
                {a.user_id
                  ? <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setUnbindFor(a)}>{t.unbind}</Button>
                  : <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setBindFor(a)}>{t.bind}</Button>}
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setPayoutFor(a)}>{t.payout}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => startEdit(a)}>{t.edit}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => toggleActive(a)}>
                  {a.is_active ? t.deactivate : t.activate}
                </Button>
              </div>
            </div>
            {editing === a.id && <div className="mt-3">{formCard}</div>}
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-faint">{t.deactivateHint}</p>

      <PromptDialog
        open={bindFor !== null}
        title={t.bind}
        hint={t.bindQ}
        confirmLabel={t.bind}
        cancelLabel={t.dlgCancel}
        danger={false}
        onConfirm={email => void doBind(email)}
        onClose={() => setBindFor(null)}
      />
      <ConfirmDialog
        open={unbindFor !== null}
        title={t.unbind}
        hint={t.unbindQ}
        confirmLabel={t.unbind}
        cancelLabel={t.dlgCancel}
        onConfirm={() => void doUnbind()}
        onClose={() => setUnbindFor(null)}
      />
      <PromptDialog
        open={payoutFor !== null}
        title={t.payout}
        hint={t.payoutQ}
        confirmLabel={t.payout}
        cancelLabel={t.dlgCancel}
        danger={false}
        onConfirm={text => void doPayout(text)}
        onClose={() => setPayoutFor(null)}
      />
    </div>
  )
}
