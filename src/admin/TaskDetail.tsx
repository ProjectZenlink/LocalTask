import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task, TaskOffer, TaskSubmission, Rating, PoolRow } from '../types/database'
import { payoutLabel } from '../types/database'
import { money, usd, lt, taskMoney, dateShort, dateTimeShort, timeLeft, txUrl, shortHash, signTaskFiles, fileNameFromPath, isImagePath } from '../lib/format'
import { Card, Button, Alert, Label, Input, Textarea, Linkified, SectionTitle } from '../components/ui'
import { TaskStatusBadge, Th, Td, Stars, KV, waLink, tgLink } from './bits'
import { useLang } from './i18n'

type Signed = { path: string; url: string }
type OfferRow = TaskOffer & { freelancer: { display_name: string | null } | null }
type TaskRow = Task & { am: { name: string; whatsapp: string | null; telegram: string | null } | null }

const COPY = {
  zh: {
    notFound: '任务不存在', client: '账户经理', amount: '金额', payMethod: '收款方式', deadline: '截止', created: '创建',
    assignee: '接单人', payout: '收款地址(快照)', none: '—',
    brief: '任务说明', files: '附件', criteria: '验收标准',
    match: '可派的 Freelancer(已认证 · 开着接单)',
    matchEmpty: '暂无可派的人——现在没有人处于「开着接单」状态。',
    offerNote: 'Offer 备注(可选,freelancer 可见)', expiry: '过期时长(小时)', send: '发 Offer', sending: '发送中…',
    active: '活跃', done: '完成', strikes: 'Strikes', combo: '收款方式',
    pendingOffer: '待响应 Offer', to: '发给', withdraw: '撤回 Offer',
    inProgress: '任务进行中,等 freelancer 提交交付物。', returnedNote: '上一版已退回:',
    review: '审核交付', reviewNote: '审核意见(退回时必填,freelancer 可见)', approve: '通过', reject: '退回修改',
    vNote: '退回必须填写审核意见。',
    payTitle: '放款', payHint1: '把下面的地址和金额发给客户打款:', payHint2: '客户打款后把交易 hash 填在这里:',
    hash: '交易 Hash', payNote: '付款备注(可选)', markPaid: '标记已付款', paid: '已标记付款,等 freelancer 确认到账关单。',
    tx: '交易',
    rate: '三维评分(freelancer 不可见)', quality: '质量', speed: '速度', attitude: '态度',
    rateNote: '内部备注(可选)', saveRating: '保存评分', rated: '已评分',
    strike: '记 Strike', strikeQ: 'Strike 原因(内部记录):', cancel: '取消任务', cancelQ: '取消原因:',
    cancelled: '任务已取消', offerHistory: 'Offer 历史', subHistory: '交付历史', version: '版本',
    confirmed: 'freelancer 已确认到账', reviewer: '审核意见:',
  },
  en: {
    notFound: 'Task not found', client: 'AM', amount: 'Amount', payMethod: 'Payout method', deadline: 'Due', created: 'Created',
    assignee: 'Assignee', payout: 'Payout address (snapshot)', none: '—',
    brief: 'Brief', files: 'Attachments', criteria: 'Acceptance criteria',
    match: 'Available freelancers (verified · open to work)',
    matchEmpty: 'Nobody available — no one is open to work right now.',
    offerNote: 'Offer note (optional, visible to freelancer)', expiry: 'Expires in (hours)', send: 'Send offer', sending: 'Sending…',
    active: 'Active', done: 'Done', strikes: 'Strikes', combo: 'Wallet',
    pendingOffer: 'Pending offer', to: 'To', withdraw: 'Withdraw offer',
    inProgress: 'In progress — waiting for the freelancer to submit.', returnedNote: 'Last version was returned:',
    review: 'Review submission', reviewNote: 'Review note (required when returning, visible to freelancer)', approve: 'Approve', reject: 'Return for revision',
    vNote: 'A review note is required when returning.',
    payTitle: 'Payment', payHint1: 'Send this address and amount to the client:', payHint2: 'Once the client pays, paste the transaction hash:',
    hash: 'Transaction hash', payNote: 'Payment note (optional)', markPaid: 'Mark as paid', paid: 'Marked paid — waiting for the freelancer to confirm receipt.',
    tx: 'Transaction',
    rate: 'Rating (never visible to the freelancer)', quality: 'Quality', speed: 'Speed', attitude: 'Attitude',
    rateNote: 'Internal note (optional)', saveRating: 'Save rating', rated: 'Rated',
    strike: 'Record strike', strikeQ: 'Strike reason (internal):', cancel: 'Cancel task', cancelQ: 'Cancellation reason:',
    cancelled: 'Task cancelled', offerHistory: 'Offer history', subHistory: 'Submission history', version: 'Version',
    confirmed: 'Freelancer confirmed receipt', reviewer: 'Review note:',
  },
}

