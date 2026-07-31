import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { TaskStatus, ChainNetwork, TokenSymbol } from '../types/database'
import { payoutLabel } from '../types/database'
import { usd, money, dateTimeShort, txUrl, shortHash } from '../lib/format'
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
  unassigned: { label: '安排中', s: 'pending' },
  offered: { label: '安排中', s: 'pending' },
  in_progress: { label: '进行中', s: 'pending' },
  under_review: { label: '交付审核中', s: 'pending' },
  pending_payment: { label: '待您付款', s: 'verified' },
  completed: { label: '已完成并结清', s: 'verified' },
  cancelled: { label: '已取消', s: 'unverified' },
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
          <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
          <span className="font-display text-lg font-medium tracking-tight text-ink">LocalTask</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {!loaded ? (
          <p className="text-muted">加载中…</p>
        ) : !task ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted">链接无效或已失效。请联系您的对接人重新获取。</p>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{task.title}</h1>
                <p className="mt-2 font-mono text-xs text-faint">
                  {usd(task.amount)}
                  {task.deadline && <> · 截止 {dateTimeShort(task.deadline)}</>}
                </p>
              </div>
              <StatusBadge status={STATUS_ZH[task.status].s} label={STATUS_ZH[task.status].label} />
            </div>

            <Card className="mb-5 p-5">
              <SectionTitle>任务说明</SectionTitle>
              {task.description
                ? <p className="text-sm leading-relaxed text-ink"><Linkified text={task.description} /></p>
                : <p className="text-sm text-faint">—</p>}
              <div className="mt-4 border-t border-hair pt-4">
                <SectionTitle>验收标准</SectionTitle>
                <p className="text-sm leading-relaxed text-ink"><Linkified text={task.acceptance_criteria} /></p>
              </div>
            </Card>

            {(task.payout_method === 'paypal' ? !!task.payout_paypal_email : (task.payout_address && task.payout_network && task.payout_token)) && (
              <Card className="mb-5 border-verified-border bg-verified-bg p-5">
                <SectionTitle>付款信息</SectionTitle>
                <p className="text-sm leading-relaxed text-ink">
                  任务已通过验收,请按以下方式付款:
                </p>
                {task.payout_method === 'paypal' ? (
                  <>
                    <p className="mt-2 font-mono text-xs text-ink">{usd(task.amount)} · PayPal</p>
                    <p className="mt-1 break-all font-mono text-xs text-ink">{task.payout_paypal_email}</p>
                    {task.status === 'completed' && task.tx_hash ? (
                      <p className="mt-3 text-sm text-verified-text">✓ 本单已结清 · 参考号 <span className="font-mono">{shortHash(task.tx_hash)}</span></p>
                    ) : (
                      <p className="mt-3 text-xs text-muted">付款完成后,请把 PayPal 交易号发给您的对接人。</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-mono text-xs text-ink">
                      {task.payout_token === 'ETH'
                        ? `按市价折合 ${usd(task.amount)} 的 ETH`
                        : money(task.amount, task.payout_token!)}
                      {' · '}{payoutLabel(task.payout_network!, task.payout_token!)}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-ink">{task.payout_address}</p>
                    {task.status === 'completed' && task.tx_hash ? (
                      <p className="mt-3 text-sm text-verified-text">
                        ✓ 本单已结清 · 交易{' '}
                        <a href={txUrl(task.payout_network!, task.tx_hash)} target="_blank" rel="noreferrer"
                          className="font-mono underline underline-offset-2">{shortHash(task.tx_hash)}</a>
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-muted">付款完成后,请把交易哈希(TxID)发给您的对接人。</p>
                    )}
                  </>
                )}
              </Card>
            )}

            <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              LocalTask · 只读页面
            </p>
          </>
        )}
      </main>
    </div>
  )
}
