import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { WALLET_OPTIONS, type Client } from '../types/database'
import { safeFileName } from '../lib/format'
import { PageHeading, Card, Button, Alert, Label, Input, Textarea } from '../components/ui'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '新建任务', sub: '客户和验收标准是必填 —— 验收标准是之后审核和裁决的唯一依据。',
    client: '客户', clientNone: '还没有客户。先去', clientLink: '客户页', clientNone2: '建一个。',
    taskTitle: '任务标题', desc: '任务说明(可贴链接,freelancer 端可点击)',
    files: '附件(二维码图片、素材等,可多选)', criteria: '验收标准(必填,一行一条)',
    amount: '金额', combo: '付款组合(客户用什么付)', deadline: '截止时间(可选)',
    create: '创建任务', creating: '创建中…',
    vClient: '请选择客户。', vTitle: '请填任务标题。', vCriteria: '验收标准必填。', vAmount: '金额需大于 0。',
    comboHint: '发 Offer 时只会显示钱包组合与此一致的 freelancer。',
  },
  en: {
    title: 'New task', sub: 'Client and acceptance criteria are required — the criteria are the only basis for review and disputes.',
    client: 'Client', clientNone: 'No clients yet. Create one on the', clientLink: 'Clients page', clientNone2: 'first.',
    taskTitle: 'Title', desc: 'Description (links are clickable on the freelancer side)',
    files: 'Attachments (QR images, assets — multiple allowed)', criteria: 'Acceptance criteria (required, one per line)',
    amount: 'Amount', combo: 'Payment combo (what the client pays with)', deadline: 'Deadline (optional)',
    create: 'Create task', creating: 'Creating…',
    vClient: 'Pick a client.', vTitle: 'Enter a title.', vCriteria: 'Acceptance criteria are required.', vAmount: 'Amount must be greater than 0.',
    comboHint: 'When sending offers, only freelancers whose wallet matches this combo will show.',
  },
}

export default function AdminTaskNew() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [criteria, setCriteria] = useState('')
  const [amount, setAmount] = useState('')
  const [comboKey, setComboKey] = useState(WALLET_OPTIONS[0].key)
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('*').eq('is_blacklisted', false).order('company_name')
      .then(({ data }) => setClients((data ?? []) as Client[]))
  }, [])

  async function create() {
    setError(null)
    const amt = Number(amount)
    if (!clientId) { setError(t.vClient); return }
    if (!title.trim()) { setError(t.vTitle); return }
    if (!criteria.trim()) { setError(t.vCriteria); return }
    if (!(amt > 0)) { setError(t.vAmount); return }
    const combo = WALLET_OPTIONS.find(o => o.key === comboKey)!

    setBusy(true)
    try {
      const { data: task, error: insErr } = await supabase.from('tasks').insert({
        client_id: clientId,
        created_by: user?.id ?? null,
        title: title.trim(),
        description: desc.trim() || null,
        acceptance_criteria: criteria.trim(),
        amount: amt,
        payout_network: combo.network,
        payout_token: combo.token,
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

      navigate(`/admin/tasks/${task.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        <div className="mb-4">
          <Label>{t.client}</Label>
          {clients.length === 0 ? (
            <p className="text-sm text-muted">
              {t.clientNone} <Link to="/admin/clients" className="text-petrol underline underline-offset-2">{t.clientLink}</Link> {t.clientNone2}
            </p>
          ) : (
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
            >
              <option value="">—</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          )}
        </div>

        <div className="mb-4"><Label>{t.taskTitle}</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
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
            <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label>{t.deadline}</Label>
            <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="mb-5">
          <Label>{t.combo}</Label>
          <div className="flex flex-col gap-2">
            {WALLET_OPTIONS.map(o => (
              <label key={o.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${comboKey === o.key ? 'border-petrol bg-petrol/5 text-ink' : 'border-hair text-muted'}`}>
                <input type="radio" name="combo" checked={comboKey === o.key} onChange={() => setComboKey(o.key)} className="accent-[#244B4D]" />
                {o.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-faint">{t.comboHint}</p>
        </div>

        <Button onClick={create} disabled={busy || clients.length === 0} className="w-full">
          {busy ? t.creating : t.create}
        </Button>
      </Card>
    </div>
  )
}
