import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager, PoolRow, PlatformType } from '../types/database'
import { TASK_TYPES } from '../types/database'
import { payoutLabel } from '../types/database'
import { safeFileName, typeLabel } from '../lib/format'
import { PageHeading, Card, Button, Alert, Label, Input, Textarea } from '../components/ui'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '新建任务', sub: '账户经理和验收标准是必填 —— 验收标准是之后审核和裁决的唯一依据。金额一律美元,freelancer 用自己设置的钱包收款。',
    client: '账户经理(负责本任务)', clientNone: '还没有账户经理。先去', clientLink: 'AM 页', clientNone2: '建一个。',
    taskTitle: '任务标题', taskType: '任务类型', typeNone: '— 不设类型 —', tags: '标签(可选,回车或逗号添加,如 Paypal)', desc: '任务说明(可贴链接,freelancer 端可点击)',
    files: '附件(二维码图片、素材等,可多选)', criteria: '验收标准(必填,一行一条)',
    amount: '金额(美元;1 LT Coin = $1)', deadline: '截止时间(可选)',
    assignee: '直接发 Offer 给(可选)', assigneeNone: '先不指派',
    active: '活跃', noWallet: '未设钱包', create: '创建任务', creating: '创建中…',
    back: '← 任务列表', vClient: '请选择账户经理。', vTitle: '请填任务标题。', vCriteria: '验收标准必填。', vAmount: '金额需大于 0。',
    offerFail: '任务已创建,但直接发 Offer 失败:',
    override: '提成覆盖(可选,美元)', overrideHint: '留空则按费率表；仅本单生效。',
    otherHint: '「其他」不进开通清单；提成 = 单笔覆盖 → 细分 → 费率表「其他」→ 0。', itemNone: '— 不挂细分 —',
  },
  en: {
    title: 'New task', sub: 'Account manager and acceptance criteria are required — the criteria are the only basis for review and disputes. Amounts are in USD; freelancers receive to their own wallet.',
    client: 'Account manager (owns this task)', clientNone: 'No account managers yet. Create one on the', clientLink: 'AMs page', clientNone2: 'first.',
    taskTitle: 'Title', taskType: 'Task type', typeNone: '— No type —', tags: 'Tags (optional — Enter or comma to add, e.g. Paypal)', desc: 'Description (links are clickable on the freelancer side)',
    files: 'Attachments (QR images, assets — multiple allowed)', criteria: 'Acceptance criteria (required, one per line)',
    amount: 'Amount (USD; 1 LT Coin = $1)', deadline: 'Deadline (optional)',
    assignee: 'Send offer directly to (optional)', assigneeNone: "Don't assign yet",
    active: 'active', noWallet: 'no wallet yet', create: 'Create task', creating: 'Creating…',
    back: '← All tasks', vClient: 'Pick an account manager.', vTitle: 'Enter a title.', vCriteria: 'Acceptance criteria are required.', vAmount: 'Amount must be greater than 0.',
    offerFail: 'Task created, but sending the offer failed: ',
    override: 'Commission override (optional, USD)', overrideHint: 'Blank = use rate table; applies to this task only.',
    otherHint: '"Other" skips the 8-item checklist; commission = override → sub-rate → "Other" rate → 0.', itemNone: '— No sub-rate —',
  },
}

export default function AdminTaskNew({ amScope = null }: { amScope?: AccountManager | null }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const navigate = useNavigate()
  const base = amScope ? '/am/tasks' : '/admin/tasks'

  const [clients, setClients] = useState<AccountManager[]>([])
  const [clientId, setClientId] = useState('')
  const [pool, setPool] = useState<PoolRow[]>([])
  const [assignee, setAssignee] = useState('')
  const [params] = useSearchParams()
  const [rateItems, setRateItems] = useState<{ id: string; label: string; amount: number }[]>([])
  const [itemSel, setItemSel] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [typeSel, setTypeSel] = useState<'' | PlatformType>('')
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [criteria, setCriteria] = useState('')
  const [amount, setAmount] = useState('')
  const [override, setOverride] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (amScope) {
      setClients([amScope]); setClientId(amScope.id)
    } else {
      supabase.from('account_managers').select('*').eq('is_active', true).order('name')
        .then(({ data }) => {
          const list = (data ?? []) as AccountManager[]
          setClients(list)
          if (list.length === 1) setClientId(list[0].id)
        })
    }
    // 只有「有归属、未驳回」的 freelancer 能被派单；AM 端进一步限定自己名下
    let pq = supabase.from('freelancer_pool').select('*')
      .eq('is_suspended', false).eq('is_banned', false)
      .eq('kyc_status', 'verified').eq('is_rejected', false).not('managed_by', 'is', null)
      .order('active_tasks', { ascending: true })
    if (amScope) pq = pq.eq('managed_by', amScope.id)
    pq.then(({ data }) => {
      const list = (data ?? []) as PoolRow[]
      setPool(list)
      const fl = params.get('fl')
      if (fl && list.some(r => r.id === fl)) setAssignee(fl)
    })
  }, [amScope, params])

  useEffect(() => {
    supabase.from('custom_rate_items').select('id, label, amount')
      .eq('is_active', true).order('created_at')
      .then(({ data }) => setRateItems((data ?? []) as { id: string; label: string; amount: number }[]))
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
        rate_item_id: typeSel === 'Other' && itemSel ? itemSel : null,
        tags,
        description: desc.trim() || null,
        acceptance_criteria: criteria.trim(),
        amount: amt,
        commission_override: !amScope && override.trim() !== '' ? Number(override) : null,
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

      navigate(`${base}/${task.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  const selectCls = 'w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20'

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={base} className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        {!amScope && (
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
        )}

        <div className="mb-4"><Label>{t.taskTitle}</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>

        <div className="mb-4">
          <Label>{t.taskType}</Label>
          <select value={typeSel} onChange={e => setTypeSel(e.target.value as '' | PlatformType)} className={selectCls}>
            <option value="">{t.typeNone}</option>
            {TASK_TYPES.map(p => <option key={p} value={p}>{typeLabel(p, lang)}</option>)}
          </select>
          {typeSel === 'Other' && <p className="mt-1 text-xs text-faint">{t.otherHint}</p>}
          {typeSel === 'Other' && rateItems.length > 0 && (
            <select value={itemSel} onChange={e => setItemSel(e.target.value)}
              className="mt-2 w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20">
              <option value="">{t.itemNone}</option>
              {rateItems.map(it => (
                <option key={it.id} value={it.id}>
                  {lang === 'zh' ? `其他（${it.label}） · $${it.amount}` : `Other (${it.label}) · $${it.amount}`}
                </option>
              ))}
            </select>
          )}
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

        {!amScope && (
          <div className="mb-4">
            <Label>{t.override}</Label>
            <Input type="number" min="0" step="any" value={override} onChange={e => setOverride(e.target.value)} className="font-mono" placeholder="—" />
            <p className="mt-1 text-xs text-faint">{t.overrideHint}</p>
          </div>
        )}

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

        <Button onClick={create} disabled={busy || !clientId} className="w-full">
          {busy ? t.creating : t.create}
        </Button>
      </Card>
    </div>
  )
}
