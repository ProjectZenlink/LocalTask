import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SecretText from '../components/SecretText'
import { useAuth } from '../context/AuthContext'
import type { Task, TaskOffer, TaskSubmission, Rating, PoolRow, AccountManager } from '../types/database'
import { payoutLabel, TASK_TYPES } from '../types/database'
import type { PlatformType } from '../types/database'
import { money, usd, lt, taskMoney, dateShort, dateTimeShort, txUrl, shortHash, signTaskFiles, fileNameFromPath, isImagePath, typeLabel } from '../lib/format'
import { Card, Button, Alert, Label, Input, Textarea, Linkified, SectionTitle } from '../components/ui'
import { TaskStatusBadge, Th, Td, Stars, KV, waLink, tgLink, PromptDialog } from './bits'
import { xLink, toLocalInput, safeFileName } from '../lib/format'
import { useLang } from './i18n'

type Signed = { path: string; url: string }
type OfferRow = TaskOffer & { freelancer: { display_name: string | null } | null }
type TaskRow = Task & {
  am: { name: string; whatsapp: string | null; telegram: string | null; x: string | null } | null
  rate_item: { id: string; label: string; amount: number } | null
}

const COPY = {
  zh: {
    notFound: '任务不存在', client: '账户经理', typeK: '类型', amount: '金额', payMethod: '收款方式', deadline: '截止', created: '创建',
    assignee: '接单人', payout: '收款地址(快照)', none: '—',
    brief: '任务说明', files: '附件', criteria: '验收标准',
    match: '可派的 Freelancer(已认证 · 开着接单)',
    matchEmpty: '暂无可派的人——现在没有人处于「开着接单」状态。',
    send: '直接派任务', sending: '派发中…',
    active: '活跃', done: '完成', strikes: 'Strikes', combo: '收款方式',
    inProgress: '等 freelancer 提交交付。', returnedNote: '上一版已退回:',
    review: '审核交付', reviewNote: '审核意见(退回时必填,freelancer 可见)', approve: '通过', reject: '退回修改',
    vNote: '退回必须填写审核意见。',
    payTitle: '放款', payReq: 'freelancer 已在钱包申请提现', payHint1: '把下面的地址和金额发给客户打款:', payHint2: '客户打款后把交易 hash 填在这里:',
    hash: '交易 Hash / PayPal 交易号', payNote: '付款备注(可选)', markPaid: '标记已付款', paid: '已标记付款,等 freelancer 确认到账关单。',
    hashBad: '交易号格式看起来不对:Tron 是 64 位十六进制,Ethereum 是 0x+64 位,PayPal 是 8–32 位字母数字。请核对后重填。',
    tx: '交易',
    back: '← 任务列表', tags: '标签', dlgCancel: '取消', copyLink: '复制验收链接', copied: '已复制 ✓', edit: '编辑任务', save: '保存修改', saving: '保存中…', cancelEdit: '取消编辑', addFiles: '追加附件(可多选)', tagHint: '标签(回车或逗号添加)', rate: '三维评分', quality: '质量', speed: '速度', attitude: '态度',
    rateNote: '内部备注(可选)', saveRating: '保存评分', rated: '已评分',
    strike: '记 Strike', strikeQ: 'Strike 原因(内部记录):', cancel: '取消任务', cancelQ: '取消原因:',
    cancelled: '任务已取消', offerHistory: 'Offer 历史', subHistory: '交付历史', version: '版本',
    confirmed: 'freelancer 已确认到账', reviewer: '审核意见:',
    commission: '提成', byRate: '按费率表', override1: '(单笔覆盖)', editCom: '改提成', reassign: '改归属',
    editComQ: '单笔提成覆盖(美元)，留空则清除、恢复按费率表：', vCom: '提成覆盖必须是不小于 0 的数字。',
  },
  en: {
    notFound: 'Task not found', client: 'AM', typeK: 'Type', amount: 'Amount', payMethod: 'Payout method', deadline: 'Due', created: 'Created',
    assignee: 'Assignee', payout: 'Payout address (snapshot)', none: '—',
    brief: 'Brief', files: 'Attachments', criteria: 'Acceptance criteria',
    match: 'Available freelancers (verified · open to work)',
    matchEmpty: 'Nobody available — no one is open to work right now.',
    send: 'Assign now', sending: 'Assigning…',
    active: 'Active', done: 'Done', strikes: 'Strikes', combo: 'Wallet',
    inProgress: 'Waiting for the freelancer to submit.', returnedNote: 'Last version was returned:',
    review: 'Review submission', reviewNote: 'Review note (required when returning, visible to freelancer)', approve: 'Approve', reject: 'Return for revision',
    vNote: 'A review note is required when returning.',
    payTitle: 'Payment', payReq: 'Freelancer requested payout from their wallet', payHint1: 'Send this address and amount to the client:', payHint2: 'Once the client pays, paste the transaction hash:',
    hash: 'Transaction hash / PayPal txn ID', payNote: 'Payment note (optional)', markPaid: 'Mark as paid', paid: 'Marked paid — waiting for the freelancer to confirm receipt.',
    hashBad: 'That reference looks off: Tron = 64 hex chars, Ethereum = 0x + 64 hex, PayPal = 8–32 alphanumerics. Please double-check.',
    tx: 'Transaction',
    back: '← All tasks', tags: 'Tags', dlgCancel: 'Cancel', copyLink: 'Copy acceptance link', copied: 'Copied ✓', edit: 'Edit task', save: 'Save changes', saving: 'Saving…', cancelEdit: 'Cancel editing', addFiles: 'Add attachments (multiple)', tagHint: 'Tags (Enter or comma to add)', rate: 'Rating', quality: 'Quality', speed: 'Speed', attitude: 'Attitude',
    rateNote: 'Internal note (optional)', saveRating: 'Save rating', rated: 'Rated',
    strike: 'Record strike', strikeQ: 'Strike reason (internal):', cancel: 'Cancel task', cancelQ: 'Cancellation reason:',
    cancelled: 'Task cancelled', offerHistory: 'Offer history', subHistory: 'Submission history', version: 'Version',
    confirmed: 'Freelancer confirmed receipt', reviewer: 'Review note:',
    commission: 'Commission', byRate: 'per rate table', override1: '(override)', editCom: 'Edit commission', reassign: 'Reassign',
    editComQ: 'Commission override (USD); blank clears it back to the rate table:', vCom: 'Override must be a number ≥ 0.',
  },
}

