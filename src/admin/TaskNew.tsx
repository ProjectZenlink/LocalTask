import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager, PoolRow, PlatformType } from '../types/database'
import { PLATFORMS } from '../types/database'
import { payoutLabel } from '../types/database'
import { safeFileName } from '../lib/format'
import { PageHeading, Card, Button, Alert, Label, Input, Textarea } from '../components/ui'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '新建任务', sub: '账户经理和验收标准是必填 —— 验收标准是之后审核和裁决的唯一依据。金额一律美元,freelancer 用自己设置的钱包收款。',
    client: '账户经理(负责本任务)', clientNone: '还没有账户经理。先去', clientLink: 'AM 页', clientNone2: '建一个。',
    taskTitle: '任务标题', taskType: '任务类型(可选,与 AM 清单的「完成」灯联动)', typeNone: '— 不设类型 —', tags: '标签(可选,回车或逗号添加,如 Paypal)', desc: '任务说明(可贴链接,freelancer 端可点击)',
    files: '附件(二维码图片、素材等,可多选)', criteria: '验收标准(必填,一行一条)',
    amount: '金额(美元;1 LT = $1)', deadline: '截止时间(可选)',
    assignee: '直接发 Offer 给(可选)', assigneeNone: '先不指派',
    active: '活跃', noWallet: '未设钱包', create: '创建任务', creating: '创建中…',
    back: '← 任务列表', vClient: '请选择账户经理。', vTitle: '请填任务标题。', vCriteria: '验收标准必填。', vAmount: '金额需大于 0。',
    offerFail: '任务已创建,但直接发 Offer 失败:',
  },
  en: {
    title: 'New task', sub: 'Account manager and acceptance criteria are required — the criteria are the only basis for review and disputes. Amounts are in USD; freelancers receive to their own wallet.',
    client: 'Account manager (owns this task)', clientNone: 'No account managers yet. Create one on the', clientLink: 'AMs page', clientNone2: 'first.',
    taskTitle: 'Title', taskType: 'Task type (optional — lights the AM checklist)', typeNone: '— No type —', tags: 'Tags (optional — Enter or comma to add, e.g. Paypal)', desc: 'Description (links are clickable on the freelancer side)',
    files: 'Attachments (QR images, assets — multiple allowed)', criteria: 'Acceptance criteria (required, one per line)',
    amount: 'Amount (USD; 1 LT = $1)', deadline: 'Deadline (optional)',
    assignee: 'Send offer directly to (optional)', assigneeNone: "Don't assign yet",
    active: 'active', noWallet: 'no wallet yet', create: 'Create task', creating: 'Creating…',
    back: '← All tasks', vClient: 'Pick an account manager.', vTitle: 'Enter a title.', vCriteria: 'Acceptance criteria are required.', vAmount: 'Amount must be greater than 0.',
    offerFail: 'Task created, but sending the offer failed: ',
  },
}

