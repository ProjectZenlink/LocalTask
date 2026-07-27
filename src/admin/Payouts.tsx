import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PayoutRequest, Profile } from '../types/database'
import { usd, dateTimeShort } from '../lib/format'
import { PageHeading, Card, Button, Label, Input, Alert, StatusBadge } from '../components/ui'
import { PromptDialog } from './bits'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '提现',
    sub: 'freelancer 的统一提现工单。审核即打款:核对收款方式,打款后填凭证标记;有问题就驳回,各项自动回滚。',
    tabs: { pending: '待处理', paid: '已打款待确认', history: '历史' },
    empty: '这里空空如也。',
    am: '归属 AM', noAm: '无归属 · admin 兜底', fl: 'Freelancer',
    payTo: '收款方式', noPay: '未设置收款方式',
    items: '打包明细', bonusSignup: '注册奖励', grant7: '连续签到 7 天', grant15: '连续签到 15 天', grant30: '连续签到 30 天',
    txRef: '打款凭证号(TXID / PP-…,可选)', note: '备注(可选,freelancer 可见)',
    markPaid: '标记已打款', marking: '提交中…', reject: '驳回', rejectQ: '驳回原因(必填,freelancer 可见;各项将回滚为可重新申请):',
    cancel: '取消',
    stPending: '待处理', stPaid: '待 freelancer 确认', stDone: '已完成', stRejected: '已驳回',
    decided: '处理于', confirmed: '确认于', reason: '原因', refWord: '凭证',
    refresh: '刷新',
  },
  en: {
    title: 'Payouts',
    sub: 'Unified payout requests from freelancers. Review = pay: check the payout method, send the money, record the reference — or reject with a reason and everything rolls back.',
    tabs: { pending: 'Pending', paid: 'Sent · awaiting confirm', history: 'History' },
    empty: 'Nothing here.',
    am: 'AM', noAm: 'Unassigned · admin fallback', fl: 'Freelancer',
    payTo: 'Payout method', noPay: 'No payout method set',
    items: 'Bundle', bonusSignup: 'Signup bonus', grant7: '7-day streak', grant15: '15-day streak', grant30: '30-day streak',
    txRef: 'Payment reference (TXID / PP-…, optional)', note: 'Note (optional, visible to freelancer)',
    markPaid: 'Mark as paid', marking: 'Submitting…', reject: 'Reject', rejectQ: 'Reject reason (required, visible to the freelancer; items roll back so they can request again):',
    cancel: 'Cancel',
    stPending: 'Pending', stPaid: 'Awaiting freelancer confirm', stDone: 'Completed', stRejected: 'Rejected',
    decided: 'Decided', confirmed: 'Confirmed', reason: 'Reason', refWord: 'ref',
    refresh: 'Refresh',
  },
}

type Tab = 'pending' | 'paid' | 'history'
type FlLite = Pick<Profile, 'id' | 'display_name' | 'full_name' | 'payout_method' | 'payout_network' | 'payout_token' | 'payout_address' | 'payout_paypal_email'>

