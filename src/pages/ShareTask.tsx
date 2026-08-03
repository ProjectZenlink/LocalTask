import { useEffect, useState } from 'react'
import LogoMark from '../components/LogoMark'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { TaskStatus, ChainNetwork, TokenSymbol } from '../types/database'
import { payoutLabel } from '../types/database'
import { usd, money, dateTimeShort, txUrl, shortHash } from '../lib/format'
import { PP_KEY, pick, K_PAYOUT_PP_EMAIL } from '../lib/brand'
import { Card, StatusBadge, SectionTitle, Linkified } from '../components/ui'

interface SharedTask {
  title: string
  description: string | null
  acceptance_criteria: string
  amount: number
  status: TaskStatus
  deadline: string | null
  payout_network: ChainNetwork | null
  payout_token: TokenSymbol | null
  payout_address: string | null
  payout_method: string | null
  payout_paypal_email: string | null
  tx_hash: string | null
  created_at: string
}

const STATUS_ZH: Record<TaskStatus, { label: string; s: 'verified' | 'pending' | 'unverified' }> = {
  unassigned: { label: 'Scheduling', s: 'pending' },
  offered: { label: 'Scheduling', s: 'pending' },
  in_progress: { label: 'In progress', s: 'pending' },
  under_review: { label: 'Under review', s: 'pending' },
  pending_payment: { label: 'Awaiting payment', s: 'verified' },
  completed: { label: 'Completed & settled', s: 'verified' },
  cancelled: { label: 'Cancelled', s: 'unverified' },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ShareTask() {
  const { token } = useParams<{ token: string }>()
  const [task, setTask] = useState<SharedTask | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!token || !UUID_RE.test(token)) { setLoaded(true); return }
    supabase.rpc('get_shared_task', { p_token: token }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      setTask((row ?? null) as SharedTask | null)
      setLoaded(true)
    })
  }, [token])

  return (
    <div className="min-h-screen">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-5 py-4">
          <LogoMark className="h-6 w-6 rounded-md" />
          <span className="font-display text-lg font-medium tracking-tight text-ink">LocalTask</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {!loaded ? (
          <p className="text-muted">Loading…</p>
        ) : !task ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted">This link is invalid or has expired. Please ask your contact for a fresh one.</p>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{task.title}</h1>
                <p className="mt-2 font-mono text-xs text-faint">
                  {usd(task.amount)}
                  {task.deadline && <> · Due {dateTimeShort(task.deadline)}</>}
                </p>
              </div>
              <StatusBadge status={STATUS_ZH[task.status].s} label={STATUS_ZH[task.status].label} />
            </div>

            <Card className="mb-5 p-5">
              <SectionTitle>Task brief</SectionTitle>
              {task.description
                ? <p className="text-sm leading-relaxed text-ink"><Linkified text={task.description} /></p>
                : <p className="text-sm text-faint">—</p>}
              <div className="mt-4 border-t border-hair pt-4">
                <SectionTitle>Acceptance criteria</SectionTitle>
                <p className="text-sm leading-relaxed text-ink"><Linkified text={task.acceptance_criteria} /></p>
              </div>
            </Card>

            {(task.payout_method === PP_KEY ? !!pick(task, K_PAYOUT_PP_EMAIL) : (task.payout_address && task.payout_network && task.payout_token)) && (
              <Card className="mb-5 border-verified-border bg-verified-bg p-5">
                <SectionTitle>Payment</SectionTitle>
                <p className="text-sm leading-relaxed text-ink">
                  The task has passed acceptance. Please pay using the details below:
                </p>
                {task.payout_method === PP_KEY ? (
                  <>
                    <p className="mt-2 font-mono text-xs text-ink">{usd(task.amount)} · Payment account</p>
                    <p className="mt-1 break-all font-mono text-xs text-ink">{pick(task, K_PAYOUT_PP_EMAIL)}</p>
                    {task.status === 'completed' && task.tx_hash ? (
                      <p className="mt-3 text-sm text-verified-text">✓ Settled · Ref <span className="font-mono">{shortHash(task.tx_hash)}</span></p>
                    ) : (
                      <p className="mt-3 text-xs text-muted">After paying, please send the receipt to your contact.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-mono text-xs text-ink">
                      {task.payout_token === 'ETH'
                        ? `ETH equal to ${usd(task.amount)} at market rate`
                        : money(task.amount, task.payout_token!)}
                      {' · '}{payoutLabel(task.payout_network!, task.payout_token!)}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-ink">{task.payout_address}</p>
                    {task.status === 'completed' && task.tx_hash ? (
                      <p className="mt-3 text-sm text-verified-text">
                        ✓ Settled · Tx{' '}
                        <a href={txUrl(task.payout_network!, task.tx_hash)} target="_blank" rel="noreferrer"
                          className="font-mono underline underline-offset-2">{shortHash(task.tx_hash)}</a>
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-muted">After paying, please send the transaction hash (TxID) to your contact.</p>
                    )}
                  </>
                )}
              </Card>
            )}

            <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              LocalTask · Read-only page
            </p>
          </>
        )}
      </main>
    </div>
  )
}
