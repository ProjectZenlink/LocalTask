import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task, TaskOffer, TaskSubmission } from '../types/database'
import { payoutLabel } from '../types/database'
import {
  money, usd, lt, taskMoney, dateShort, dateTimeShort, timeLeft, txUrl, shortHash,
  safeFileName, fileNameFromPath, isImagePath, signTaskFiles,
} from '../lib/format'
import { PageHeading, Card, Button, Alert, SectionTitle, TaskBadge, Textarea, Label, Linkified } from '../components/ui'

type Signed = { path: string; url: string }

function FileLinks({ files }: { files: Signed[] }) {
  if (files.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {files.map(f => (
        <a key={f.path} href={f.url} target="_blank" rel="noreferrer" className="block">
          {isImagePath(f.path) ? (
            <img src={f.url} alt={fileNameFromPath(f.path)} className="h-24 w-24 rounded-lg border border-hair object-cover" />
          ) : (
            <span className="inline-block rounded-lg border border-hair bg-white px-3 py-2 font-mono text-xs text-petrol underline underline-offset-2">
              {fileNameFromPath(f.path)}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [task, setTask] = useState<Task | null>(null)
  const [offer, setOffer] = useState<TaskOffer | null>(null)
  const [subs, setSubs] = useState<TaskSubmission[]>([])
  const [briefFiles, setBriefFiles] = useState<Signed[]>([])
  const [subFiles, setSubFiles] = useState<Record<string, Signed[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const load = useCallback(async () => {
    if (!id || !user) return
    setError(null)
    const [tRes, oRes, sRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', id).maybeSingle(),
      supabase.from('task_offers').select('*').eq('task_id', id).eq('freelancer_id', user.id)
        .eq('status', 'pending').maybeSingle(),
      supabase.from('task_submissions').select('*').eq('task_id', id)
        .order('version', { ascending: false }),
    ])
    if (tRes.error) { setError(tRes.error.message); setLoaded(true); return }
    const t = (tRes.data ?? null) as Task | null
    setTask(t)
    setOffer((oRes.data ?? null) as TaskOffer | null)
    const list = (sRes.data ?? []) as TaskSubmission[]
    setSubs(list)
    setLoaded(true)

    if (t && t.attachment_paths.length > 0) setBriefFiles(await signTaskFiles(t.attachment_paths))
    const map: Record<string, Signed[]> = {}
    for (const s of list) {
      if (s.attachment_paths.length > 0) map[s.id] = await signTaskFiles(s.attachment_paths)
    }
    setSubFiles(map)
  }, [id, user])

  useEffect(() => { void load() }, [load])

  async function respond(accept: boolean) {
    if (!offer) return
    setError(null); setBusy(true)
    const { error: e } = await supabase.rpc('respond_to_offer', { p_offer_id: offer.id, p_accept: accept })
    setBusy(false)
    if (e) { setError(e.message); await load(); return }
    if (!accept) { navigate('/offers'); return }
    await load()
  }

  async function submitWork() {
    if (!id || !user || !task) return
    if (!content.trim() && files.length === 0) { setError('Add a note or attach at least one file.'); return }
    setError(null); setBusy(true)
    try {
      const paths: string[] = []
      for (const f of files) {
        const path = `submissions/${id}/${user.id}/${Date.now()}-${safeFileName(f.name)}`
        const { error: upErr } = await supabase.storage.from('task-attachments').upload(path, f)
        if (upErr) throw new Error(`[upload ${f.name}] ${upErr.message}`)
        paths.push(path)
      }
      const { error: insErr } = await supabase.from('task_submissions').insert({
        task_id: id,
        freelancer_id: user.id,
        content: content.trim() || null,
        attachment_paths: paths,
      })
      if (insErr) throw new Error(`[submission] ${insErr.message}`)
      setContent(''); setFiles([])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmReceipt() {
    if (!id) return
    setError(null); setBusy(true)
    const { error: e } = await supabase.rpc('confirm_receipt', { p_task_id: id })
    setBusy(false)
    if (e) { setError(e.message); return }
    await load()
  }

  if (!loaded) return <div className="text-muted">Loading…</div>
  if (!task) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeading>Task not found</PageHeading>
        <p className="text-sm text-muted">This task doesn't exist or isn't shared with you.</p>
      </div>
    )
  }

  const mine = task.assigned_freelancer === user?.id
  const latest = subs[0] ?? null
  const needsRevision = task.status === 'in_progress' && latest?.status === 'returned'
  const offerLeft = offer ? timeLeft(offer.expires_at) : null

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{task.title}</h1>
          <p className="mt-2 font-mono text-xs text-faint">
            {taskMoney(task.amount, task.payout_token)}
            {task.payout_network && task.payout_token && <> · {payoutLabel(task.payout_network, task.payout_token)}</>}
            {task.deadline && <> · due {dateShort(task.deadline)}</>}
          </p>
        </div>
        <TaskBadge status={task.status} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* ── Offer response bar ── */}
      {task.status === 'offered' && offer && (
        <Card className="mb-5 border-petrol/25 bg-petrol/5 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink">This task is offered to you.</p>
            <span className={`font-mono text-[11px] uppercase tracking-wider ${offerLeft ? 'text-pending-text' : 'text-danger-text'}`}>
              {offerLeft ?? 'Expired'}
            </span>
          </div>
          {offer.note && <p className="mt-2 text-sm text-muted">{offer.note}</p>}
          <p className="mt-2 font-mono text-xs text-verified-text">Accepting locks +{lt(task.amount)} into your Coins.</p>
          {offerLeft && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" disabled={busy} onClick={() => respond(false)} className="w-full sm:w-auto">Decline</Button>
              <Button disabled={busy} onClick={() => respond(true)} className="w-full sm:w-auto">
                {busy ? 'Working…' : 'Accept task'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Brief ── */}
      <Card className="mb-5 p-5">
        <SectionTitle>Brief</SectionTitle>
        {task.description
          ? <p className="text-sm leading-relaxed text-ink"><Linkified text={task.description} /></p>
          : <p className="text-sm text-faint">No description provided.</p>}
        <FileLinks files={briefFiles} />
      </Card>

      {/* ── Acceptance criteria ── */}
      <Card className="mb-5 p-5">
        <SectionTitle>Acceptance criteria</SectionTitle>
        <p className="text-sm leading-relaxed text-ink"><Linkified text={task.acceptance_criteria} /></p>
        <p className="mt-3 text-xs text-faint">Your submission is reviewed against these points — nothing else.</p>
      </Card>

      {/* ── Revision requested ── */}
      {mine && needsRevision && (
        <Alert tone="warning">
          <span className="font-medium">Revision requested.</span>{' '}
          {latest?.review_note ?? 'See your account manager for details.'}
        </Alert>
      )}

      {/* ── Submit work ── */}
      {mine && task.status === 'in_progress' && (
        <Card className="mb-5 p-5">
          <SectionTitle>{needsRevision ? `Submit revision (v${(latest?.version ?? 0) + 1})` : 'Submit your work'}</SectionTitle>
          <div className="mb-4">
            <Label>Notes, links, completion codes</Label>
            <Textarea rows={4} value={content} onChange={e => setContent(e.target.value)}
              placeholder="Describe what you did, paste links or codes the reviewer needs…" />
          </div>
          <div className="mb-4">
            <Label>Attachments (screenshots, files)</Label>
            <input
              type="file" multiple
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-surface file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper"
            />
            {files.length > 0 && (
              <p className="mt-1.5 font-mono text-xs text-verified-text">{files.map(f => f.name).join(' · ')}</p>
            )}
          </div>
          <Button onClick={submitWork} disabled={busy} className="w-full">
            {busy ? 'Submitting…' : 'Submit for review'}
          </Button>
        </Card>
      )}

      {/* ── Under review ── */}
      {mine && task.status === 'under_review' && (
        <Alert tone="info">Submitted{latest ? ` (v${latest.version})` : ''} — your work is being reviewed against the acceptance criteria.</Alert>
      )}

      {/* ── Awaiting payment / paid ── */}
      {mine && task.status === 'pending_payment' && (
        <Card className="mb-5 border-verified-border bg-verified-bg p-5">
          <SectionTitle>Approved</SectionTitle>
          {!task.paid_at ? (
            <>
              <p className="text-sm leading-relaxed text-ink">
                Your work passed review — your {lt(task.amount)} are unlocked. The client has been asked to send{' '}
                <span className="font-mono">
                  {task.payout_token === 'ETH' ? `the equivalent of ${usd(task.amount)} in ETH` : money(task.amount, task.payout_token ?? 'USDT')}
                </span>{' '}
                directly to your wallet:
              </p>
              <p className="mt-2 break-all font-mono text-xs text-ink">{task.payout_address}</p>
              <p className="mt-3 text-xs text-muted">You'll confirm here once the payment lands.</p>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink">
                The client reports payment sent
                {task.tx_hash && task.payout_network && (
                  <> — transaction{' '}
                    <a href={txUrl(task.payout_network, task.tx_hash)} target="_blank" rel="noreferrer"
                      className="font-mono text-petrol underline underline-offset-2">{shortHash(task.tx_hash)}</a>
                  </>
                )}.
              </p>
              {task.payment_note && <p className="mt-2 text-sm text-muted">{task.payment_note}</p>}
              <p className="mt-3 text-xs text-muted">
                Check your wallet. If the funds arrived, confirm below to close the task.
                If not, don't confirm — message your account manager instead.
              </p>
              <Button onClick={confirmReceipt} disabled={busy} className="mt-4 w-full">
                {busy ? 'Working…' : 'I received the payment'}
              </Button>
            </>
          )}
        </Card>
      )}

      {/* ── Completed ── */}
      {task.status === 'completed' && (
        <Card className="mb-5 border-verified-border bg-verified-bg p-5">
          <SectionTitle>Completed</SectionTitle>
          <p className="text-sm leading-relaxed text-ink">
            Paid {taskMoney(task.amount, task.payout_token)} · {lt(task.amount)} settled
            {task.tx_hash && task.payout_network && (
              <> · <a href={txUrl(task.payout_network, task.tx_hash)} target="_blank" rel="noreferrer"
                className="font-mono text-petrol underline underline-offset-2">{shortHash(task.tx_hash)}</a></>
            )}
            {task.freelancer_confirmed_at && <> · confirmed {dateShort(task.freelancer_confirmed_at)}</>}
          </p>
        </Card>
      )}

      {/* ── Cancelled ── */}
      {task.status === 'cancelled' && (
        <Alert tone="warning">
          This task was cancelled{task.cancelled_reason ? ` — ${task.cancelled_reason}` : ''}. Your account manager will follow up about any work already done.
        </Alert>
      )}

      {/* ── Submission history ── */}
      {mine && subs.length > 0 && (
        <Card className="p-5">
          <SectionTitle>Submission history</SectionTitle>
          {subs.map(s => (
            <div key={s.id} className="border-b border-hair py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-ink">v{s.version} · {dateTimeShort(s.created_at)}</p>
                <span className={`font-mono text-[11px] uppercase tracking-wider ${
                  s.status === 'approved' ? 'text-verified-text' : s.status === 'returned' ? 'text-danger-text' : 'text-pending-text'
                }`}>{s.status}</span>
              </div>
              {s.content && <p className="mt-2 text-sm leading-relaxed text-muted"><Linkified text={s.content} /></p>}
              {s.status === 'returned' && s.review_note && (
                <p className="mt-2 text-sm text-danger-text">Reviewer: {s.review_note}</p>
              )}
              <FileLinks files={subFiles[s.id] ?? []} />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
