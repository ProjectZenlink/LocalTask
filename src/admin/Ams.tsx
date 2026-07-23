import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager, CommissionRate, PendingStaff } from '../types/database'
import { TASK_TYPES } from '../types/database'
import { dateShort, waLink, tgLink, xLink, typeLabel } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field, StatusBadge, Input, Label } from '../components/ui'
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
    del: '删除', delQ: '删除会释放名下人才、清空任务归属、把登录退回普通用户。有提成或钱包账目的无法删除(请用「停用」)。确认?', confirmDel: '删除账户经理',
    bindQ: '输入 TA 注册 LocalTask 时用的邮箱(需先自行注册):', unbindQ: '解绑后该账号回到普通用户身份,确认?',
    payout: '记发放', payoutQ: '发放金额(美元),可空格后跟备注,如:100 六月提成',
    payoutBad: '金额格式不对。', ratesTitle: '提成费率', ratesSave: '保存费率', ratesSaved: '费率已保存。',
    itemsTitle: '其他细分(可自定义)', itemsHint: '「其他」任务可挂一个细分;提成优先级 = 单笔覆盖 → 细分 → 费率表「其他」。', itemLabel: '名称,如 跑腿', itemAmount: '金额', itemAdd: '添加', itemDel: '删除', itemsSave: '保存细分', itemsSaved: '细分已保存。', vItem: '细分名称不能为空。',
    joinTitle: '员工注册通道', joinDesc: '把下面的网址和邀请码私下发给新同事，让他去注册；注册后会出现在下面「待激活」里，你指派为账户经理或管理员即可。全站没有任何链接指向这个注册页。',
    joinUrl: '注册网址', codeLabel: '邀请码', copy: '复制', copied: '已复制 ✓', saveCode: '保存邀请码', codeSaved: '邀请码已更新。', vCode: '邀请码不能为空。',
    pendingTitle: '待激活员工', pendingEmpty: '没有待激活的注册。', setAm: '设为账户经理', setAdmin: '设为管理员', rejectStaff: '拒绝',
    setAdminQ: '设为管理员会给予最高权限(可管理所有 AM、任务、复核、封禁)。确认?', rejectStaffQ: '拒绝会删除这个注册账号,不可恢复。确认?', confirmAdmin: '设为管理员', confirmReject: '拒绝并删除',
  },
  en: {
    title: 'Account managers',
    add: '＋ New AM', search: 'Search by name or contact…', name: 'Name (required)', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
    save: 'Save', saving: 'Saving…', cancelEdit: 'Cancel',
    edit: 'Edit', deactivate: 'Deactivate', activate: 'Activate', active: 'Active', inactive: 'Inactive',
    empty: 'No account managers yet.', joined: 'Added', vName: 'Name is required.',
    deactivateHint: 'Deactivated AMs disappear from the new-task dropdown; existing tasks are unaffected.',
    bound: 'Bound', unbound: 'Not bound', bind: 'Bind login', unbind: 'Unbind', dlgCancel: 'Cancel',
    del: 'Delete', delQ: 'Deleting releases their roster, clears task ownership and turns the login back into a regular user. AMs with commission/wallet history cannot be deleted (use Deactivate). Confirm?', confirmDel: 'Delete AM',
    bindQ: 'Enter the email they registered with (they must sign up first):', unbindQ: 'Unbinding turns the account back into a regular user. Confirm?',
    payout: 'Record payout', payoutQ: 'Payout amount (USD), optionally followed by a note, e.g. "100 June commission"',
    payoutBad: 'Bad amount format.', ratesTitle: 'Commission rates', ratesSave: 'Save rates', ratesSaved: 'Rates saved.',
    itemsTitle: 'Other sub-rates (custom)', itemsHint: '"Other" tasks can carry one sub-rate; priority = per-task override → sub-rate → "Other" rate.', itemLabel: 'Label, e.g. Errand', itemAmount: 'Amount', itemAdd: 'Add', itemDel: 'Delete', itemsSave: 'Save sub-rates', itemsSaved: 'Sub-rates saved.', vItem: 'Sub-rate label is required.',
    joinTitle: 'Staff sign-up channel', joinDesc: 'Privately send the URL and invite code to a new teammate. After they register they appear under "Pending" below — assign them as an account manager or admin. Nothing on the site links to this page.',
    joinUrl: 'Sign-up URL', codeLabel: 'Invite code', copy: 'Copy', copied: 'Copied ✓', saveCode: 'Save code', codeSaved: 'Invite code updated.', vCode: 'Invite code cannot be empty.',
    pendingTitle: 'Pending staff', pendingEmpty: 'No pending registrations.', setAm: 'Make AM', setAdmin: 'Make admin', rejectStaff: 'Reject',
    setAdminQ: 'Admin grants full power (manage all AMs, tasks, reviews, bans). Confirm?', rejectStaffQ: 'Rejecting deletes this registration permanently. Confirm?', confirmAdmin: 'Make admin', confirmReject: 'Reject & delete',
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
  const [items, setItems] = useState<{ id: string; label: string; amount: string }[]>([])
  const [newItem, setNewItem] = useState({ label: '', amount: '' })
  const [itemsMsg, setItemsMsg] = useState(false)
  const [itemsBusy, setItemsBusy] = useState(false)
  const [delFor, setDelFor] = useState<AccountManager | null>(null)
  const [unbindFor, setUnbindFor] = useState<AccountManager | null>(null)
  const [payoutFor, setPayoutFor] = useState<AccountManager | null>(null)
  const [busy, setBusy] = useState(false)
  // 员工通道
  const [pending, setPending] = useState<PendingStaff[]>([])
  const [code, setCode] = useState('')
  const [codeMsg, setCodeMsg] = useState(false)
  const [copied, setCopied] = useState(false)
  const [adminFor, setAdminFor] = useState<PendingStaff | null>(null)
  const [rejectFor, setRejectFor] = useState<PendingStaff | null>(null)
  const joinUrl = `${window.location.origin}/staff/join`

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('account_managers').select('*').order('created_at', { ascending: false })
    if (e) { setError(e.message); return }
    setRows((data ?? []) as AccountManager[])
  }, [])

  const loadStaff = useCallback(async () => {
    const [ps, st] = await Promise.all([
      supabase.rpc('list_pending_staff'),
      supabase.from('app_settings').select('value').eq('key', 'staff_invite_code').maybeSingle(),
    ])
    setPending((ps.data ?? []) as PendingStaff[])
    const row = st.data as { value: string } | null
    if (row) setCode(row.value)
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
    if (e) { setError(e.message); return }
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
      if (e) { setError(e.message); setItemsBusy(false); return }
    }
    setItemsBusy(false); setItemsMsg(true)
    await loadItems()
  }

  async function delItem(id: string) {
    setError(null); setItemsMsg(false)
    const { error: e } = await supabase.from('custom_rate_items').delete().eq('id', id)
    if (e) { setError(e.message); return }
    await loadItems()
  }
  useEffect(() => { void loadStaff() }, [loadStaff])

  async function saveCode() {
    setError(null); setCodeMsg(false)
    const v = code.trim()
    if (!v) { setError(t.vCode); return }
    const { error: e } = await supabase.from('app_settings').update({ value: v }).eq('key', 'staff_invite_code')
    if (e) { setError(e.message); return }
    setCodeMsg(true)
  }

  async function copyJoin() {
    try {
      await navigator.clipboard.writeText(`${joinUrl}\n${code}`)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* 剪贴板不可用则忽略 */ }
  }

  async function activate(u: PendingStaff, role: 'am' | 'admin') {
    setAdminFor(null); setError(null)
    const { error: e } = await supabase.rpc('activate_staff', { p_user: u.id, p_role: role })
    if (e) { setError(e.message); return }
    await Promise.all([loadStaff(), load()])
  }

  async function doRejectStaff() {
    const u = rejectFor; setRejectFor(null)
    if (!u) return
    setError(null)
    const { error: e } = await supabase.rpc('reject_staff', { p_user: u.id })
    if (e) { setError(e.message); return }
    await loadStaff()
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
    if (e) { setError(e.message); return }
    setRatesMsg(true)
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

      {/* 员工注册通道 */}
      <Card className="mb-5 p-5">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.joinTitle}</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">{t.joinDesc}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
          <div>
            <Label>{t.joinUrl}</Label>
            <Input readOnly value={joinUrl} className="font-mono text-xs" onFocus={e => e.currentTarget.select()} />
          </div>
          <div>
            <Label>{t.codeLabel}</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} className="font-mono text-sm" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button className="px-3 py-1.5 text-xs" onClick={() => void copyJoin()}>{copied ? t.copied : t.copy}</Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void saveCode()}>{t.saveCode}</Button>
          {codeMsg && <span className="text-sm text-verified-text">{t.codeSaved}</span>}
        </div>
      </Card>

      {/* 待激活员工 */}
      <Card className="mb-5 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.pendingTitle}</p>
        {pending.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.pendingEmpty}</p>
        ) : pending.map(u => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{u.display_name ?? u.email}</p>
              <p className="mt-0.5 font-mono text-xs text-faint">{u.email} · {dateShort(u.created_at)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="px-3 py-1.5 text-xs" onClick={() => void activate(u, 'am')}>{t.setAm}</Button>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setAdminFor(u)}>{t.setAdmin}</Button>
              <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => setRejectFor(u)}>{t.rejectStaff}</Button>
            </div>
          </div>
        ))}
      </Card>

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
        open={adminFor !== null}
        title={t.setAdmin}
        hint={t.setAdminQ}
        confirmLabel={t.confirmAdmin}
        cancelLabel={t.dlgCancel}
        danger={false}
        onConfirm={() => { const u = adminFor; if (u) void activate(u, 'admin') }}
        onClose={() => setAdminFor(null)}
      />
      <ConfirmDialog
        open={rejectFor !== null}
        title={t.rejectStaff}
        hint={t.rejectStaffQ}
        confirmLabel={t.confirmReject}
        cancelLabel={t.dlgCancel}
        onConfirm={() => void doRejectStaff()}
        onClose={() => setRejectFor(null)}
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
            if (e) { setError(e.message); return }
            await load()
          })()
        }}
        onClose={() => setDelFor(null)}
      />
    </div>
  )
}
