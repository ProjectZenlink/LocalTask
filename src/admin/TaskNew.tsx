import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PP, PP_KEY } from '../lib/brand'
import { useAuth } from '../context/AuthContext'
import type { AccountManager, PoolRow } from '../types/database'
import { payoutLabel } from '../types/database'
import { safeFileName } from '../lib/format'
import { PageHeading, Card, Button, Alert, Label, Input } from '../components/ui'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '新建任务', sub: '三样就够:标题、附件、金额。其余都可日后在任务页补充。',
    client: '账户经理(负责本任务)', clientNone: '还没有账户经理。先去', clientLink: 'AM 页', clientNone2: '建一个。',
    taskTitle: '任务标题', taskType: '任务类型', typeNone: '— 不设类型 —', tags: '标签(可选,回车或逗号添加,如收款平台)', desc: '任务说明(可贴链接,freelancer 端可点击)',
    files: '附件(二维码图片、素材等,可多选)', criteria: '验收标准(必填,一行一条)',
    amount: '金额(美元;1 LT Coin = $1)', deadline: '截止时间(可选)',
    assignee: '直接派给(可选,立即开工)', assigneeNone: '先不指派',
    noWallet: '未设收款', create: '创建任务', creating: '创建中…',
    back: '← 任务列表', vClient: '请选择账户经理。', vTitle: '请填任务标题。', vCriteria: '验收标准必填。', vAmount: '金额需大于 0。',
    offerFail: '任务已创建,但派发失败:',
    override: '提成覆盖(可选,美元)', overrideHint: '留空则按费率表；仅本单生效。',
    otherHint: '「其他」不进开通清单；提成 = 单笔覆盖 → 细分 → 费率表「其他」→ 0。', itemNone: '— 不挂细分 —',
  },
  en: {
    title: 'New task', sub: 'Three things: title, attachments, amount. Everything else can come later.',
    client: 'Account manager (owns this task)', clientNone: 'No account managers yet. Create one on the', clientLink: 'AMs page', clientNone2: 'first.',
    taskTitle: 'Title', taskType: 'Task type', typeNone: '— No type —', tags: 'Tags (optional — Enter or comma to add, e.g. a payout brand)', desc: 'Description (links are clickable on the freelancer side)',
    files: 'Attachments (QR images, assets — multiple allowed)', criteria: 'Acceptance criteria (required, one per line)',
    amount: 'Amount (USD; 1 LT Coin = $1)', deadline: 'Deadline (optional)',
    assignee: 'Assign directly to (optional — starts immediately)', assigneeNone: "Don't assign yet",
    noWallet: 'no payout yet', create: 'Create task', creating: 'Creating…',
    back: '← All tasks', vClient: 'Pick an account manager.', vTitle: 'Enter a title.', vCriteria: 'Acceptance criteria are required.', vAmount: 'Amount must be greater than 0.',
    offerFail: 'Task created, but assignment failed: ',
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
  const [files, setFiles] = useState<File[]>([])
  const [amount, setAmount] = useState('')
  const [override, setOverride] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')

  // 双价(m20):选了对应类型且有指派对象时,按 TA 是否已有前置账号自动带价(可手改)


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

  async function create() {
    setError(null)
    const amt = Number(amount)
    if (!clientId) { setError(t.vClient); return }
    if (!title.trim()) { setError(t.vTitle); return }
    if (!(amt > 0)) { setError(t.vAmount); return }

    setBusy(true)
    try {
      const { data: task, error: insErr } = await supabase.from('tasks').insert({
        am_id: clientId,
        created_by: user?.id ?? null,
        title: title.trim(),
        task_type: null,
        rate_item_id: null,
        tags: [],
        description: null,
        acceptance_criteria: null,
        amount: amt,
        commission_override: !amScope && override.trim() !== '' ? Number(override) : null,
        deadline: null,
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
        const { error: asgErr } = await supabase.rpc('assign_task_direct', {
          p_task: task.id, p_freelancer: assignee,
        })
        if (asgErr) window.alert(t.offerFail + asgErr.message)
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
          <Label>{t.files}</Label>
          <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-white file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper" />
          {files.length > 0 && <p className="mt-1.5 font-mono text-xs text-verified-text">{files.map(f => f.name).join(' · ')}</p>}
        </div>


        <div className="mb-4">
          <Label>{t.amount}</Label>
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono" placeholder="30" />
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
                {p.payout_method === PP_KEY ? ` · ${PP}`
                  : p.payout_network && p.payout_token ? ` · ${payoutLabel(p.payout_network, p.payout_token)}` : ` · ${t.noWallet}`}
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
