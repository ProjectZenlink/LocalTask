import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager, CommissionRate } from '../types/database'
import { TASK_TYPES } from '../types/database'
import { dateShort, waLink, tgLink, xLink, typeLabel, usd } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field, StatusBadge, Input } from '../components/ui'
import { useLang } from './i18n'
import { PromptDialog, ConfirmDialog } from './bits'
import { friendly } from '../lib/errors'

const COPY = {
  zh: {
    title: '账户经理',
    add: '＋ 新建 AM', search: '按名字或联系方式搜索…', name: '名字(必填)', email: '登录邮箱(必填)', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名', x: 'X (Twitter) 用户名',
    save: '保存', saving: '保存中…', cancelEdit: '取消',
    newHint: '保存即建号:TA 用这个邮箱 + 公司统一初始密码直接登录,首次登录会被要求改成自己的密码。全程不发任何邮件。',
    createdOk: '已创建,账号现在就能登录。',
    edit: '编辑', deactivate: '停用', activate: '启用', active: '在职', inactive: '已停用',
    empty: '还没有账户经理。', joined: '录入', vName: '名字必填。', vEmail: '邮箱格式不对。',
    deactivateHint: '停用后不再出现在建任务下拉里;历史任务不受影响。',
    bound: '已绑定', unbound: '未绑定', bind: '绑定登录', unbind: '解绑', dlgCancel: '取消',
    resetPwd: '重置密码', resetQ: '把 TA 的密码重置为公司统一初始密码,下次登录须重新设置自己的密码。确认?', confirmReset: '重置密码', resetOk: '已重置为公司统一初始密码。',
    del: '删除', delQ: '删除会释放名下人才、清空任务归属、把登录退回普通用户。有提成或钱包账目的无法删除(请用「停用」)。确认?', confirmDel: '删除账户经理',
    bindQ: '输入 TA 注册 LocalTask 时用的邮箱(需先自行注册):', unbindQ: '解绑后该账号回到普通用户身份,确认?',
    payout: '记发放', payoutQ: '发放金额(美元),可空格后跟备注,如:100 六月提成', statPend: '待复核', statAppr: '累计已批', statPaid: '已发放', statBal: '余额', statLast: '最近验收', detailBtn: '明细', detailHide: '收起', detailT: '最近 5 条验收', detailEmpty: '还没有验收记录。',
    payoutBad: '金额格式不对。', ratesTitle: '提成费率', ratesSave: '保存费率', ratesSaved: '费率已保存。',
    itemsTitle: '其他细分(可自定义)', itemsHint: '「其他」任务可挂一个细分;提成优先级 = 单笔覆盖 → 细分 → 费率表「其他」。', itemLabel: '名称,如 跑腿', itemAmount: '金额', itemAdd: '添加', itemDel: '删除', itemsSave: '保存细分', itemsSaved: '细分已保存。', vItem: '细分名称不能为空。',
  },
  en: {
    title: 'Account managers',
    add: '＋ New AM', search: 'Search by name or contact…', name: 'Name (required)', email: 'Login email (required)', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
    save: 'Save', saving: 'Saving…', cancelEdit: 'Cancel',
    newHint: 'Saving creates the login: they sign in with this email + the company starter password, and must set their own password on first login. No emails are ever sent.',
    createdOk: 'Created — the account can log in right now.',
    edit: 'Edit', deactivate: 'Deactivate', activate: 'Activate', active: 'Active', inactive: 'Inactive',
    empty: 'No account managers yet.', joined: 'Added', vName: 'Name is required.', vEmail: 'That email looks invalid.',
    deactivateHint: 'Deactivated AMs disappear from the new-task dropdown; existing tasks are unaffected.',
    bound: 'Bound', unbound: 'Not bound', bind: 'Bind login', unbind: 'Unbind', dlgCancel: 'Cancel',
    resetPwd: 'Reset password', resetQ: 'Resets their password to the company starter password; they must set a new one on next login. Confirm?', confirmReset: 'Reset password', resetOk: 'Reset to the company starter password.',
    del: 'Delete', delQ: 'Deleting releases their roster, clears task ownership and turns the login back into a regular user. AMs with commission/wallet history cannot be deleted (use Deactivate). Confirm?', confirmDel: 'Delete AM',
    bindQ: 'Enter the email they registered with (they must sign up first):', unbindQ: 'Unbinding turns the account back into a regular user. Confirm?',
    payout: 'Record payout', payoutQ: 'Payout amount (USD), optionally followed by a note, e.g. "100 June commission"', statPend: 'Pending', statAppr: 'Approved', statPaid: 'Paid out', statBal: 'Balance', statLast: 'Last', detailBtn: 'Detail', detailHide: 'Hide', detailT: 'Last 5 acceptances', detailEmpty: 'No acceptances yet.',
    payoutBad: 'Bad amount format.', ratesTitle: 'Commission rates', ratesSave: 'Save rates', ratesSaved: 'Rates saved.',
    itemsTitle: 'Other sub-rates (custom)', itemsHint: '"Other" tasks can carry one sub-rate; priority = per-task override → sub-rate → "Other" rate.', itemLabel: 'Label, e.g. Errand', itemAmount: 'Amount', itemAdd: 'Add', itemDel: 'Delete', itemsSave: 'Save sub-rates', itemsSaved: 'Sub-rates saved.', vItem: 'Sub-rate label is required.',
  },
}