export default function AdminTaskDetail() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [task, setTask] = useState<TaskRow | null>(null)
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [subs, setSubs] = useState<TaskSubmission[]>([])
  const [rating, setRating] = useState<Rating | null>(null)
  const [pool, setPool] = useState<PoolRow[]>([])
  const [briefFiles, setBriefFiles] = useState<Signed[]>([])
  const [subFiles, setSubFiles] = useState<Record<string, Signed[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [offerNote, setOfferNote] = useState('')
  const [expiryH, setExpiryH] = useState('48')
  const [reviewNote, setReviewNote] = useState('')
  const [hash, setHash] = useState('')
  const [payNote, setPayNote] = useState('')
  const [rQ, setRQ] = useState(0)
  const [rS, setRS] = useState(0)
  const [rA, setRA] = useState(0)
  const [rNote, setRNote] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    const [tRes, oRes, sRes, rRes] = await Promise.all([
      supabase.from('tasks').select('*, am:account_managers(name, whatsapp, telegram)').eq('id', id).maybeSingle(),
      supabase.from('task_offers')
        .select('*, freelancer:profiles!task_offers_freelancer_id_fkey(display_name)')
        .eq('task_id', id).order('created_at', { ascending: false }),
      supabase.from('task_submissions').select('*').eq('task_id', id).order('version', { ascending: false }),
      supabase.from('ratings').select('*').eq('task_id', id).maybeSingle(),
    ])
    if (tRes.error) { setError(tRes.error.message); setLoaded(true); return }
    const tk = (tRes.data ?? null) as TaskRow | null
    setTask(tk)
    setOffers((oRes.data ?? []) as OfferRow[])
    const list = (sRes.data ?? []) as TaskSubmission[]
    setSubs(list)
    setRating((rRes.data ?? null) as Rating | null)
    setLoaded(true)

    if (tk) {
      if (tk.status === 'unassigned') {
        const { data: p } = await supabase.from('freelancer_pool').select('*')
          .eq('open_to_work', true).eq('is_suspended', false).eq('is_banned', false)
          .eq('kyc_status', 'verified')
          .order('active_tasks', { ascending: true })
        setPool((p ?? []) as PoolRow[])
      }
      if (tk.attachment_paths.length > 0) setBriefFiles(await signTaskFiles(tk.attachment_paths))
      const map: Record<string, Signed[]> = {}
      for (const s of list) if (s.attachment_paths.length > 0) map[s.id] = await signTaskFiles(s.attachment_paths)
      setSubFiles(map)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function run(fn: () => Promise<{ error: { message: string } | null } | void>) {
    setError(null); setBusy(true)
    try {
      const res = await fn()
      if (res && res.error) setError(res.error.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
      await load()
    }
  }

  if (!loaded) return <p className="text-muted">…</p>
  if (!task) return <PageNotFound label={t.notFound} />

  const pendingOffer = offers.find(o => o.status === 'pending') ?? null
  const latest = subs[0] ?? null

  const sendOffer = (flId: string) => run(async () => {
    const h = Math.max(1, Number(expiryH) || 48)
    return supabase.from('task_offers').insert({
      task_id: task.id, freelancer_id: flId, created_by: user?.id ?? null,
      note: offerNote.trim() || null,
      expires_at: new Date(Date.now() + h * 3600_000).toISOString(),
    })
  })

  const withdraw = () => run(async () =>
    pendingOffer ? supabase.from('task_offers').update({ status: 'withdrawn' }).eq('id', pendingOffer.id) : undefined)

  const review = (approve: boolean) => {
    if (!approve && !reviewNote.trim()) { setError(t.vNote); return }
    if (!latest || latest.status !== 'submitted') return
    void run(async () => supabase.from('task_submissions')
      .update({ status: approve ? 'approved' : 'returned', review_note: reviewNote.trim() || null })
      .eq('id', latest.id))
  }

  const markPaid = () => {
    if (!hash.trim()) { setError(t.hash); return }
    void run(async () => supabase.from('tasks').update({
      tx_hash: hash.trim(), payment_note: payNote.trim() || null,
      paid_at: new Date().toISOString(), paid_marked_by: user?.id ?? null,
    }).eq('id', task.id))
  }

  const saveRating = () => {
    if (!(rQ && rS && rA) || !task.assigned_freelancer) return
    void run(async () => supabase.from('ratings').insert({
      task_id: task.id, freelancer_id: task.assigned_freelancer,
      quality: rQ, speed: rS, attitude: rA, note: rNote.trim() || null, rated_by: user?.id ?? null,
    }))
  }

  const strike = () => {
    if (!task.assigned_freelancer) return
    const reason = window.prompt(t.strikeQ)
    if (!reason?.trim()) return
    void run(async () => supabase.from('strikes').insert({
      freelancer_id: task.assigned_freelancer, task_id: task.id, reason: reason.trim(), created_by: user?.id ?? null,
    }))
  }

  const cancel = () => {
    const reason = window.prompt(t.cancelQ)
    if (!reason?.trim()) return
    void run(async () => {
      if (pendingOffer) {
        const { error: e } = await supabase.from('task_offers').update({ status: 'withdrawn' }).eq('id', pendingOffer.id)
        if (e) return { error: e }
      }
      return supabase.from('tasks').update({ status: 'cancelled', cancelled_reason: reason.trim() }).eq('id', task.id)
    })
  }

  const canCancel = !['completed', 'cancelled'].includes(task.status)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h1 className="min-w-0 font-display text-2xl font-medium tracking-tight text-ink">{task.title}</h1>
        <TaskStatusBadge status={task.status} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="mb-5 p-5">
        <KV k={t.client}>
          {task.am ? (
            <>
              {task.am.name}
              {task.am.whatsapp && <> · <a className="font-mono text-xs text-petrol underline underline-offset-2" href={waLink(task.am.whatsapp)} target="_blank" rel="noreferrer">WA</a></>}
              {task.am.telegram && <> · <a className="font-mono text-xs text-petrol underline underline-offset-2" href={tgLink(task.am.telegram)} target="_blank" rel="noreferrer">TG</a></>}
            </>
          ) : t.none}
        </KV>
        <KV k={t.amount}><span className="font-mono">{taskMoney(task.amount, task.payout_token)} · {lt(task.amount)}</span></KV>
        {task.payout_network && task.payout_token && (
          <KV k={t.payMethod}><span className="font-mono">{payoutLabel(task.payout_network, task.payout_token)}</span></KV>
        )}
        <KV k={t.deadline}>{task.deadline ? dateTimeShort(task.deadline) : t.none}</KV>
        <KV k={t.created}>{dateShort(task.created_at)}</KV>
        <KV k={t.assignee}>{offers.find(o => o.status === 'accepted')?.freelancer?.display_name ?? (task.assigned_freelancer ? task.assigned_freelancer.slice(0, 8) : t.none)}</KV>
        {task.payout_address && <KV k={t.payout}><span className="break-all font-mono text-xs">{task.payout_address}</span></KV>}
      </Card>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.brief}</SectionTitle>
        {task.description ? <p className="text-sm leading-relaxed text-ink"><Linkified text={task.description} /></p> : <p className="text-sm text-faint">{t.none}</p>}
        {briefFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {briefFiles.map(f => (
              <a key={f.path} href={f.url} target="_blank" rel="noreferrer">
                {isImagePath(f.path)
                  ? <img src={f.url} alt="" className="h-24 w-24 rounded-lg border border-hair object-cover" />
                  : <span className="inline-block rounded-lg border border-hair bg-white px-3 py-2 font-mono text-xs text-petrol underline underline-offset-2">{fileNameFromPath(f.path)}</span>}
              </a>
            ))}
          </div>
        )}
        <div className="mt-4 border-t border-hair pt-4">
          <SectionTitle>{t.criteria}</SectionTitle>
          <p className="text-sm leading-relaxed text-ink"><Linkified text={task.acceptance_criteria} /></p>
        </div>
      </Card>

      {/* ── 未指派:匹配池 ── */}
      {task.status === 'unassigned' && (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.match}</SectionTitle>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem]">
            <div><Label>{t.offerNote}</Label><Input value={offerNote} onChange={e => setOfferNote(e.target.value)} /></div>
            <div><Label>{t.expiry}</Label><Input type="number" min="1" value={expiryH} onChange={e => setExpiryH(e.target.value)} className="font-mono" /></div>
          </div>
          {pool.length === 0 ? (
            <p className="py-2 text-sm text-faint">{t.matchEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="border-b border-hair">
                  <tr><Th>Freelancer</Th><Th>{t.combo}</Th><Th>{t.active}</Th><Th>{t.done}</Th><Th>Q / S / A</Th><Th>{t.strikes}</Th><Th>WhatsApp / TG</Th><Th></Th></tr>
                </thead>
                <tbody>
                  {pool.map(p => (
                    <tr key={p.id} className="border-b border-hair last:border-b-0">
                      <Td>{p.display_name ?? p.id.slice(0, 8)}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{p.payout_network && p.payout_token ? payoutLabel(p.payout_network, p.payout_token) : '—'}</Td>
                      <Td className="font-mono text-xs">{p.active_tasks}</Td>
                      <Td className="font-mono text-xs">{p.completed_tasks}</Td>
                      <Td className="font-mono text-xs">{p.avg_quality ?? '–'} / {p.avg_speed ?? '–'} / {p.avg_attitude ?? '–'}</Td>
                      <Td className="font-mono text-xs">{p.strikes_count}</Td>
                      <Td className="font-mono text-xs">
                        {p.contact_whatsapp && <a className="text-petrol underline underline-offset-2" href={waLink(p.contact_whatsapp)} target="_blank" rel="noreferrer">WA</a>}
                        {p.contact_whatsapp && p.contact_telegram && ' · '}
                        {p.contact_telegram && <a className="text-petrol underline underline-offset-2" href={tgLink(p.contact_telegram)} target="_blank" rel="noreferrer">TG</a>}
                      </Td>
                      <Td><Button className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => sendOffer(p.id)}>{busy ? t.sending : t.send}</Button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── 已发 offer ── */}
      {task.status === 'offered' && pendingOffer && (
        <Card className="mb-5 border-pending-border bg-pending-bg p-5">
          <SectionTitle>{t.pendingOffer}</SectionTitle>
          <p className="text-sm text-ink">
            {t.to} <span className="font-medium">{pendingOffer.freelancer?.display_name ?? pendingOffer.freelancer_id.slice(0, 8)}</span>
            {' · '}
            <span className="font-mono text-xs">{timeLeft(pendingOffer.expires_at) ?? 'expired'}</span>
          </p>
          {pendingOffer.note && <p className="mt-2 text-sm text-muted">{pendingOffer.note}</p>}
          <Button variant="ghost" className="mt-4" disabled={busy} onClick={withdraw}>{t.withdraw}</Button>
        </Card>
      )}

      {/* ── 进行中 ── */}
      {task.status === 'in_progress' && (
        <Alert tone="info">
          {t.inProgress}
          {latest?.status === 'returned' && <> {t.returnedNote} {latest.review_note}</>}
        </Alert>
      )}

      {/* ── 待审核 ── */}
      {task.status === 'under_review' && latest && (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.review} · v{latest.version}</SectionTitle>
          {latest.content && <p className="mb-3 text-sm leading-relaxed text-ink"><Linkified text={latest.content} /></p>}
          {(subFiles[latest.id] ?? []).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-3">
              {(subFiles[latest.id] ?? []).map(f => (
                <a key={f.path} href={f.url} target="_blank" rel="noreferrer">
                  {isImagePath(f.path)
                    ? <img src={f.url} alt="" className="h-24 w-24 rounded-lg border border-hair object-cover" />
                    : <span className="inline-block rounded-lg border border-hair bg-white px-3 py-2 font-mono text-xs text-petrol underline underline-offset-2">{fileNameFromPath(f.path)}</span>}
                </a>
              ))}
            </div>
          )}
          <div className="mb-4"><Label>{t.reviewNote}</Label><Textarea rows={3} value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={busy} onClick={() => review(false)}>{t.reject}</Button>
            <Button disabled={busy} onClick={() => review(true)}>{t.approve}</Button>
          </div>
        </Card>
      )}

      {/* ── 待放款 ── */}
      {task.status === 'pending_payment' && (
        <Card className="mb-5 border-verified-border bg-verified-bg p-5">
          <SectionTitle>{t.payTitle}</SectionTitle>
          {!task.paid_at ? (
            <>
              <p className="text-sm text-ink">{t.payHint1}</p>
              <p className="mt-1 break-all font-mono text-xs text-ink">{task.payout_address}</p>
              <p className="mt-1 font-mono text-xs text-ink">
                {task.payout_token === 'ETH'
                  ? (lang === 'zh' ? `按市价折合 ${usd(task.amount)} 的 ETH` : `the USD equivalent of ${usd(task.amount)} in ETH`)
                  : money(task.amount, task.payout_token ?? '')}
                {task.payout_network && task.payout_token && <> · {payoutLabel(task.payout_network, task.payout_token)}</>}
              </p>
              <p className="mt-4 text-sm text-ink">{t.payHint2}</p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><Label>{t.hash}</Label><Input value={hash} onChange={e => setHash(e.target.value)} className="font-mono text-xs" /></div>
                <div><Label>{t.payNote}</Label><Input value={payNote} onChange={e => setPayNote(e.target.value)} /></div>
              </div>
              <Button className="mt-4" disabled={busy} onClick={markPaid}>{t.markPaid}</Button>
            </>
          ) : (
            <p className="text-sm text-ink">
              {t.paid}
              {task.tx_hash && task.payout_network && (
                <> {t.tx}: <a className="font-mono text-petrol underline underline-offset-2" href={txUrl(task.payout_network, task.tx_hash)} target="_blank" rel="noreferrer">{shortHash(task.tx_hash)}</a></>
              )}
            </p>
          )}
        </Card>
      )}

      {/* ── 已完成:评分 ── */}
      {task.status === 'completed' && (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.rate}</SectionTitle>
          {task.tx_hash && task.payout_network && (
            <p className="mb-3 font-mono text-xs text-muted">
              {t.tx}: <a className="text-petrol underline underline-offset-2" href={txUrl(task.payout_network, task.tx_hash)} target="_blank" rel="noreferrer">{shortHash(task.tx_hash)}</a>
              {task.freelancer_confirmed_at && <> · {t.confirmed} {dateShort(task.freelancer_confirmed_at)}</>}
              {' · '}{lt(task.amount)} {lang === 'zh' ? '已结清' : 'settled'}
            </p>
          )}
          {rating ? (
            <p className="font-mono text-sm text-ink">
              {t.rated}: {t.quality} {rating.quality} · {t.speed} {rating.speed} · {t.attitude} {rating.attitude}
              {rating.note && <span className="text-muted"> — {rating.note}</span>}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div><Label>{t.quality}</Label><Stars value={rQ} onChange={setRQ} /></div>
                <div><Label>{t.speed}</Label><Stars value={rS} onChange={setRS} /></div>
                <div><Label>{t.attitude}</Label><Stars value={rA} onChange={setRA} /></div>
              </div>
              <div><Label>{t.rateNote}</Label><Input value={rNote} onChange={e => setRNote(e.target.value)} /></div>
              <Button disabled={busy || !(rQ && rS && rA)} onClick={saveRating} className="self-start">{t.saveRating}</Button>
            </div>
          )}
        </Card>
      )}

      {task.status === 'cancelled' && (
        <Alert tone="warning">{t.cancelled}{task.cancelled_reason ? ` — ${task.cancelled_reason}` : ''}</Alert>
      )}

      {/* ── 操作条 ── */}
      {(canCancel || task.assigned_freelancer) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {task.assigned_freelancer && <Button variant="ghost" disabled={busy} onClick={strike}>{t.strike}</Button>}
          {canCancel && <Button variant="danger" disabled={busy} onClick={cancel}>{t.cancel}</Button>}
        </div>
      )}

      {/* ── 历史 ── */}
      {offers.length > 0 && (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.offerHistory}</SectionTitle>
          {offers.map(o => (
            <p key={o.id} className="border-b border-hair py-2 font-mono text-xs text-muted last:border-b-0">
              {dateTimeShort(o.created_at)} · {o.freelancer?.display_name ?? o.freelancer_id.slice(0, 8)} · {o.status}
            </p>
          ))}
        </Card>
      )}
      {subs.length > 0 && (
        <Card className="p-5">
          <SectionTitle>{t.subHistory}</SectionTitle>
          {subs.map(s => (
            <div key={s.id} className="border-b border-hair py-3 last:border-b-0">
              <p className="font-mono text-xs text-ink">{t.version} {s.version} · {dateTimeShort(s.created_at)} · {s.status}</p>
              {s.content && <p className="mt-1.5 text-sm text-muted"><Linkified text={s.content} /></p>}
              {s.review_note && <p className="mt-1.5 text-sm text-danger-text">{t.reviewer} {s.review_note}</p>}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function PageNotFound({ label }: { label: string }) {
  return <p className="text-muted">{label}</p>
}