/** 提现工单处理台(v48):admin 与 AM 共用同一组件,RLS 自动分域(AM 只见名下,admin 全量)。 */
export default function Payouts() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<PayoutRequest[]>([])
  const [fls, setFls] = useState<Map<string, FlLite>>(new Map())
  const [amMap, setAmMap] = useState<Map<string, string>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState<string | null>(null)
  const [tx, setTx] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [rejFor, setRejFor] = useState<PayoutRequest | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    const [r, a] = await Promise.all([
      supabase.from('payout_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('account_managers').select('id, name'),
    ])
    if (r.error) { setErr(r.error.message); setLoaded(true); return }
    const list = (r.data ?? []) as PayoutRequest[]
    setRows(list)
    setAmMap(new Map(((a.data ?? []) as { id: string; name: string }[]).map(x => [x.id, x.name])))
    const ids = Array.from(new Set(list.map(x => x.user_id)))
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles')
        .select('id, display_name, full_name, payout_method, payout_network, payout_token, payout_address, payout_paypal_email')
        .in('id', ids)
      setFls(new Map(((data ?? []) as FlLite[]).map(x => [x.id, x])))
    }
    setLoaded(true)
  }, [])
  useEffect(() => { void load() }, [load])

  async function markPaid(id: string) {
    setBusy(id); setErr(null)
    const { error: e } = await supabase.rpc('payout_mark_paid', {
      p_request: id, p_tx_ref: tx.trim() || null, p_note: note.trim() || null,
    })
    setBusy(null)
    if (e) { setErr(e.message); return }
    setOpenForm(null); setTx(''); setNote('')
    await load()
  }

  async function doReject(reason: string) {
    const r = rejFor; setRejFor(null)
    if (!r) return
    setBusy(r.id); setErr(null)
    const { error: e } = await supabase.rpc('payout_reject', { p_request: r.id, p_reason: reason })
    setBusy(null)
    if (e) { setErr(e.message); return }
    await load()
  }

  const itemLabel = (i: { kind: string; label: string }) =>
    i.kind === 'signup' ? t.bonusSignup
    : i.kind === 'grant' ? (i.label === 'streak_7' ? t.grant7 : i.label === 'streak_15' ? t.grant15 : i.label === 'streak_30' ? t.grant30 : i.label)
    : i.label

  const flName = (id: string) => {
    const f = fls.get(id)
    return f?.display_name || f?.full_name || id.slice(0, 8)
  }
  const payLine = (id: string) => {
    const f = fls.get(id)
    if (!f) return '…'
    if (f.payout_method === 'paypal') return f.payout_paypal_email ? `PayPal · ${f.payout_paypal_email}` : t.noPay
    if (!f.payout_address) return t.noPay
    return `${(f.payout_token ?? '').toUpperCase()} · ${(f.payout_network ?? '').toUpperCase()} · ${f.payout_address}`
  }

  const filtered = rows.filter(r =>
    tab === 'pending' ? r.status === 'pending'
    : tab === 'paid' ? r.status === 'paid_pending_confirm'
    : r.status === 'completed' || r.status === 'rejected')

  const counts: Record<Tab, number> = {
    pending: rows.filter(r => r.status === 'pending').length,
    paid: rows.filter(r => r.status === 'paid_pending_confirm').length,
    history: rows.filter(r => r.status === 'completed' || r.status === 'rejected').length,
  }

  if (!loaded) return <div className="text-muted">…</div>

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void load()}>{t.refresh}</Button>
      </div>
      {err && <Alert tone="error">{err}</Alert>}

      <div className="mb-4 flex gap-2">
        {(['pending', 'paid', 'history'] as Tab[]).map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
              tab === k ? 'border-petrol bg-petrol text-paper' : 'border-hair bg-white text-muted hover:text-ink'}`}>
            {t.tabs[k]}{counts[k] > 0 && ` · ${counts[k]}`}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {filtered.length === 0 ? (
          <p className="py-2 text-center text-sm text-faint">{t.empty}</p>
        ) : filtered.map(r => (
          <div key={r.id} className="border-b border-hair py-4 first:pt-1 last:border-b-0 last:pb-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {flName(r.user_id)}
                  <span className="ml-2 font-display text-base tracking-tight">{usd(r.total)}</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-faint">
                  {dateTimeShort(r.created_at)} · {t.am}: {r.am_id ? (amMap.get(r.am_id) ?? r.am_id.slice(0, 6)) : t.noAm}
                </p>
              </div>
              <StatusBadge
                status={r.status === 'completed' ? 'verified' : r.status === 'rejected' ? 'unverified' : 'pending'}
                label={r.status === 'pending' ? t.stPending : r.status === 'paid_pending_confirm' ? t.stPaid : r.status === 'completed' ? t.stDone : t.stRejected}
              />
            </div>

            <p className="mt-2 break-all font-mono text-[11px] text-muted">{t.payTo}: {payLine(r.user_id)}</p>

            <div className="mt-2 space-y-0.5">
              {r.items.map((i, idx) => (
                <p key={idx} className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-muted">
                  <span className="truncate">{itemLabel(i)}</span>
                  <span className="shrink-0">{usd(i.amount)}</span>
                </p>
              ))}
            </div>

            {(r.tx_ref || r.note) && (
              <p className="mt-2 font-mono text-[11px] text-faint">
                {r.tx_ref && <>{t.refWord} {r.tx_ref}</>}
                {r.tx_ref && r.note && ' · '}
                {r.note}
              </p>
            )}
            {r.status === 'rejected' && r.reject_reason && (
              <p className="mt-1.5 text-xs text-muted">{t.reason}: {r.reject_reason}</p>
            )}
            {r.decided_at && r.status !== 'pending' && (
              <p className="mt-1 font-mono text-[11px] text-faint">
                {t.decided} {dateTimeShort(r.decided_at)}
                {r.confirmed_at && <> · {t.confirmed} {dateTimeShort(r.confirmed_at)}</>}
              </p>
            )}

            {r.status === 'pending' && (
              openForm === r.id ? (
                <div className="mt-3 rounded-xl border border-hair bg-paper p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div><Label>{t.txRef}</Label><Input value={tx} onChange={e => setTx(e.target.value)} className="font-mono text-xs" /></div>
                    <div><Label>{t.note}</Label><Input value={note} onChange={e => setNote(e.target.value)} /></div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button className="px-4 py-2 text-xs" disabled={busy === r.id} onClick={() => void markPaid(r.id)}>
                      {busy === r.id ? t.marking : t.markPaid}
                    </Button>
                    <Button variant="ghost" className="px-4 py-2 text-xs" onClick={() => { setOpenForm(null); setTx(''); setNote('') }}>{t.cancel}</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button className="px-4 py-2 text-xs" onClick={() => { setOpenForm(r.id); setTx(''); setNote('') }}>{t.markPaid}</Button>
                  <Button variant="ghost" className="px-4 py-2 text-xs" disabled={busy === r.id} onClick={() => setRejFor(r)}>{t.reject}</Button>
                </div>
              )
            )}
          </div>
        ))}
      </Card>

      <PromptDialog
        open={!!rejFor}
        title={t.reject}
        hint={t.rejectQ}
        confirmLabel={t.reject}
        cancelLabel={t.cancel}
        danger
        onConfirm={v => void doReject(v)}
        onClose={() => setRejFor(null)}
      />
    </div>
  )
}
