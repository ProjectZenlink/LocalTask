import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager } from '../types/database'
import { dateShort, waLink, tgLink } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field, StatusBadge } from '../components/ui'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '账户经理', sub: '客户在站外由 AM 自己维护(WhatsApp),站内只登记 AM 本人。任务挂在 AM 名下,freelancer 在任务页能看到派单 AM 的联系方式。',
    add: '＋ 新建 AM', name: '名字(必填)', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名',
    save: '保存', saving: '保存中…', cancelEdit: '取消',
    edit: '编辑', deactivate: '停用', activate: '启用', active: '在职', inactive: '已停用',
    empty: '还没有账户经理。', joined: '录入', vName: '名字必填。',
    deactivateHint: '停用后不再出现在建任务下拉里;历史任务不受影响。',
  },
  en: {
    title: 'Account managers', sub: 'Clients live off-platform (WhatsApp) with their AM. Here you only register AMs. Tasks belong to an AM, and freelancers can see their AM\u2019s contact on the task page.',
    add: '＋ New AM', name: 'Name (required)', wa: 'WhatsApp (with country code)', tg: 'Telegram username',
    save: 'Save', saving: 'Saving…', cancelEdit: 'Cancel',
    edit: 'Edit', deactivate: 'Deactivate', activate: 'Activate', active: 'Active', inactive: 'Inactive',
    empty: 'No account managers yet.', joined: 'Added', vName: 'Name is required.',
    deactivateHint: 'Deactivated AMs disappear from the new-task dropdown; existing tasks are unaffected.',
  },
}

const EMPTY = { name: '', whatsapp: '', telegram: '' }

export default function AdminAms() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [rows, setRows] = useState<AccountManager[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('account_managers').select('*').order('created_at', { ascending: false })
    if (e) { setError(e.message); return }
    setRows((data ?? []) as AccountManager[])
  }, [])

  useEffect(() => { void load() }, [load])

  function startEdit(a: AccountManager | null) {
    setError(null)
    if (!a) { setEditing('new'); setForm(EMPTY); return }
    setEditing(a.id)
    setForm({ name: a.name, whatsapp: a.whatsapp ?? '', telegram: a.telegram ?? '' })
  }

  async function save() {
    if (!form.name.trim()) { setError(t.vName); return }
    setBusy(true); setError(null)
    const payload = {
      name: form.name.trim(),
      whatsapp: form.whatsapp.trim() || null,
      telegram: form.telegram.trim() || null,
    }
    const res = editing === 'new'
      ? await supabase.from('account_managers').insert({ ...payload, created_by: user?.id ?? null })
      : await supabase.from('account_managers').update(payload).eq('id', editing!)
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    setEditing(null); setForm(EMPTY)
    await load()
  }

  async function toggleActive(a: AccountManager) {
    setError(null)
    const { error: e } = await supabase.from('account_managers')
      .update({ is_active: !a.is_active }).eq('id', a.id)
    if (e) { setError(e.message); return }
    await load()
  }

  const formCard = (
    <Card className="mb-5 p-5">
      <Field label={t.name} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <Field label={t.wa} value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+1 555 000 0000" />
      <Field label={t.tg} value={form.telegram} onChange={e => setForm({ ...form, telegram: e.target.value })} placeholder="@username" />
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
        ) : rows.map(a => (
          <div key={a.id} className="border-b border-hair py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {a.whatsapp && <a className="text-petrol underline underline-offset-2" href={waLink(a.whatsapp)} target="_blank" rel="noreferrer">WA {a.whatsapp}</a>}
                  {a.whatsapp && a.telegram && ' · '}
                  {a.telegram && <a className="text-petrol underline underline-offset-2" href={tgLink(a.telegram)} target="_blank" rel="noreferrer">TG {a.telegram}</a>}
                  {(a.whatsapp || a.telegram) && ' · '}
                  {t.joined} {dateShort(a.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.is_active ? 'verified' : 'unverified'} label={a.is_active ? t.active : t.inactive} />
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => startEdit(a)}>{t.edit}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => toggleActive(a)}>
                  {a.is_active ? t.deactivate : t.activate}
                </Button>
              </div>
            </div>
            {editing === a.id && <div className="mt-3">{formCard}</div>}
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-faint">{t.deactivateHint}</p>
    </div>
  )
}
