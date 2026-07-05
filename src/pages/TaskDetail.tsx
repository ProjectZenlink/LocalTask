import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { payoutLabel, shortAddress, type Task, type WalletAddress } from '../types/database'
import { PageHeading, Card, Eyebrow, StatusBadge, Button, Alert, Label } from '../components/ui'

interface Submission { id: string; content: string | null; created_at: string; freelancer_id: string }
interface TaskContact { display_name: string | null; contact_telegram: string | null; contact_whatsapp: string | null }

const STATUS_BADGE: Record<string, { s: 'verified' | 'pending' | 'unverified'; label: string }> = {
  open: { s: 'verified', label: 'Open' },
  in_progress: { s: 'pending', label: 'In progress' },
  submitted: { s: 'pending', label: 'Submitted' },
  confirmed: { s: 'verified', label: 'Confirmed' },
  settled: { s: 'verified', label: 'Settled' },
  closed: { s: 'unverified', label: 'Closed' },
  cancelled: { s: 'unverified', label: 'Cancelled' },
  disputed: { s: 'pending', label: 'Disputed' },
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { profile } = useProfile()
  const [task, setTask] = useState<Task | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [clientName, setClientName] = useState<string>('')
  const [wallets, setWallets] = useState<WalletAddress[]>([])
  const [walletId, setWalletId] = useState<string>('')
  const [contact, setContact] = useState<TaskContact | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const { data: t } = await supabase.from('tasks').select('*').eq('id', id).single()
    const tt = (t ?? null) as Task | null
    setTask(tt)
    if (tt) {
      const { data: items } = await supabase.from('task_items').select('id').eq('task_id', tt.id).order('seq').limit(1)
      const iid = items?.[0]?.id ?? null
      setItemId(iid)
      if (iid) {
        const { data: subs } = await supabase.from('submissions').select('id, content, created_at, freelancer_id')
          .eq('task_item_id', iid).order('created_at', { ascending: false }).limit(1)
        setSubmission((subs?.[0] ?? null) as Submission | null)
      }
      const { data: cp } = await supabase.from('public_profiles').select('display_name').eq('id', tt.client_id).single()
      setClientName(cp?.display_name ?? 'Client')

      // Open task, viewed by a potential worker → load their saved payout wallets
      if (user && tt.status === 'open' && tt.client_id !== user.id) {
        const { data: ws } = await supabase.from('wallet_addresses').select('*').eq('user_id', user.id)
        const rows = (ws ?? []) as WalletAddress[]
        setWallets(rows)
        setWalletId(prev => prev || (rows[0]?.id ?? ''))
      }

      // Accepted task, viewed by either party → load the other party's contact
      if (user && tt.accepted_by && (tt.client_id === user.id || tt.accepted_by === user.id)) {
        const { data: c } = await supabase.rpc('get_task_contact', { p_task_id: tt.id })
        const row = (Array.isArray(c) ? c[0] : c) as TaskContact | undefined
        setContact(row ?? null)
      }
    }
    setLoaded(true)
  }, [id, user])

  useEffect(() => { void load() }, [load])

  async function doAccept() {
    if (!walletId) return
    setError(null); setBusy(true)
    const { error: err } = await supabase.rpc('accept_task_v2', { p_task_id: id, p_wallet_id: walletId })
    setBusy(false)
    if (err) { setError(friendly(err.message)); return }
    await load()
  }

  async function doSubmit() {
    if (!itemId || !user || !content.trim()) return
    setError(null); setBusy(true)
    const { error: err } = await supabase.from('submissions').insert({
      task_item_id: itemId, freelancer_id: user.id, content: content.trim(),
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    setContent('')
    await load()
  }

  async function doConfirm() {
    setError(null); setBusy(true)
    const { error: err } = await supabase.rpc('confirm_delivery', { p_task_id: id })
    setBusy(false)
    if (err) { setError(friendly(err.message)); return }
    await load()
  }

  function friendly(msg: string): string {
    if (msg.includes('VERIFICATION_REQUIRED')) return 'You need to complete identity verification before accepting tasks.'
    if (msg.includes('CANNOT_ACCEPT_OWN_TASK')) return 'You cannot accept your own task.'
    if (msg.includes('TASK_NOT_AVAILABLE')) return 'This task is no longer available.'
    if (msg.includes('WALLET_NOT_FOUND')) return 'Pick one of your saved payout addresses first.'
    if (msg.includes('WALLET_COMBO_NOT_SUPPORTED')) return 'That payout option is not supported. Update your addresses in Settings.'
    if (msg.includes('ACCOUNT_BANNED')) return 'This account is suspended.'
    if (msg.includes('NOT_ALLOWED_OR_WRONG_STATE')) return 'This action is not available right now.'
    return msg
  }

  if (!loaded) return <div className="text-muted">Loading…</div>
  if (!task) return <div className="text-muted">Task not found.</div>

  const isOwner = user?.id === task.client_id
  const isWorker = user?.id === task.accepted_by
  const verified = profile?.kyc_status === 'verified'
  const badge = STATUS_BADGE[task.status] ?? { s: 'unverified' as const, label: task.status }
  const payoutChosen = task.payout_network && task.payout_token

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading>{task.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="flex overflow-hidden">
        <div className="w-1 shrink-0 bg-petrol" />
        <div className="flex-1 p-5">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>Task record</Eyebrow>
            <StatusBadge status={badge.s} label={badge.label} />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-ink-soft">
            <span>#{task.id.slice(0, 8).toUpperCase()}</span>
            <span className="text-faint">|</span>
            <span>${task.bounty_total}</span>
            <span className="text-faint">·</span>
            <span>{payoutChosen ? payoutLabel(task.payout_network!, task.payout_token!) : 'USDT / USDC'}</span>
            {task.deadline && (<><span className="text-faint">|</span>
              <span>due {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>)}
          </div>
          <p className="mt-2 text-sm text-faint">Posted by {clientName}{isOwner ? ' (you)' : ''}</p>
          {task.description && (
            <p className="mt-4 whitespace-pre-wrap border-t border-hair pt-4 text-sm leading-relaxed text-ink-soft">
              {task.description}
            </p>
          )}

          {/* 收款信息（接单后双方可见）：freelancer 选定的币种/网络 + 地址快照 */}
          {payoutChosen && task.payout_address && (isOwner || isWorker) && (
            <div className="mt-4 rounded-lg border border-hair bg-paper p-4">
              <Eyebrow>Payout</Eyebrow>
              <p className="font-mono text-sm text-ink-soft">{payoutLabel(task.payout_network!, task.payout_token!)}</p>
              <p className="mt-1 break-all font-mono text-xs text-ink-soft">{task.payout_address}</p>
              {isOwner && (
                <p className="mt-2 text-xs text-faint">
                  Send on this exact network — transfers sent on the wrong network can be lost.
                </p>
              )}
            </div>
          )}

          {/* 联系方式（接单后经 RPC 互见，永不公开） */}
          {task.accepted_by && (isOwner || isWorker) && (
            <div className="mt-4 rounded-lg border border-hair bg-paper p-4">
              <Eyebrow>Contact</Eyebrow>
              {contact && (contact.contact_telegram || contact.contact_whatsapp) ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm">
                  {contact.contact_telegram && (
                    <a href={`https://t.me/${contact.contact_telegram}`} target="_blank" rel="noreferrer"
                       className="text-petrol underline underline-offset-2 hover:text-petrol-hover">
                      Telegram · @{contact.contact_telegram}
                    </a>
                  )}
                  {contact.contact_whatsapp && (
                    <a href={`https://wa.me/${contact.contact_whatsapp}`} target="_blank" rel="noreferrer"
                       className="text-petrol underline underline-offset-2 hover:text-petrol-hover">
                      WhatsApp · +{contact.contact_whatsapp}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-faint">
                  {isWorker ? clientName : 'The freelancer'} hasn't shared contact info.
                </p>
              )}
              <p className="mt-2 text-xs text-faint">
                Off-platform chats can't be used as dispute evidence — keep key agreements and deliveries on this page.
              </p>
            </div>
          )}

          {/* 交付内容(交付后双方可见) */}
          {submission && (
            <div className="mt-4 rounded-lg border border-hair bg-paper p-4">
              <Eyebrow>Delivery</Eyebrow>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{submission.content}</p>
              <p className="mt-2 font-mono text-xs text-faint">
                submitted {new Date(submission.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          )}

          {/* 动作区:按角色 × 状态 */}
          <div className="mt-5 border-t border-hair pt-4">
            {task.status === 'open' && !isOwner && (
              verified ? (
                <div>
                  <Label>Get paid to</Label>
                  {wallets.length === 0 ? (
                    <p className="text-sm text-muted">
                      Add a payout address in <Link to="/settings" className="text-petrol underline underline-offset-2">Settings</Link> before accepting this task.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <select
                        value={walletId}
                        onChange={e => setWalletId(e.target.value)}
                        className="flex-1 rounded-lg border border-hair bg-white px-3 py-2.5 font-mono text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
                      >
                        {wallets.map(w => (
                          <option key={w.id} value={w.id}>
                            {payoutLabel(w.network, w.token)} · {shortAddress(w.address)}
                          </option>
                        ))}
                      </select>
                      <Button onClick={doAccept} disabled={busy || !walletId} className="shrink-0">
                        {busy ? 'Accepting…' : 'Accept task'}
                      </Button>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-faint">The client pays this address directly when the work is confirmed.</p>
                </div>
              ) : (
                <p className="text-right text-sm text-faint">Complete identity verification to accept tasks.</p>
              )
            )}
            {task.status === 'open' && isOwner && (
              <p className="text-right font-mono text-xs uppercase tracking-wider text-faint">Waiting for a freelancer</p>
            )}

            {task.status === 'in_progress' && isWorker && (
              <div>
                <Eyebrow>Submit your delivery</Eyebrow>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={4}
                  placeholder="Describe what you delivered — links, notes, anything the client needs to review."
                  className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
                />
                <div className="mt-3 flex justify-end">
                  <Button onClick={doSubmit} disabled={busy || !content.trim()}>{busy ? 'Submitting…' : 'Submit delivery'}</Button>
                </div>
              </div>
            )}
            {task.status === 'in_progress' && isOwner && (
              <p className="text-right font-mono text-xs uppercase tracking-wider text-pending-text">Work in progress</p>
            )}

            {task.status === 'submitted' && isOwner && (
              <div className="flex items-center justify-end gap-3">
                <span className="text-sm text-muted">Review the delivery above.</span>
                <Button onClick={doConfirm} disabled={busy}>{busy ? 'Confirming…' : 'Confirm delivery'}</Button>
              </div>
            )}
            {task.status === 'submitted' && isWorker && (
              <p className="text-right font-mono text-xs uppercase tracking-wider text-pending-text">Waiting for client review</p>
            )}

            {task.status === 'confirmed' && (isOwner || isWorker) && (
              <p className="text-right text-sm text-verified-text">
                Delivery confirmed. Payment & mutual ratings arrive in the next module.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
