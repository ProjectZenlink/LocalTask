import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { LedgerRow, CommissionRate } from '../types/database'
import { usd, dateShort, typeLabel } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

type Row = LedgerRow & { freelancer: { display_name: string | null } | null }
type PendRow = { id: string; amount: number; task_type: string; created_at: string; freelancer: { display_name: string | null } | null }

const COPY = {
  zh: { title: '钱包', sub: '提成账本:验收→平台复核通过后记一笔,发放由平台标记冲减。',
        total: '累计提成', paid: '已发放', balance: '余额', pending: '待复核', pendT: '待复核明细(点卡片收起)', pendEmpty: '没有等待复核的验收。', history: '流水', fAll: '全部', fMonth: '本月', fLastMonth: '上月', f30: '近30天', fPeriod: '期间', fNet: '净', empty: '还没有流水。',
        rates: '当前费率（可调整）', commission: '提成', payout: '发放' },
  en: { title: 'Wallet', sub: 'Commission ledger: booked after platform approval; payouts are marked by the platform.',
        total: 'Total earned', paid: 'Paid out', balance: 'Balance', pending: 'In review', pendT: 'In review — details (tap card to close)', pendEmpty: 'Nothing awaiting review.', history: 'History', fAll: 'All', fMonth: 'This mo', fLastMonth: 'Last mo', f30: '30d', fPeriod: 'Period', fNet: 'net', empty: 'No entries yet.',
        rates: 'Current rates (adjustable)', commission: 'Commission', payout: 'Payout' },
}

