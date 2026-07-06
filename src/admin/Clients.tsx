import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Client } from '../types/database'
import { dateShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field, StatusBadge } from '../components/ui'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '客户管理', sub: 'AM 线下签的企业客户都登记在这里。客户没有账号,对 freelancer 完全隐藏。',
    add: '＋ 新建客户', company: '公司名称(必填)', contact: '联系人', info: '联系方式(微信 / 邮箱 / WhatsApp)',
    wallet: '常用付款钱包(可选备注)', notes: '备注', save: '保存', saving: '保存中…', cancelEdit: '取消',
    edit: '编辑', blacklist: '拉黑', unblacklist: '恢复', blacklisted: '已拉黑', normal: '正常',
    blkQ: '拉黑原因(approve 后赖账等):', empty: '还没有客户。', joined: '录入',
    vCompany: '公司名称必填。',
  },
  en: {
    title: 'Clients', sub: 'Companies signed offline by AMs. Clients have no accounts and are hidden from freelancers.',
    add: '＋ New client', company: 'Company name (required)', contact: 'Contact person', info: 'Contact info (WeChat / email / WhatsApp)',
    wallet: 'Usual payment wallet (optional note)', notes: 'Notes', save: 'Save', saving: 'Saving…', cancelEdit: 'Cancel',
    edit: 'Edit', blacklist: 'Blacklist', unblacklist: 'Restore', blacklisted: 'Blacklisted', normal: 'Active',
    blkQ: 'Blacklist reason (e.g. refused to pay after approval):', empty: 'No clients yet.', joined: 'Added',
    vCompany: 'Company name is required.',
  },
}

const EMPTY = { company_name: '', contact_name: '', contact_info: '', payment_wallet: '', notes: '' }

export default function AdminClients() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [rows, setRows] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    if (e) { setError(e.message); return }
    setRows((data ?? []) as Client[])
  }, [])

  useEffect(() => { void load() }, [load])

  function startEdit(c: Client | null) {
    setError(null)
    if (!c) { setEditing('new'); setForm(EMPTY); return }
    setEditing(c.id)
    setForm({
      company_name: c.company_name,
      contact_name: c.contact_name ?? '',
      contact_info: c.contact_info ?? '',
      payment_wallet: c.payment_wallet ?? '',
      notes: c.notes ?? '',
    })
  }

  async function save() {
    if (!form.company_name.trim()) { setError(t.vCompany); return }
    setBusy(true); setError(null)
    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_info: form.contact_info.trim() || null,
      payment_wallet: form.payment_wallet.trim() || null,
      notes: form.notes.trim() || null,
    }
    const res = editing === 'new'
      ? await supabase.from('clients').insert({ ...payload, created_by: user?.id ?? null })
      : await supabase.from('clients').update(payload).eq('id', editing!)
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    setEditing(null); setForm(EMPTY)
    await load()
  }

  async function toggleBlacklist(c: Client) {
    setError(null)
    let reason: string | null = null
    if (!c.is_blacklisted) {
      reason = window.prompt(t.blkQ)
      if (!reason?.trim()) return
    }
    const { error: e } = await supabase.from('clients')
      .update({ is_blacklisted: !c.is_blacklisted, blacklist_reason: reason?.trim() ?? null })
      .eq('id', c.id)
    if (e) { setError(e.message); return }
    await load()
  }

  const formCard = (
    <Card className="mb-5 p-5">
      <Field label={t.company} value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
      <Field label={t.contact} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
      <Field label={t.info} value={form.contact_info} onChange={e => setForm({ ...form, contact_info: e.target.value })} />
      <Field label={t.wallet} value={form.payment_wallet} onChange={e => setForm({ ...form, payment_wallet: e.target.value })} />
      <Field label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? t.saving : t.save}</Button>
        <Button variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY) }}>{t.cancelEdit}</Button>
      </div>
    </Card>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Button onClick={() => startEdit(null)}>{t.add}</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {editing === 'new' && formCard}

      <Card className="p-5">
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-faint">{t.empty}</p>
        ) : rows.map(c => (
          <div key={c.id} className="border-b border-hair py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.company_name}</p>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {[c.contact_name, c.contact_info].filter(Boolean).join(' · ') || '—'} · {t.joined} {dateShort(c.created_at)}
                </p>
                {c.is_blacklisted && c.blacklist_reason && <p className="mt-0.5 text-xs text-danger-text">{c.blacklist_reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={c.is_blacklisted ? 'unverified' : 'verified'} label={c.is_blacklisted ? t.blacklisted : t.normal} />
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => startEdit(c)}>{t.edit}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => toggleBlacklist(c)}>
                  {c.is_blacklisted ? t.unblacklist : t.blacklist}
                </Button>
              </div>
            </div>
            {editing === c.id && <div className="mt-3">{formCard}</div>}
          </div>
        ))}
      </Card>
    </div>
  )
}