export default function AdminTaskDetail({ amScope = null }: { amScope?: AccountManager | null }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const base = amScope ? '/am/tasks' : '/admin/tasks'

  const [task, setTask] = useState<TaskRow | null>(null)
  const [amList, setAmList] = useState<AccountManager[]>([])
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [subs, setSubs] = useState<TaskSubmission[]>([])
  const [rating, setRating] = useState<Rating | null>(null)
  const [pool, setPool] = useState<PoolRow[]>([])
  const [briefFiles, setBriefFiles] = useState<Signed[]>([])
  const [subFiles, setSubFiles] = useState<Record<string, Signed[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reviewNote, setReviewNote] = useState('')
  const [hash, setHash] = useState('')
  const [payNote, setPayNote] = useState('')
  const [rQ, setRQ] = useState(0)
  const [rS, setRS] = useState(0)
  const [rA, setRA] = useState(0)
  const [rNote, setRNote] = useState('')
  const [dialog, setDialog] = useState<null | 'strike' | 'cancel' | 'editcom'>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    const [tRes, amRes, oRes, sRes, rRes] = await Promise.all([
      supabase.from('tasks').select('*, am:account_managers(name, whatsapp, telegram, x), rate_item:custom_rate_items(id, label, amount)').eq('id', id).maybeSingle(),
      supabase.from('account_managers').select('*').eq('is_active', true).order('name'),
      supabase.from('task_offers')
        .select('*, freelancer:profiles!task_offers_freelancer_id_fkey(display_name)')
        .eq('task_id', id).order('created_at', { ascending: false }),
      supabase.from('task_submissions').select('*').eq('task_id', id).order('version', { ascending: false }),
      supabase.from('ratings').select('*').eq('task_id', id).maybeSingle(),
    ])
    if (tRes.error) { setError(tRes.error.message); setLoaded(true); return }
    const tk = (tRes.data ?? null) as TaskRow | null
    setTask(tk)
    setAmList((amRes.data ?? []) as AccountManager[])
    setOffers((oRes.data ?? []) as OfferRow[])
    const list = (sRes.data ?? []) as TaskSubmission[]
    setSubs(list)
    setRating((rRes.data ?? null) as Rating | null)
    setLoaded(true)

    if (tk) {
      if (tk.status === 'unassigned') {
        let pq = supabase.from('freelancer_pool').select('*')
          .eq('is_suspended', false).eq('is_banned', false)
          .eq('kyc_status', 'verified').eq('is_rejected', false).not('managed_by', 'is', null)
          .order('active_tasks', { ascending: true })
        if (amScope) pq = pq.eq('managed_by', amScope.id)
        const { data: p } = await pq
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

  const latest = subs[0] ?? null

  const sendOffer = (flId: string) => run(async () =>
    supabase.rpc('assign_task_direct', { p_task: task.id, p_freelancer: flId }))

  const review = (approve: boolean) => {
    if (!approve && !reviewNote.trim()) { setError(t.vNote); return }
    if (!latest || latest.status !== 'submitted') return
    void run(async () => supabase.from('task_submissions')
      .update({ status: approve ? 'approved' : 'returned', review_note: reviewNote.trim() || null })
      .eq('id', latest.id))
  }

  const markPaid = () => {
    const h = hash.trim()
    if (!h) { setError(t.hash); return }
    const okFormat = task.payout_method === 'paypal'
      ? /^[A-Za-z0-9-]{8,32}$/.test(h)
      : task.payout_network === 'tron' ? /^[0-9a-fA-F]{64}$/.test(h)
      : task.payout_network === 'ethereum' ? /^0x[0-9a-fA-F]{64}$/.test(h)
      : true
    if (!okFormat) { setError(t.hashBad); return }
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

  const doStrike = (reason: string) => {
    setDialog(null)
    if (!task.assigned_freelancer) return
    void run(async () => supabase.from('strikes').insert({
      freelancer_id: task.assigned_freelancer, task_id: task.id, reason, created_by: user?.id ?? null,
    }))
  }

  const doCancel = (reason: string) => {
    setDialog(null)
    void run(async () =>
      supabase.from('tasks').update({ status: 'cancelled', cancelled_reason: reason }).eq('id', task.id))
  }

  const setCommission = (raw: string) => {
    setDialog(null)
    const v = raw.trim() === '' ? null : Number(raw)
    if (v !== null && !(v >= 0)) { setError(t.vCom); return }
    void run(async () => supabase.from('tasks').update({ commission_override: v }).eq('id', task.id))
  }

  const canCancel = !['completed', 'cancelled'].includes(task.status)

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${task!.share_token}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* 剪贴板不可用时静默 */ }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={base} className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <div className="mb-5 flex items-start justify-between gap-3">
        <h1 className="min-w-0 font-display text-2xl font-medium tracking-tight text-ink">{task.title}</h1>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <TaskStatusBadge status={task.status} />
          <div className="flex gap-2">
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={copyShare}>
              {copied ? t.copied : t.copyLink}
            </Button>
            {(task.status === 'unassigned' || task.status === 'offered') && !editing && (
              <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setEditing(true)}>{t.edit}</Button>
            )}
          </div>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="mb-5 p-5">
        <KV k={t.client}>
          {amScope ? (
            task.am ? (
              <>
                {task.am.name}
                {task.am.whatsapp && <> · <a className="font-mono text-xs text-petrol underline underline-offset-2" href={waLink(task.am.whatsapp)} target="_blank" rel="noreferrer">WA</a></>}
                {task.am.telegram && <> · <a className="font-mono text-xs text-petrol underline underline-offset-2" href={tgLink(task.am.telegram)} target="_blank" rel="noreferrer">TG</a></>}
                {task.am.x && <> · <a className="font-mono text-xs text-petrol underline underline-offset-2" href={xLink(task.am.x)} target="_blank" rel="noreferrer">X</a></>}
              </>
            ) : t.none
          ) : (
            <select
              value={task.am_id ?? ''}
              onChange={e => {
                const v = e.target.value || null
                void run(async () => supabase.from('tasks').update({ am_id: v }).eq('id', task.id))
              }}
              className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
            >
              <option value="">{t.none}</option>
              {amList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </KV>
        {task.task_type && (
          <KV k={t.typeK}>
            <span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{task.task_type === 'Other' && task.rate_item ? (lang === 'zh' ? `其他（${task.rate_item.label}）` : `Other (${task.rate_item.label})`) : typeLabel(task.task_type, lang)}</span>
          </KV>
        )}
        <KV k={t.amount}><span className="font-mono">{taskMoney(task.amount, task.payout_token)}</span></KV>
        <KV k={t.commission}>
          <span className="font-mono">
            {task.commission_override != null ? `${usd(Number(task.commission_override))} ${t.override1}` : t.byRate}
          </span>
          {!amScope && (
            <button onClick={() => setDialog('editcom')}
              className="ml-3 font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
              {t.editCom}
            </button>
          )}
        </KV>
        {task.payout_method === 'paypal' ? (
          <KV k={t.payMethod}><span className="font-mono">PayPal</span></KV>
        ) : task.payout_network && task.payout_token && (
          <KV k={t.payMethod}><span className="font-mono">{payoutLabel(task.payout_network, task.payout_token)}</span></KV>
        )}
        <KV k={t.deadline}>{task.deadline ? dateTimeShort(task.deadline) : t.none}</KV>
        <KV k={t.created}>{dateShort(task.created_at)}</KV>
        <KV k={t.assignee}>{offers.find(o => o.status === 'accepted')?.freelancer?.display_name ?? (task.assigned_freelancer ? task.assigned_freelancer.slice(0, 8) : t.none)}</KV>
        {(task.payout_method === 'paypal' ? task.payout_paypal_email : task.payout_address) && (
          <KV k={t.payout}><span className="break-all font-mono text-xs">
            {task.payout_method === 'paypal' ? task.payout_paypal_email : task.payout_address}
          </span></KV>
        )}
        {task.tags.length > 0 && (
          <KV k={t.tags}>
            <span className="flex flex-wrap gap-1.5">
              {task.tags.map(tag => (
                <span key={tag} className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{tag}</span>
              ))}
            </span>
          </KV>
        )}
      </Card>

      {editing ? (
        <EditTask task={task} labels={t} onDone={() => { setEditing(false); void load() }} onCancel={() => setEditing(false)} />
      ) : (
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
      )}

      {/* ── 未指派:匹配池 ── */}
      {task.status === 'unassigned' && (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.match}</SectionTitle>
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
                      <Td className="whitespace-nowrap font-mono text-xs">{p.payout_method === 'paypal' ? 'PayPal' : p.payout_network && p.payout_token ? payoutLabel(p.payout_network, p.payout_token) : '—'}</Td>
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
          {(latest.account_login || latest.account_password) && (
            <div className="mb-3 rounded-xl border border-hair bg-paper px-4 py-3">
              <p className="font-mono text-xs text-ink">{latest.account_login ?? '—'}</p>
              {latest.account_password && <p className="mt-1 font-mono text-xs text-muted"><SecretText value={latest.account_password} /></p>}
            </div>
          )}
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
          {task.payout_requested_at && !task.paid_at && (
            <p className="mb-3 rounded-lg border border-pending-border bg-pending-bg px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-pending-text">
              {t.payReq} · {dateTimeShort(task.payout_requested_at)}
            </p>
          )}
          {!task.paid_at ? (
            <>
              <p className="text-sm text-ink">{t.payHint1}</p>
              <p className="mt-1 break-all font-mono text-xs text-ink">
                {task.payout_method === 'paypal' ? task.payout_paypal_email : task.payout_address}
              </p>
              <p className="mt-1 font-mono text-xs text-ink">
                {task.payout_method === 'paypal'
                  ? <>{usd(task.amount)} · PayPal</>
                  : <>
                      {task.payout_token === 'ETH'
                        ? (lang === 'zh' ? `按市价折合 ${usd(task.amount)} 的 ETH` : `the USD equivalent of ${usd(task.amount)} in ETH`)
                        : money(task.amount, task.payout_token ?? '')}
                      {task.payout_network && task.payout_token && <> · {payoutLabel(task.payout_network, task.payout_token)}</>}
                    </>}
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
          {task.assigned_freelancer && <Button variant="ghost" disabled={busy} onClick={() => setDialog('strike')}>{t.strike}</Button>}
          {canCancel && <Button variant="danger" disabled={busy} onClick={() => setDialog('cancel')}>{t.cancel}</Button>}
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
      <PromptDialog
        open={dialog === 'cancel'}
        title={t.cancel}
        hint={t.cancelQ}
        confirmLabel={t.cancel}
        cancelLabel={t.dlgCancel}
        danger
        onConfirm={doCancel}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        open={dialog === 'strike'}
        title={t.strike}
        hint={t.strikeQ}
        confirmLabel={t.strike}
        cancelLabel={t.dlgCancel}
        onConfirm={doStrike}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        open={dialog === 'editcom'}
        title={t.editCom}
        hint={t.editComQ}
        confirmLabel={t.editCom}
        cancelLabel={t.dlgCancel}
        danger={false}
        allowEmpty
        onConfirm={setCommission}
        onClose={() => setDialog(null)}
      />

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

/** 未指派任务的编辑卡（标题/标签/说明/验收/金额/截止 + 追加附件） */
function EditTask({ task, labels, onDone, onCancel }: {
  task: TaskRow
  labels: typeof COPY['zh'] | typeof COPY['en']
  onDone: () => void
  onCancel: () => void
}) {
  const { lang } = useLang()
  const t = labels
  const [title, setTitle] = useState(task.title)
  const [typeSel, setTypeSel] = useState<'' | PlatformType>(task.task_type ?? '')
  const [tags, setTags] = useState<string[]>(task.tags)
  const [tagDraft, setTagDraft] = useState('')
  const [desc, setDesc] = useState(task.description ?? '')
  const [criteria, setCriteria] = useState(task.acceptance_criteria)
  const [amount, setAmount] = useState(String(task.amount))
  const [deadline, setDeadline] = useState(toLocalInput(task.deadline))
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function addTags(raw: string) {
    const parts = raw.split(/[,，]/).map(x => x.trim()).filter(Boolean)
    if (parts.length === 0) return
    setTags(prev => [...new Set([...prev, ...parts])])
    setTagDraft('')
  }

  async function saveAll() {
    setErr(null)
    const amt = Number(amount)
    if (!title.trim() || !criteria.trim() || !(amt > 0)) { setErr('…'); return }
    setBusy(true)
    try {
      let paths = task.attachment_paths
      if (files.length > 0) {
        const added: string[] = []
        for (const f of files) {
          const path = `briefs/${task.id}/${Date.now()}-${safeFileName(f.name)}`
          const { error: upErr } = await supabase.storage.from('task-attachments').upload(path, f)
          if (upErr) throw new Error(`[upload ${f.name}] ${upErr.message}`)
          added.push(path)
        }
        paths = [...paths, ...added]
      }
      const { error: e } = await supabase.from('tasks').update({
        title: title.trim(),
        task_type: typeSel || null,
        tags,
        description: desc.trim() || null,
        acceptance_criteria: criteria.trim(),
        amount: amt,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        attachment_paths: paths,
      }).eq('id', task.id)
      if (e) throw new Error(e.message)
      onDone()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : JSON.stringify(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-5 border-petrol/25 p-5">
      {err && <Alert tone="error">{err}</Alert>}
      <div className="mb-4"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="mb-4">
        <Label>Type</Label>
        <select value={typeSel} onChange={e => setTypeSel(e.target.value as '' | PlatformType)}
          className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20">
          <option value="">—</option>
          {TASK_TYPES.map(p => <option key={p} value={p}>{typeLabel(p, lang)}</option>)}
        </select>
      </div>
      <div className="mb-4">
        <Label>{t.tagHint}</Label>
        <Input value={tagDraft} onChange={e => setTagDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTags(tagDraft) } }}
          onBlur={() => addTags(tagDraft)} />
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-paper px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                {tag}
                <button type="button" onClick={() => setTags(tags.filter(x => x !== tag))} className="text-faint transition hover:text-danger-text">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mb-4"><Label>{t.brief}</Label><Textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div className="mb-4"><Label>{t.criteria}</Label><Textarea rows={4} value={criteria} onChange={e => setCriteria(e.target.value)} /></div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><Label>{t.amount}</Label><Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono" /></div>
        <div><Label>{t.deadline}</Label><Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
      </div>
      <div className="mb-5">
        <Label>{t.addFiles}</Label>
        <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-white file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper" />
        {files.length > 0 && <p className="mt-1.5 font-mono text-xs text-verified-text">{files.map(f => f.name).join(' · ')}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t.cancelEdit}</Button>
        <Button disabled={busy} onClick={saveAll}>{busy ? t.saving : t.save}</Button>
      </div>
    </Card>
  )
}