export default function AmWallet() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<Row[]>([])
  const [rates, setRates] = useState<CommissionRate[]>([])
  const [items, setItems] = useState<{ id: string; label: string; amount: number }[]>([])
  const [dFrom, setDFrom] = useState('')
  const [dTo, setDTo] = useState('')
  const [pendingSum, setPendingSum] = useState(0)
  const [pendItems, setPendItems] = useState<PendRow[]>([])
  const [sp] = useSearchParams()
  const [showPending, setShowPending] = useState(sp.get('focus') === 'pending')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!am) return
    const [l, r, itemsRes, paRes] = await Promise.all([
      supabase.from('am_wallet_ledger')
        .select('*, freelancer:profiles!am_wallet_ledger_freelancer_id_fkey(display_name)')
        .eq('am_id', am.id).order('created_at', { ascending: false }),
      supabase.from('commission_rates').select('*').order('task_type'),
      supabase.from('custom_rate_items').select('id, label, amount').eq('is_active', true).order('created_at'),
      supabase.from('platform_acceptances')
        .select('id, amount, task_type, created_at, freelancer:profiles!platform_acceptances_freelancer_id_fkey(display_name)')
        .eq('am_id', am.id).eq('status', 'pending_admin')
        .order('created_at', { ascending: false }),
    ])
    setRows((l.data ?? []) as unknown as Row[])
    setRates((r.data ?? []) as CommissionRate[])
    setItems((itemsRes.data ?? []) as { id: string; label: string; amount: number }[])
    const pRows = (paRes.data ?? []) as unknown as PendRow[]
    setPendItems(pRows)
    setPendingSum(pRows.reduce((a, x) => a + Number(x.amount), 0))
    setLoaded(true)
  }, [am])

  useEffect(() => { void load() }, [load])

  if (!am || !loaded) return <p className="text-muted">…</p>

  const sum = (k: 'commission' | 'payout') =>
    rows.filter(x => x.kind === k).reduce((a, x) => a + Number(x.amount), 0)
  const total = sum('commission')
  const paid = sum('payout')

  const inRange = (iso: string) => {
    const d = iso.slice(0, 10)
    if (dFrom && d < dFrom) return false
    if (dTo && d > dTo) return false
    return true
  }
  const filtered = (dFrom || dTo) ? rows.filter(r => inRange(r.created_at)) : rows
  const pIn  = filtered.filter(r => r.kind === 'commission').reduce((a, r) => a + Number(r.amount), 0)
  const pOut = filtered.filter(r => r.kind !== 'commission').reduce((a, r) => a + Number(r.amount), 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const preset = (k: 'all' | 'month' | 'lastMonth' | '30d') => {
    const now = new Date()
    if (k === 'all') { setDFrom(''); setDTo(''); return }
    if (k === '30d') { setDFrom(iso(new Date(Date.now() - 30 * 86400000))); setDTo(iso(now)); return }
    if (k === 'month') { setDFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setDTo(iso(now)); return }
    setDFrom(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
    setDTo(iso(new Date(now.getFullYear(), now.getMonth(), 0)))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      {/* 余额主卡:petrol 深底,余额是这页的唯一主角 */}
      <div className="mb-3 overflow-hidden rounded-2xl bg-petrol p-6 text-paper shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">{t.balance}</p>
        <p className="mt-1 font-display text-4xl font-medium tracking-tight">{usd(total - paid)}</p>
        <p className="mt-2 font-mono text-xs text-paper/60">{t.total} {usd(total)} · {t.paid} {usd(paid)}</p>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {([
          { label: t.total, v: total, cls: 'text-ink' },
          { label: t.paid, v: paid, cls: 'text-muted' },
          { label: t.pending, v: pendingSum, cls: 'text-pending-text', onClick: () => setShowPending(v => !v) },
        ] as { label: string; v: number; cls: string; onClick?: () => void }[]).map(x => (
          <Card key={x.label} onClick={x.onClick}
            className={`p-4 text-center ${x.onClick ? 'cursor-pointer transition hover:border-petrol/40' : ''}`}>
            <p className={`font-display text-xl font-medium tracking-tight ${x.cls}`}>{usd(x.v)}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x.label}</p>
          </Card>
        ))}
      </div>
      {showPending && (
        <Card className="mb-5">
          <p className="border-b border-hair px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.pendT}</p>
          {pendItems.length === 0 ? (
            <p className="p-5 text-sm text-faint">{t.pendEmpty}</p>
          ) : pendItems.map(pi => (
            <div key={pi.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3 last:border-b-0">
              <div>
                <p className="text-sm text-ink">{pi.freelancer?.display_name ?? '—'} · {typeLabel(pi.task_type as never, lang)}</p>
                <p className="mt-0.5 font-mono text-[11px] text-faint">{dateShort(pi.created_at)}</p>
              </div>
              <span className="font-display font-medium text-pending-text">{usd(Number(pi.amount))}</span>
            </div>
          ))}
        </Card>
      )}

      <Card className="mb-5 p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>{t.history}</Eyebrow>
          <div className="flex flex-wrap items-center gap-1.5">
            {([['all', t.fAll], ['month', t.fMonth], ['lastMonth', t.fLastMonth], ['30d', t.f30]] as const).map(([k, lb]) => (
              <button key={k} onClick={() => preset(k)}
                className="rounded-full border border-hair px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:border-petrol/40 hover:text-ink">
                {lb}
              </button>
            ))}
            <input type="date" value={dFrom} onChange={e => setDFrom(e.target.value)}
              className="rounded-lg border border-hair bg-white px-2 py-1 font-mono text-[11px] text-ink focus:border-petrol focus:outline-none" />
            <span className="text-faint">–</span>
            <input type="date" value={dTo} onChange={e => setDTo(e.target.value)}
              className="rounded-lg border border-hair bg-white px-2 py-1 font-mono text-[11px] text-ink focus:border-petrol focus:outline-none" />
          </div>
        </div>
        {(dFrom || dTo) && (
          <p className="mb-2 rounded-lg bg-paper px-3 py-1.5 font-mono text-xs text-muted">
            {t.fPeriod}: <span className="text-verified-text">+{usd(pIn)}</span> · <span className="text-danger-text">−{usd(pOut)}</span> · {t.fNet} <span className="text-ink">{usd(pIn - pOut)}</span>
          </p>
        )}
        {filtered.length === 0 ? (
          <p className="py-2 text-sm text-faint">{t.empty}</p>
        ) : filtered.map((r, i) => {
          const month = r.created_at.slice(0, 7)
          const showMonth = i === 0 || filtered[i - 1].created_at.slice(0, 7) !== month
          return (
            <div key={r.id}>
              {showMonth && (
                <p className="border-b border-hair pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-faint first:pt-0">{month}</p>
              )}
              <div className="flex items-center justify-between gap-3 border-b border-hair py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {r.kind === 'commission'
                      ? `${t.commission} · ${typeLabel(r.task_type, lang)} · ${r.freelancer?.display_name ?? '—'}`
                      : `${t.payout}${r.note ? ` · ${r.note}` : ''}`}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-faint">{dateShort(r.created_at)}</p>
                </div>
                <p className={`shrink-0 font-mono text-sm ${r.kind === 'commission' ? 'text-verified-text' : 'text-danger-text'}`}>
                  {r.kind === 'commission' ? '+' : '−'}{usd(Number(r.amount))}
                </p>
              </div>
            </div>
          )
        })}
      </Card>

      <Card className="p-5">
        <div className="mb-2"><Eyebrow>{t.rates}</Eyebrow></div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
          {rates.map(r => (
            <p key={r.task_type} className="flex justify-between font-mono text-xs text-muted">
              <span>{typeLabel(r.task_type, lang)}</span><span className="text-ink">{usd(Number(r.amount))}
          {items.map(it => (
            <p key={it.id} className="flex justify-between font-mono text-xs text-muted">
              <span>{lang === 'zh' ? `其他（${it.label}）` : `Other (${it.label})`}</span><span className="text-ink">{usd(Number(it.amount))}</span>
            </p>
          ))}</span>
            </p>
          ))}
          {items.map(it => (
            <p key={it.id} className="flex justify-between font-mono text-xs text-muted">
              <span>{lang === 'zh' ? `其他（${it.label}）` : `Other (${it.label})`}</span><span className="text-ink">{usd(Number(it.amount))}</span>
            </p>
          ))}
        </div>
      </Card>
    </div>
  )
}
