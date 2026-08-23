import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PayoutRequest } from '../types/database'
import { payoutLabel } from '../types/database'
import type { ChainNetwork, TokenSymbol, PayoutMethod } from '../types/database'
import { usd, dateTimeShort, shortHash } from '../lib/format'
import { PageHeading, Card, Button, Alert } from '../components/ui'
import { PromptDialog, ConfirmDialog } from '../components/dialogs'
import { useLang } from './i18n'
import { friendly } from '../lib/errors'

interface FlLite {
  display_name: string | null
  payout_method: PayoutMethod
  payout_network: ChainNetwork | null
  payout_token: TokenSymbol | null
  payout_address: string | null
  payout_paypal_email: string | null
}
type Row = PayoutRequest & { fl: FlLite | null }

const COPY = {
  zh: {
    title: '提现', sub: 'freelancer 的统一提现工单。审核即打款:核对收款方式,打款即完结;有问题就驳回,各项自动回滚。',
    tabPending: '待处理', tabPaid: '已打款', tabHist: '历史',
    owner: '归属 AM', method: '收款方式', decidedAt: '处理于', noMethod: '(未设置收款方式)',
    pay: '打款', payHint: '确认已把钱打给对方?打款即完结。', reject: '驳回', rejectQ: '驳回原因(可选):',
    chipPending: '待打款', chipPaid: '已打款', chipDone: '已确认', chipRejected: '已驳回',
    refresh: '刷新', empty: '这里空空如也。', reason: '原因',
  },
  en: {
    title: 'Payouts', sub: 'Unified payout work orders. Verify the payout method, send the money — payment closes the order. Reject to roll everything back.',
    tabPending: 'Pending', tabPaid: 'Paid', tabHist: 'History',
    owner: 'Owner AM', method: 'Payout method', decidedAt: 'Processed', noMethod: '(no payout method set)',
    pay: 'Mark paid', payHint: 'Confirm the money has been sent? Payment closes the order.', reject: 'Reject', rejectQ: 'Rejection reason (optional):',
    chipPending: 'To pay', chipPaid: 'Paid', chipDone: 'Confirmed', chipRejected: 'Rejected',
    refresh: 'Refresh', empty: 'Nothing here.', reason: 'Reason',
  },
}

