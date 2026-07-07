import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LedgerRow, CommissionRate } from '../types/database'
import { usd, dateShort } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

type Row = LedgerRow & { freelancer: { display_name: string | null } | null }

const COPY = {
  zh: { title: '钱包', sub: '提成账本:验收一项记一笔,发放由平台标记冲减。',
        total: '累计提成', paid: '已发放', balance: '余额', history: '流水', empty: '还没有流水。',
        rates: '当前费率(平台维护)', commission: '提成', payout: '发放' },
  en: { title: 'Wallet', sub: 'Commission ledger: each acceptance books one entry; payouts are marked by the platform.',
        total: 'Total earned', paid: 'Paid out', balance: 'Balance', history: 'History', empty: 'No entries yet.',
        rates: 'Current rates (set by platform)', commission: 'Commission', payout: 'Payout' },
}

export default function AmWallet() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<Row[]>([])
  const [rates, setRates] = useState<CommissionRate[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!am) return
    const [l, r] = await Promise.all([
      supabase.from('am_wallet_ledger')
        .select('*, freelancer:profiles!am_wallet_ledger_freelancer_id_fkey(display_name)')
        .eq('am_id', am.id).order('created_at', { ascending: false }),
      supabase.from('commission_rates').select('*').order('task_type'),
    ])
    setRows((l.data ?? []) as unknown as Row[])
    setRates((r.data ?? []) as CommissionRate[])
    setLoaded(true)
  }, [am])

  useEffect(() => { void load() }, [load])

  if (!am || !loaded) return <p className="text-muted">…</p>

  const sum = (k: 'commission' | 'payout') =>
    rows.filter(x => x.kind === k).reduce((a, x) => a + Number(x.amount), 0)
  const total = sum('commission')
  const paid = sum('payout')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: t.total, v: total, cls: 'text-ink' },
          { label: t.paid, v: paid, cls: 'text-muted' },
          { label: t.balance, v: total - paid, cls: 'text-petrol' },
        ].map(x => (
          <Card key={x.label} className="p-4 text-center">
            <p className={`font-display text-2xl font-medium tracking-tight ${x.cls}`}>{usd(x.v)}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x.label}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-5 p-5">
        <div className="mb-2"><Eyebrow>{t.history}</Eyebrow></div>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-faint">{t.empty}</p>
        ) : rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-b border-hair py-2.5 last:border-b-0">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {r.kind === 'commission'
                  ? `${t.commission} · ${r.task_type ?? '—'} · ${r.freelancer?.display_name ?? '—'}`
                  : `${t.payout}${r.note ? ` · ${r.note}` : ''}`}
              </p>
              <p className="mt-0.5 font-mono text-xs text-faint">{dateShort(r.created_at)}</p>
            </div>
            <p className={`shrink-0 font-mono text-sm ${r.kind === 'commission' ? 'text-verified-text' : 'text-danger-text'}`}>
              {r.kind === 'commission' ? '+' : '−'}{usd(Number(r.amount))}
            </p>
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <div className="mb-2"><Eyebrow>{t.rates}</Eyebrow></div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
          {rates.map(r => (
            <p key={r.task_type} className="flex justify-between font-mono text-xs text-muted">
              <span>{r.task_type}</span><span className="text-ink">{usd(Number(r.amount))}</span>
            </p>
          ))}
        </div>
      </Card>
    </div>
  )
}
