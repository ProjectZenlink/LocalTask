import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task, TaskSubmission } from '../types/database'
import { waLink, tgLink, xLink } from '../lib/format'
import { payoutLabel } from '../types/database'
import {
  money, usd, lt, taskMoney, dateShort, dateTimeShort, txUrl, shortHash,
  safeFileName, fileNameFromPath, isImagePath, signTaskFiles, openSigned,
} from '../lib/format'
import { PageHeading, Card, Button, Alert, SectionTitle, TaskBadge, Textarea, Label, Linkified, Input } from '../components/ui'
import { useI18n } from '../lib/i18n'

type Signed = { path: string; url: string }
type TaskRow = Task & { am: { name: string; whatsapp: string | null; telegram: string | null; x: string | null } | null }

const COPY = {
  en: {
    loading: 'Loading…', back: '← Tasks', due: 'due',
    notFound: 'Task not found', notFoundBody: "This task doesn't exist or isn't shared with you.",
    working: 'Working…',
    brief: 'Brief', noDesc: 'No description provided.',
    criteria: 'Acceptance criteria',
    criteriaNote: 'Your submission is reviewed against these points — nothing else.',
    yourAm: 'Your account manager',
    amNote: 'Questions about the brief, deadline, or payment? Message them directly.',
    revision: 'Revision requested.', revisionFallback: 'See your account manager for details.',
    submitRevision: (v: number) => `Submit revision (v${v})`, submitWork: 'Submit your work',
    credLogin: 'Account (login / email) — required', credPwd: 'Account password — required',
    errCred: 'Enter the account login and password you opened for this task.',
    notesLabel: 'Notes, links, completion codes',
    notesPh: 'Describe what you did, paste links or codes the reviewer needs…',
    filesLabel: 'Attachments (screenshots, files)',
    errEmpty: 'Add a note or attach at least one file.',
    submitting: 'Submitting…', submitCta: 'Submit for review',
    underReview: (v: string) => `Submitted${v} — your work is being reviewed against the acceptance criteria.`,
    approved: 'Approved',
    passed1: (v: string) => `Your work passed review — your ${v} are unlocked. The client has been asked to send`,
    passedPp: 'directly to your PayPal:', passedWallet: 'directly to your wallet:',
    ethEquiv: (u: string) => `the equivalent of ${u} in ETH`,
    confirmLater: 'Head to your wallet and hit "Request payout" — everything you\u2019re owed goes out as one request.', goWallet: 'Go to wallet \u2192',
    reported: 'The client reports payment sent',
    refWord: 'reference', txWord: 'transaction',
    checkPp: 'Check your PayPal.', checkWallet: 'Check your wallet.',
    checkTail: 'Confirmation happens in your wallet — confirming the payout request closes every task inside it at once.',
    received: 'I received the payment',
    completed: 'Completed',
    paidWord: 'Paid', viaPp: (u: string) => `${u} via PayPal`, settled: 'settled',
    ref: 'ref', confirmedAt: 'confirmed',
    cancelled: 'This task was cancelled', cancelTail: 'Your account manager will follow up about any work already done.',
    history: 'Submission history', reviewer: 'Reviewer:',
    subStatus: { pending: 'pending', approved: 'approved', returned: 'returned' } as Record<string, string>,
  },
  zh: {
    loading: '加载中…', back: '← 我的任务', due: '截止',
    notFound: '任务不存在', notFoundBody: '这个任务不存在，或者没有共享给你。',
    working: '处理中…',
    brief: '任务说明', noDesc: '没有填写说明。',
    criteria: '验收标准',
    criteriaNote: '审核只看这些标准，别的都不看。',
    yourAm: '你的账户经理',
    amNote: '关于任务、截止时间或付款有问题？直接给他发消息。',
    revision: '需要返修。', revisionFallback: '详情请联系账户经理。',
    submitRevision: (v: number) => `提交返修版（v${v}）`, submitWork: '提交你的工作',
    credLogin: '账号(登录名/邮箱)——必填', credPwd: '账号密码——必填',
    errCred: '请填写本单开出来的账号和密码。',
    notesLabel: '备注、链接、完成码',
    notesPh: '描述你做了什么，粘贴审核需要的链接或完成码…',
    filesLabel: '附件（截图、文件）',
    errEmpty: '请填写备注或至少附一个文件。',
    submitting: '提交中…', submitCta: '提交审核',
    underReview: (v: string) => `已提交${v}，正在按验收标准审核。`,
    approved: '已通过',
    passed1: (v: string) => `你的工作已通过审核，${v} 已解锁。客户已被要求把`,
    passedPp: '直接付到你的 PayPal：', passedWallet: '直接付到你的钱包地址：',
    ethEquiv: (u: string) => `等值 ${u} 的 ETH`,
    confirmLater: '去钱包点「申请提现」——你的全部应收会打包成一张工单发给你的 AM。', goWallet: '去钱包 →',
    reported: '客户报告付款已发出',
    refWord: '编号', txWord: '交易',
    checkPp: '去 PayPal 查一下。', checkWallet: '去钱包查一下。',
    checkTail: '确认到账在钱包里进行——对整张提现工单确认后,里面的任务会一起关单。',
    received: '我收到钱了',
    completed: '已完成',
    paidWord: '已付', viaPp: (u: string) => `${u}（PayPal）`, settled: '已结清',
    ref: '编号', confirmedAt: '确认于',
    cancelled: '这个任务已取消', cancelTail: '已完成的部分账户经理会跟进处理。',
    history: '提交记录', reviewer: '审核意见：',
    subStatus: { pending: '待审核', approved: '已通过', returned: '已退回' } as Record<string, string>,
  },
}