/** 提现工单(v49 合流,方案甲):待处理需动作;已打款待确认=历史的筛选视图;确认与否不阻塞。 */
export default function AdminPayouts() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [rows, setRows] = useState<Row[]>([])
  const [ams, setAms] = useState<Map<string, string>>(new Map())
  const [tab, setTab] = useState<'pending' | 'paid' | 'hist'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([
      supabase.from('payout_requests')
        .select('*, fl:profiles!user_id(display_name, payout_method, payout_network, payout_token, payout_address, payout_paypal_email)')
        .order('created_at', { ascending: false }),
      supabase.from('account_managers').select('id, name'),
    ])
    if (r.error) { setError(friendly(r.error)); return }
    setRows((r.data ?? []) as unknown as Row[])
    setAms(new Map(((a.data ?? []) as { id: string; name: string }[]).map(x => [x.id, x.name])))
  }, [])
  useEffect(() => { void load() }, [load])

  async function act(kind: 'pay' | 'reject', id: string, input?: string) {
    setBusy(id); setError(null)
    const { error: e } = kind === 'pay'
      ? await supabase.rpc('payout_mark_paid', { p_id: id, p_tx: input?.trim() || null })
      : await supabase.rpc('payout_reject', { p_id: id, p_reason: input?.trim() || null })
    setBusy(null)
    if (e) { setError(friendly(e)); return }
    await load()
  }

  const pending = rows.filter(r => r.status === 'pending')
  const paid = rows.filter(r => r.status === 'paid_pending_confirm')
  const hist = rows.filter(r => r.status !== 'pending')
  const shown = tab === 'pending' ? pending : tab === 'paid' ? paid : hist

  const methodText = (fl: FlLite | null) => {
    if (!fl) return t.noMethod
    if (fl.payout_method === 'paypal' && fl.payout_paypal_email) return `PayPal · ${fl.payout_paypal_email}`
    if (fl.payout_network && fl.payout_token && fl.payout_address)
      return `${payoutLabel(fl.payout_network, fl.payout_token)} · ${fl.payout_address}`
    return t.noMethod
  }
  const chip = (s: Row['status']) => {
    const map = {
      pending: ['border-pending-border bg-pending-bg text-pending-text', t.chipPending],
      paid_pending_confirm: ['border-hair bg-white text-faint', t.chipPaid],
      completed: ['border-verified-border bg-verified-bg text-verified-text', t.chipDone],
      rejected: ['border-danger-border bg-danger-bg text-danger-text', t.chipRejected],
    } as const
    const [cls, label] = map[s]
    return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{label}</span>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Button variant="ghost" className="px-3.5 py-1.5 text-xs" onClick={() => void load()}>{t.refresh}</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mb-5 flex flex-wrap gap-2.5">
        {/* 已打款页签不带数字:打款即完结(方案甲) */}
        {([['pending', t.tabPending, pending.length], ['paid', t.tabPaid, null], ['hist', t.tabHist, hist.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${tab === k ? 'border-petrol bg-petrol text-paper' : 'border-hair bg-white text-muted hover:text-ink'}`}>
            {label}{n !== null ? ` · ${n}` : ''}
          </button>
        ))}
      </div>
      <Card className="p-5">
        {shown.length === 0 && <p className="py-6 text-center text-sm text-faint">{t.empty}</p>}
        <div className="space-y-5">
          {shown.map(r => (
            <div key={r.id} className="border-b border-hair pb-5 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{r.fl?.display_name ?? '—'} <span className="ml-1 font-mono">{usd(Number(r.total))}</span></p>
                  <p className="mt-1 font-mono text-[11px] text-faint">{dateTimeShort(r.created_at)} · {t.owner}: {r.am_id ? ams.get(r.am_id) ?? '—' : '—'}</p>
                  <p className="mt-1.5 break-all font-mono text-[11px] text-muted">{t.method}: {methodText(r.fl)}</p>
                  <div className="mt-1.5 space-y-0.5">
                    {r.items.map((it, i) => (
                      <p key={i} className="flex items-baseline justify-between gap-4 font-mono text-[11px] text-muted">
                        <span className="truncate">{it.label}</span><span className="shrink-0 text-ink">{usd(Number(it.amount))}</span>
                      </p>
                    ))}
                  </div>
                  {r.tx_ref && <p className="mt-1.5 font-mono text-[11px] text-faint">tx: {shortHash(r.tx_ref)}</p>}
                  {r.reject_reason && <p className="mt-1.5 font-mono text-[11px] text-danger-text">{t.reason}: {r.reject_reason}</p>}
                  {r.decided_at && <p className="mt-1 font-mono text-[10px] text-faint">{t.decidedAt} {dateTimeShort(r.decided_at)}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {r.status === 'pending' ? (
                    <>
                      <Button className="px-3.5 py-1.5 text-xs" disabled={busy === r.id} onClick={() => setPayFor(r.id)}>{busy === r.id ? '…' : t.pay}</Button>
                      <Button variant="ghost" className="px-3.5 py-1.5 text-xs" disabled={busy === r.id} onClick={() => setRejectFor(r.id)}>{t.reject}</Button>
                    </>
                  ) : chip(r.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog open={payFor !== null} title={t.pay} hint={t.payHint} confirmLabel={t.pay} cancelLabel="—" danger={false}
        onConfirm={() => { const id = payFor!; setPayFor(null); void act('pay', id) }} onClose={() => setPayFor(null)} />
      <PromptDialog open={rejectFor !== null} title={t.reject} hint={t.rejectQ} confirmLabel={t.reject} cancelLabel="—" danger
        onConfirm={v => { const id = rejectFor!; setRejectFor(null); void act('reject', id, v) }} onClose={() => setRejectFor(null)} />
    </div>
  )
}