const EMPTY = { name: '', email: '', whatsapp: '', telegram: '', x: '' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AdminAms() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [rows, setRows] = useState<AccountManager[]>([])
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [q, setQ] = useState('')
  const [rates, setRates] = useState<Record<string, string>>({})
  const [ratesBusy, setRatesBusy] = useState(false)
  const [ratesMsg, setRatesMsg] = useState(false)
  const [bindFor, setBindFor] = useState<AccountManager | null>(null)
  const [stats, setStats] = useState<Map<string, { pend: number; appr: number; paid: number; bal: number; last: string | null }>>(new Map())
  const [expandId, setExpandId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ id: string; task_type: string; amount: number; status: string; created_at: string; fl: { display_name: string | null } | null }[]>([])
  const [items, setItems] = useState<{ id: string; label: string; amount: string }[]>([])
  const [newItem, setNewItem] = useState({ label: '', amount: '' })
  const [itemsMsg, setItemsMsg] = useState(false)
  const [itemsBusy, setItemsBusy] = useState(false)
  const [delFor, setDelFor] = useState<AccountManager | null>(null)
  const [unbindFor, setUnbindFor] = useState<AccountManager | null>(null)
  const [resetFor, setResetFor] = useState<AccountManager | null>(null)
  const [payoutFor, setPayoutFor] = useState<AccountManager | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('account_managers').select('*').order('created_at', { ascending: false })
    const [pa, wl] = await Promise.all([
      supabase.from('platform_acceptances').select('am_id, amount, status, created_at'),
      supabase.from('am_wallet_ledger').select('am_id, kind, amount'),
    ])
    const map = new Map<string, { pend: number; appr: number; paid: number; bal: number; last: string | null }>()
    const ensure = (id: string) => {
      if (!map.has(id)) map.set(id, { pend: 0, appr: 0, paid: 0, bal: 0, last: null })
      return map.get(id)!
    }
    for (const r of (pa.data ?? []) as { am_id: string; amount: number; status: string; created_at: string }[]) {
      const e2 = ensure(r.am_id)
      if (r.status === 'pending_admin') e2.pend += Number(r.amount)
      if (r.status === 'approved') e2.appr += Number(r.amount)
      if (!e2.last || r.created_at > e2.last) e2.last = r.created_at
    }
    for (const r of (wl.data ?? []) as { am_id: string; kind: string; amount: number }[]) {
      const e2 = ensure(r.am_id)
      if (r.kind === 'commission') e2.bal += Number(r.amount)
      else { e2.bal -= Number(r.amount); e2.paid += Number(r.amount) }
    }
    setStats(map)
    if (e) { setError(friendly(e)); return }
    setRows((data ?? []) as AccountManager[])
  }, [])

  useEffect(() => { void load() }, [load])

  const loadItems = useCallback(async () => {
    const { data } = await supabase.from('custom_rate_items')
      .select('id, label, amount').order('created_at')
    setItems(((data ?? []) as { id: string; label: string; amount: number }[])
      .map(x => ({ id: x.id, label: x.label, amount: String(x.amount) })))
  }, [])
  useEffect(() => { void loadItems() }, [loadItems])

  async function addItem() {
    setError(null); setItemsMsg(false)
    const lb = newItem.label.trim()
    if (!lb) { setError(t.vItem); return }
    const v = Number(newItem.amount || 0)
    setItemsBusy(true)
    const { error: e } = await supabase.from('custom_rate_items')
      .insert({ label: lb, amount: Number.isFinite(v) && v >= 0 ? v : 0 })
    setItemsBusy(false)
    if (e) { setError(friendly(e)); return }
    setNewItem({ label: '', amount: '' })
    await loadItems()
  }

  async function saveItems() {
    setError(null); setItemsMsg(false); setItemsBusy(true)
    for (const it of items) {
      const lb = it.label.trim()
      if (!lb) { setError(t.vItem); setItemsBusy(false); return }
      const v = Number(it.amount || 0)
      const { error: e } = await supabase.from('custom_rate_items')
        .update({ label: lb, amount: Number.isFinite(v) && v >= 0 ? v : 0 }).eq('id', it.id)
      if (e) { setError(friendly(e)); setItemsBusy(false); return }
    }
    setItemsBusy(false); setItemsMsg(true)
    await loadItems()
  }

  async function delItem(id: string) {
    setError(null); setItemsMsg(false)
    const { error: e } = await supabase.from('custom_rate_items').delete().eq('id', id)
    if (e) { setError(friendly(e)); return }
    await loadItems()
  }

  useEffect(() => {
    supabase.from('commission_rates').select('*').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const r of (data ?? []) as CommissionRate[]) m[r.task_type] = String(r.amount)
      setRates(m)
    })
  }, [])

  async function saveRates() {
    setRatesBusy(true); setError(null); setRatesMsg(false)
    // upsert:「其他」这一行在老库里不存在,首次保存时自动建行
    const payload = TASK_TYPES.map(p => {
      const v = Number(rates[p] ?? 0)
      return { task_type: p, amount: Number.isFinite(v) && v >= 0 ? v : 0 }
    })
    const { error: e } = await supabase.from('commission_rates')
      .upsert(payload, { onConflict: 'task_type' })
    setRatesBusy(false)
    if (e) { setError(friendly(e)); return }
    setRatesMsg(true)
  }

  async function doBind(email: string) {
    const a = bindFor; setBindFor(null)
    if (!a) return
    setError(null)
    const { error: e } = await supabase.rpc('bind_am_login', { p_am: a.id, p_email: email })
    if (e) { setError(friendly(e)); return }
    await load()
  }

  async function doUnbind() {
    const a = unbindFor; setUnbindFor(null)
    if (!a) return
    const { error: e } = await supabase.rpc('unbind_am_login', { p_am: a.id })
    if (e) { setError(friendly(e)); return }
    await load()
  }

  async function doResetPwd() {
    const a = resetFor; setResetFor(null)
    if (!a) return
    setError(null); setOkMsg(null)
    const { data, error: e } = await supabase.functions.invoke('admin-am-account', {
      body: { op: 'reset', am_id: a.id },
    })
    const errMsg = (data as { error?: string } | null)?.error ?? (e ? friendly(e) : null)
    if (errMsg) { setError(errMsg); return }
    setOkMsg(`${a.name} — ${t.resetOk}`)
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
    if (e) { setError(friendly(e)); return }
  }

  function startEdit(a: AccountManager | null) {
    setError(null); setOkMsg(null)
    if (!a) { setEditing('new'); setForm(EMPTY); return }
    setEditing(a.id)
    setForm({ name: a.name, email: '', whatsapp: a.whatsapp ?? '', telegram: a.telegram ?? '', x: a.x ?? '' })
  }

  async function save() {
    if (!form.name.trim()) { setError(t.vName); return }
    setError(null); setOkMsg(null)

    // 新建 = 直建登录账号(服务端函数:免邮件、统一初始密码、首登强改密、名录即绑)
    if (editing === 'new') {
      const email = form.email.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) { setError(t.vEmail); return }
      setBusy(true)
      const { data, error: e } = await supabase.functions.invoke('admin-am-account', {
        body: {
          op: 'create',
          name: form.name.trim(),
          email,
          whatsapp: form.whatsapp.trim() || null,
          telegram: form.telegram.trim() || null,
          x: form.x.trim() || null,
        },
      })
      setBusy(false)
      const errMsg = (data as { error?: string } | null)?.error ?? (e ? friendly(e) : null)
      if (errMsg) { setError(errMsg); return }
      setEditing(null); setForm(EMPTY)
      setOkMsg(`${email} — ${t.createdOk}`)
      await load()
      return
    }

    // 编辑 = 只更新名录联系方式
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      whatsapp: form.whatsapp.trim() || null,
      telegram: form.telegram.trim() || null,
      x: form.x.trim() || null,
    }
    const res = await supabase.from('account_managers').update(payload).eq('id', editing!)
    setBusy(false)
    if (res.error) { setError(friendly(res.error)); return }
    setEditing(null); setForm(EMPTY)
    await load()
  }

  async function toggleDetail(id: string) {
    if (expandId === id) { setExpandId(null); return }
    const { data } = await supabase.from('platform_acceptances')
      .select('id, task_type, amount, status, created_at, fl:profiles!platform_acceptances_freelancer_id_fkey(display_name)')
      .eq('am_id', id).order('created_at', { ascending: false }).limit(5)
    setDetail((data ?? []) as unknown as typeof detail)
    setExpandId(id)
  }

    async function toggleActive(a: AccountManager) {
    setError(null)
    const { error: e } = await supabase.from('account_managers')
      .update({ is_active: !a.is_active }).eq('id', a.id)
    if (e) { setError(friendly(e)); return }
    await load()
  }

  const formCard = (
    <Card className="mb-5 p-5">
      <Field label={t.name} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      {editing === 'new' && (
        <Field label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="am@example.com" />
      )}
      <Field label={t.wa} value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+1 555 000 0000" />
      <Field label={t.tg} value={form.telegram} onChange={e => setForm({ ...form, telegram: e.target.value })} placeholder="@username" />
      <Field label={t.x} value={form.x} onChange={e => setForm({ ...form, x: e.target.value })} placeholder="@username" />
      {editing === 'new' && <p className="mb-3 text-xs leading-relaxed text-muted">{t.newHint}</p>}
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
      {okMsg && <Alert tone="success">{okMsg}</Alert>}
      {editing === 'new' && formCard}

      <Card className="mb-5 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.ratesTitle}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TASK_TYPES.map(p => (
            <div key={p}>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">{typeLabel(p, lang)}</p>
              <Input type="number" min="0" step="any" value={rates[p] ?? ''} className="py-1.5 font-mono text-sm"
                onChange={e => setRates({ ...rates, [p]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button className="px-3 py-1.5 text-xs" disabled={ratesBusy} onClick={() => void saveRates()}>{t.ratesSave}</Button>
          {ratesMsg && <span className="text-sm text-verified-text">{t.ratesSaved}</span>}
        </div>
      
        <div className="mt-5 border-t border-hair pt-4">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.itemsTitle}</p>
          <p className="mb-3 text-xs text-faint">{t.itemsHint}</p>
          {items.map((it, i) => (
            <div key={it.id} className="mb-2 flex items-center gap-2">
              <Input value={it.label} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="flex-1 py-1.5 text-sm" />
              <Input type="number" min="0" step="any" value={it.amount} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} className="w-24 py-1.5 font-mono text-sm" />
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void delItem(it.id)}>{t.itemDel}</Button>
            </div>
          ))}
          <div className="mb-3 flex items-center gap-2">
            <Input value={newItem.label} onChange={e => setNewItem({ ...newItem, label: e.target.value })} placeholder={t.itemLabel} className="flex-1 py-1.5 text-sm" />
            <Input type="number" min="0" step="any" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} placeholder={t.itemAmount} className="w-24 py-1.5 font-mono text-sm" />
            <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={itemsBusy} onClick={() => void addItem()}>{t.itemAdd}</Button>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-3">
              <Button className="px-4 py-1.5 text-xs" disabled={itemsBusy} onClick={() => void saveItems()}>{t.itemsSave}</Button>
              {itemsMsg && <span className="text-sm text-verified-text">{t.itemsSaved}</span>}
            </div>
          )}
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
                <p className="mt-1.5 font-mono text-xs text-muted">
                  <span className="text-pending-text">{t.statPend} {usd(stats.get(a.id)?.pend ?? 0)}</span>
                  {' · '}{t.statAppr} {usd(stats.get(a.id)?.appr ?? 0)}
                  {' · '}{t.statPaid} {usd(stats.get(a.id)?.paid ?? 0)}
                  {' · '}<span className="text-ink">{t.statBal} {usd(stats.get(a.id)?.bal ?? 0)}</span>
                  {' · '}{t.statLast} {stats.get(a.id)?.last ? dateShort(stats.get(a.id)!.last!) : '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.user_id ? 'verified' : 'unverified'} label={a.user_id ? t.bound : t.unbound} />
                <StatusBadge status={a.is_active ? 'verified' : 'unverified'} label={a.is_active ? t.active : t.inactive} />
                {a.user_id
                  ? <>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setResetFor(a)}>{t.resetPwd}</Button>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setUnbindFor(a)}>{t.unbind}</Button>
                    </>
                  : <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setBindFor(a)}>{t.bind}</Button>}
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void toggleDetail(a.id)}>{expandId === a.id ? t.detailHide : t.detailBtn}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setPayoutFor(a)}>{t.payout}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => startEdit(a)}>{t.edit}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => toggleActive(a)}>
                  {a.is_active ? t.deactivate : t.activate}
                </Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDelFor(a)}>
                  {t.del}
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
      <ConfirmDialog
        open={resetFor !== null}
        title={t.resetPwd}
        hint={t.resetQ}
        confirmLabel={t.confirmReset}
        cancelLabel={t.dlgCancel}
        danger={false}
        onConfirm={() => void doResetPwd()}
        onClose={() => setResetFor(null)}
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
      <ConfirmDialog
        open={delFor !== null}
        title={t.del}
        hint={t.delQ}
        confirmLabel={t.confirmDel}
        cancelLabel={t.dlgCancel}
        danger
        onConfirm={() => {
          const a = delFor; setDelFor(null)
          if (!a) return
          void (async () => {
            setError(null)
            const { error: e } = await supabase.rpc('admin_delete_am', { p_am: a.id })
            if (e) { setError(friendly(e)); return }
            await load()
          })()
        }}
        onClose={() => setDelFor(null)}
      />
    </div>
  )
}