export default function AdminTaskNew() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState<AccountManager[]>([])
  const [clientId, setClientId] = useState('')
  const [pool, setPool] = useState<PoolRow[]>([])
  const [assignee, setAssignee] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [typeSel, setTypeSel] = useState<'' | PlatformType>('')
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [criteria, setCriteria] = useState('')
  const [amount, setAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('account_managers').select('*').eq('is_active', true).order('name')
      .then(({ data }) => {
        const list = (data ?? []) as AccountManager[]
        setClients(list)
        if (list.length === 1) setClientId(list[0].id)
      })
    supabase.from('freelancer_pool').select('*')
      .eq('open_to_work', true).eq('is_suspended', false).eq('is_banned', false)
      .eq('kyc_status', 'verified')
      .order('active_tasks', { ascending: true })
      .then(({ data }) => setPool((data ?? []) as PoolRow[]))
  }, [])

  function addTags(raw: string) {
    const parts = raw.split(/[,，]/).map(x => x.trim()).filter(Boolean)
    if (parts.length === 0) return
    setTags(prev => [...new Set([...prev, ...parts])])
    setTagDraft('')
  }

  async function create() {
    setError(null)
    const amt = Number(amount)
    if (!clientId) { setError(t.vClient); return }
    if (!title.trim()) { setError(t.vTitle); return }
    if (!criteria.trim()) { setError(t.vCriteria); return }
    if (!(amt > 0)) { setError(t.vAmount); return }

    setBusy(true)
    try {
      const { data: task, error: insErr } = await supabase.from('tasks').insert({
        am_id: clientId,
        created_by: user?.id ?? null,
        title: title.trim(),
        task_type: typeSel || null,
        tags,
        description: desc.trim() || null,
        acceptance_criteria: criteria.trim(),
        amount: amt,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      }).select('id').single()
      if (insErr) throw new Error(`[task] ${insErr.message}`)

      if (files.length > 0) {
        const paths: string[] = []
        for (const f of files) {
          const path = `briefs/${task.id}/${Date.now()}-${safeFileName(f.name)}`
          const { error: upErr } = await supabase.storage.from('task-attachments').upload(path, f)
          if (upErr) throw new Error(`[upload ${f.name}] ${upErr.message}`)
          paths.push(path)
        }
        const { error: updErr } = await supabase.from('tasks').update({ attachment_paths: paths }).eq('id', task.id)
        if (updErr) throw new Error(`[attachments] ${updErr.message}`)
      }

      if (assignee) {
        const { error: offErr } = await supabase.from('task_offers').insert({
          task_id: task.id, freelancer_id: assignee, created_by: user?.id ?? null,
        })
        if (offErr) window.alert(t.offerFail + offErr.message)
      }

      navigate(`/admin/tasks/${task.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  const selectCls = 'w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20'

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/admin/tasks" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        <div className="mb-4">
          <Label>{t.client}</Label>
          {clients.length === 0 ? (
            <p className="text-sm text-muted">
              {t.clientNone} <Link to="/admin/ams" className="text-petrol underline underline-offset-2">{t.clientLink}</Link> {t.clientNone2}
            </p>
          ) : (
            <select value={clientId} onChange={e => setClientId(e.target.value)} className={selectCls}>
              <option value="">—</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="mb-4"><Label>{t.taskTitle}</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>

        <div className="mb-4">
          <Label>{t.taskType}</Label>
          <select value={typeSel} onChange={e => setTypeSel(e.target.value as '' | PlatformType)} className={selectCls}>
            <option value="">{t.typeNone}</option>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="mb-4">
          <Label>{t.tags}</Label>
          <Input
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTags(tagDraft) }
            }}
            onBlur={() => addTags(tagDraft)}
            placeholder="Paypal"
          />
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

        <div className="mb-4"><Label>{t.desc}</Label><Textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} /></div>

        <div className="mb-4">
          <Label>{t.files}</Label>
          <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-white file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper" />
          {files.length > 0 && <p className="mt-1.5 font-mono text-xs text-verified-text">{files.map(f => f.name).join(' · ')}</p>}
        </div>

        <div className="mb-4"><Label>{t.criteria}</Label><Textarea rows={4} value={criteria} onChange={e => setCriteria(e.target.value)} placeholder={'1) …\n2) …'} /></div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{t.amount}</Label>
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono" placeholder="30" />
          </div>
          <div>
            <Label>{t.deadline}</Label>
            <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="mb-5">
          <Label>{t.assignee}</Label>
          <select value={assignee} onChange={e => setAssignee(e.target.value)} className={selectCls}>
            <option value="">{t.assigneeNone}</option>
            {pool.map(p => (
              <option key={p.id} value={p.id}>
                {p.display_name ?? p.id.slice(0, 8)}
                {p.payout_network && p.payout_token ? ` · ${payoutLabel(p.payout_network, p.payout_token)}` : ` · ${t.noWallet}`}
                {` · ${t.active} ${p.active_tasks}`}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={create} disabled={busy || clients.length === 0} className="w-full">
          {busy ? t.creating : t.create}
        </Button>
      </Card>
    </div>
  )
}
