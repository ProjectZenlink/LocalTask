import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { payoutLabel, type Task } from '../types/database'
import { PageHeading, Card, Eyebrow, StatusBadge, Button, Alert } from '../components/ui'

interface Submission { id: string; content: string | null; created_at: string; freelancer_id: string }

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
    }
    setLoaded(true)
  }, [id])

  useEffect(() => { void load() }, [load])

  async function doAccept() {
    setError(null); setBusy(true)
    const { error: err } = await supabase.rpc('accept_task', { p_task_id: id })
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
    if (msg.includes('NOT_ALLOWED_OR_WRONG_STATE')) return 'This action is not available right now.'
    return msg
  }

  if (!loaded) return <div className="text-muted">Loading…</div>
  if (!task) return <div className="text-muted">Task not found.</div>

  const isOwner = user?.id === task.client_id
  const isWorker = user?.id === task.accepted_by
  const verified = profile?.kyc_status === 'verified'
  const badge = STATUS_BADGE[task.status] ?? { s: 'unverified' as const, label: task.status }

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
            <span>{task.bounty_total} {task.payout_token}</span>
            <span className="text-faint">·</span>
            <span>{payoutLabel(task.payout_network, task.payout_token)}</span>
            {task.deadline && (<><span className="text-faint">|</span>
              <span>due {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>)}
          </div>
          <p className="mt-2 text-sm text-faint">Posted by {clientName}{isOwner ? ' (you)' : ''}</p>
          {task.description && (
            <p className="mt-4 whitespace-pre-wrap border-t border-hair pt-4 text-sm leading-relaxed text-ink-soft">
              {task.description}
            </p>
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
              verified
                ? <div className="flex justify-end"><Button onClick={doAccept} disabled={busy}>{busy ? 'Accepting…' : 'Accept task'}</Button></div>
                : <p className="text-right text-sm text-faint">Complete identity verification to accept tasks.</p>
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