function FileLinks({ files }: { files: Signed[] }) {
  if (files.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {files.map(f => (
        <a key={f.path} href={f.url} target="_blank" rel="noreferrer" className="block"
          onClick={e => { e.preventDefault(); void openSigned('task-attachments', f.path) }}>
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
  const { lang } = useI18n()
  const t = COPY[lang]

  const [task, setTask] = useState<TaskRow | null>(null)
  const [subs, setSubs] = useState<TaskSubmission[]>([])
  const [briefFiles, setBriefFiles] = useState<Signed[]>([])
  const [subFiles, setSubFiles] = useState<Record<string, Signed[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [content, setContent] = useState('')
  const [acctLogin, setAcctLogin] = useState('')
  const [acctPwd, setAcctPwd] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const load = useCallback(async () => {
    if (!id || !user) return
    setError(null)
    const [tRes, sRes] = await Promise.all([
      supabase.from('tasks').select('*, am:account_managers(name, whatsapp, telegram, x)').eq('id', id).maybeSingle(),
      supabase.from('task_submissions').select('*').eq('task_id', id)
        .order('version', { ascending: false }),
    ])
    if (tRes.error) { setError(tRes.error.message); setLoaded(true); return }
    const tk = (tRes.data ?? null) as TaskRow | null
    setTask(tk)
    const list = (sRes.data ?? []) as TaskSubmission[]
    setSubs(list)
    setLoaded(true)

    if (tk && tk.attachment_paths.length > 0) setBriefFiles(await signTaskFiles(tk.attachment_paths))
    const map: Record<string, Signed[]> = {}
    for (const s of list) {
      if (s.attachment_paths.length > 0) map[s.id] = await signTaskFiles(s.attachment_paths)
    }
    setSubFiles(map)
  }, [id, user])

  useEffect(() => { void load() }, [load])

  async function submitWork() {
    if (!id || !user || !task) return
    if (!acctLogin.trim() || !acctPwd.trim()) { setError(t.errCred); return }
    if (!content.trim() && files.length === 0) { setError(t.errEmpty); return }
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
        account_login: acctLogin.trim(),
        account_password: acctPwd,
      })
      if (insErr) throw new Error(`[submission] ${insErr.message}`)
      setContent(''); setFiles([]); setAcctLogin(''); setAcctPwd('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <div className="text-muted">{t.loading}</div>
  if (!task) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeading>{t.notFound}</PageHeading>
        <p className="text-sm text-muted">{t.notFoundBody}</p>
      </div>
    )
  }

  const mine = task.assigned_freelancer === user?.id
  const latest = subs[0] ?? null
  const needsRevision = task.status === 'in_progress' && latest?.status === 'returned'

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/tasks" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{task.title}</h1>
          <p className="mt-2 font-mono text-xs text-faint">
            {taskMoney(task.amount, task.payout_token)}
            {task.payout_method === 'paypal' ? <> · PayPal</> : task.payout_network && task.payout_token && <> · {payoutLabel(task.payout_network, task.payout_token)}</>}
            {task.deadline && <> · {t.due} {dateShort(task.deadline)}</>}
          </p>
        </div>
        <TaskBadge status={task.status} lang={lang} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* ── Brief ── */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.brief}</SectionTitle>
        {task.description
          ? <p className="text-sm leading-relaxed text-ink"><Linkified text={task.description} /></p>
          : <p className="text-sm text-faint">{t.noDesc}</p>}
        <FileLinks files={briefFiles} />
        <p className="mt-3 border-t border-hair pt-3 text-xs text-muted">
          Once your task is complete, please contact your account manager.
        </p>
      </Card>

      {/* ── Acceptance criteria ── */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.criteria}</SectionTitle>
        <p className="text-sm leading-relaxed text-ink"><Linkified text={task.acceptance_criteria} /></p>
        <p className="mt-3 text-xs text-faint">{t.criteriaNote}</p>
      </Card>

      {/* ── Your account manager ── */}
      {task.am && (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.yourAm}</SectionTitle>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">{task.am.name}</p>
            <div className="flex gap-2">
              {task.am.whatsapp && (
                <a href={waLink(task.am.whatsapp)} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-hair bg-white px-3 py-1.5 font-display text-sm text-ink transition hover:bg-paper">
                  WhatsApp
                </a>
              )}
              {task.am.telegram && (
                <a href={tgLink(task.am.telegram)} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-hair bg-white px-3 py-1.5 font-display text-sm text-ink transition hover:bg-paper">
                  Telegram
                </a>
              )}
              {task.am.x && (
                <a href={xLink(task.am.x)} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-hair bg-white px-3 py-1.5 font-display text-sm text-ink transition hover:bg-paper">
                  X
                </a>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-faint">{t.amNote}</p>
        </Card>
      )}

      {/* ── Revision requested ── */}
      {mine && needsRevision && (
        <Alert tone="warning">
          <span className="font-medium">{t.revision}</span>{' '}
          {latest?.review_note ?? t.revisionFallback}
        </Alert>
      )}

      {/* ── Submit work ── */}
      {mine && task.status === 'in_progress' && (
        <Card className="mb-5 p-5">
          <SectionTitle>{needsRevision ? t.submitRevision((latest?.version ?? 0) + 1) : t.submitWork}</SectionTitle>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>{t.credLogin}</Label>
              <Input value={acctLogin} onChange={e => setAcctLogin(e.target.value)} placeholder="name@gmail.com" className="font-mono" />
            </div>
            <div>
              <Label>{t.credPwd}</Label>
              <Input value={acctPwd} onChange={e => setAcctPwd(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="mb-4">
            <Label>{t.notesLabel}</Label>
            <Textarea rows={4} value={content} onChange={e => setContent(e.target.value)}
              placeholder={t.notesPh} />
          </div>
          <div className="mb-4">
            <Label>{t.filesLabel}</Label>
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
            {busy ? t.submitting : t.submitCta}
          </Button>
        </Card>
      )}

      {/* ── Under review ── */}
      {mine && task.status === 'under_review' && (
        <Alert tone="info">{t.underReview(latest ? ` (v${latest.version})` : '')}</Alert>
      )}

      {/* ── Awaiting payment / paid ── */}
      {mine && task.status === 'pending_payment' && (
        <Card className="mb-5 border-verified-border bg-verified-bg p-5">
          <SectionTitle>{t.approved}</SectionTitle>
          {!task.paid_at ? (
            <>
              <p className="text-sm leading-relaxed text-ink">
                {t.passed1(lt(task.amount))}{' '}
                <span className="font-mono">
                  {task.payout_method === 'paypal'
                    ? usd(task.amount)
                    : task.payout_token === 'ETH' ? t.ethEquiv(usd(task.amount)) : money(task.amount, task.payout_token ?? 'USDT')}
                </span>{' '}
                {task.payout_method === 'paypal' ? t.passedPp : t.passedWallet}
              </p>
              <p className="mt-2 break-all font-mono text-xs text-ink">
                {task.payout_method === 'paypal' ? task.payout_paypal_email : task.payout_address}
              </p>
              <p className="mt-3 text-xs text-muted">{t.confirmLater}</p>
              <Link to="/earnings" className="mt-3 inline-block rounded-xl bg-petrol px-4 py-2 font-display text-sm font-medium tracking-tight text-paper transition hover:bg-petrol-hover">{t.goWallet}</Link>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink">
                {t.reported}
                {task.tx_hash && (task.payout_method === 'paypal' || !task.payout_network ? (
                  <> — {t.refWord} <span className="font-mono text-ink">{shortHash(task.tx_hash)}</span></>
                ) : (
                  <> — {t.txWord}{' '}
                    <a href={txUrl(task.payout_network, task.tx_hash)} target="_blank" rel="noreferrer"
                      className="font-mono text-petrol underline underline-offset-2">{shortHash(task.tx_hash)}</a>
                  </>
                ))}.
              </p>
              {task.payment_note && <p className="mt-2 text-sm text-muted">{task.payment_note}</p>}
              <p className="mt-3 text-xs text-muted">
                {task.payout_method === 'paypal' ? t.checkPp : t.checkWallet} {t.checkTail}
              </p>
              <Link to="/earnings" className="mt-4 block rounded-xl bg-petrol px-4 py-2 text-center font-display text-sm font-medium tracking-tight text-paper transition hover:bg-petrol-hover">{t.goWallet}</Link>
            </>
          )}
        </Card>
      )}

      {/* ── Completed ── */}
      {task.status === 'completed' && (
        <Card className="mb-5 border-verified-border bg-verified-bg p-5">
          <SectionTitle>{t.completed}</SectionTitle>
          <p className="text-sm leading-relaxed text-ink">
            {t.paidWord} {task.payout_method === 'paypal' ? t.viaPp(usd(task.amount)) : taskMoney(task.amount, task.payout_token)} · {lt(task.amount)} {t.settled}
            {task.tx_hash && (task.payout_method === 'paypal' || !task.payout_network ? (
              <> · {t.ref} <span className="font-mono">{shortHash(task.tx_hash)}</span></>
            ) : (
              <> · <a href={txUrl(task.payout_network, task.tx_hash)} target="_blank" rel="noreferrer"
                className="font-mono text-petrol underline underline-offset-2">{shortHash(task.tx_hash)}</a></>
            ))}
            {task.freelancer_confirmed_at && <> · {t.confirmedAt} {dateShort(task.freelancer_confirmed_at)}</>}
          </p>
        </Card>
      )}

      {/* ── Cancelled ── */}
      {task.status === 'cancelled' && (
        <Alert tone="warning">
          {t.cancelled}{task.cancelled_reason ? ` — ${task.cancelled_reason}` : ''}. {t.cancelTail}
        </Alert>
      )}

      {/* ── Submission history ── */}
      {mine && subs.length > 0 && (
        <Card className="p-5">
          <SectionTitle>{t.history}</SectionTitle>
          {subs.map(s => (
            <div key={s.id} className="border-b border-hair py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-ink">v{s.version} · {dateTimeShort(s.created_at)}</p>
                <span className={`font-mono text-[11px] uppercase tracking-wider ${
                  s.status === 'approved' ? 'text-verified-text' : s.status === 'returned' ? 'text-danger-text' : 'text-pending-text'
                }`}>{t.subStatus[s.status] ?? s.status}</span>
              </div>
              {s.content && <p className="mt-2 text-sm leading-relaxed text-muted"><Linkified text={s.content} /></p>}
              {s.status === 'returned' && s.review_note && (
                <p className="mt-2 text-sm text-danger-text">{t.reviewer} {s.review_note}</p>
              )}
              <FileLinks files={subFiles[s.id] ?? []} />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
