import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AccountRecord } from '../types/database'
import { TASK_TYPES } from '../types/database'
import { dateShort, typeLabel } from '../lib/format'
import { PageHeading, Card, Alert, Input } from '../components/ui'
import SecretText from '../components/SecretText'
import { Th, Td } from './bits'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '账号', sub: '全库已开账号的集中视图。按平台筛选,一处看全:账号 / 密码 / 2FA / 接码手机 / 到期。',
    search: '搜索账号、手机、Freelancer…', all: '全部', platform: '平台', fl: 'Freelancer',
    login: '账号', pw: '密码', twofa: '2FA', phone: '手机 / 接码', expiry: '到期',
    empty: '没有账号资料。', sms: 'SMS', expired: '已过期', total: '条记录',
  },
  en: {
    title: 'Accounts', sub: 'Every opened account in one place. Filter by platform: login / password / 2FA / SMS phone / expiry.',
    search: 'Search login, phone, freelancer…', all: 'All', platform: 'Platform', fl: 'Freelancer',
    login: 'Login', pw: 'Password', twofa: '2FA', phone: 'Phone / SMS', expiry: 'Expires',
    empty: 'No account records.', sms: 'SMS', expired: 'Expired', total: 'records',
  },
}

interface NameRow { id: string; display_name: string | null; full_name: string | null }

function expiryTone(d: string | null): string {
  if (!d) return 'text-faint'
  const days = (new Date(d).getTime() - Date.now()) / 86400000
  if (days < 0) return 'text-danger-text'
  if (days <= 7) return 'text-pending-text'
  return 'text-muted'
}

export default function AdminAccounts() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [rows, setRows] = useState<AccountRecord[]>([])
  const [names, setNames] = useState<Map<string, NameRow>>(new Map())
  const [filter, setFilter] = useState<string>('all')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await supabase.from('account_records')
        .select('*').order('created_at', { ascending: false }).limit(800)
      if (e) { setError(e.message); setLoaded(true); return }
      const list = (data ?? []) as AccountRecord[]
      setRows(list)
      const ids = [...new Set(list.map(r => r.freelancer_id))]
      if (ids.length) {
        const { data: ps } = await supabase.from('profiles')
          .select('id, display_name, full_name').in('id', ids)
        setNames(new Map(((ps ?? []) as NameRow[]).map(x => [x.id, x])))
      }
      setLoaded(true)
    })()
  }, [])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.task_type !== filter) return false
      if (!k) return true
      const n = names.get(r.freelancer_id)
      return (r.account_login ?? '').toLowerCase().includes(k)
        || (r.phone_number ?? '').toLowerCase().includes(k)
        || (n?.display_name ?? '').toLowerCase().includes(k)
        || (n?.full_name ?? '').toLowerCase().includes(k)
    })
  }, [rows, names, filter, q])

  if (!loaded) return <p className="text-muted">…</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="w-64" />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', ...TASK_TYPES] as string[]).map(p => (
          <button key={p} onClick={() => setFilter(p)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
              filter === p ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:border-petrol/40 hover:text-ink'
            }`}>
            {p === 'all' ? t.all : typeLabel(p, lang)}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-[11px] text-faint">{filtered.length} {t.total}</span>
      </div>

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr><Th>{t.platform}</Th><Th>{t.fl}</Th><Th>{t.login}</Th><Th>{t.pw}</Th><Th>{t.twofa}</Th><Th>{t.phone}</Th><Th>{t.expiry}</Th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const n = names.get(r.freelancer_id)
                return (
                  <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                    <Td><span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{typeLabel(r.task_type, lang)}</span></Td>
                    <Td>
                      <Link to={`/admin/pool/${r.freelancer_id}`} className="text-petrol underline underline-offset-2">
                        {n?.display_name ?? n?.full_name ?? r.freelancer_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{r.account_login ?? '—'}</Td>
                    <Td>{r.account_password ? <SecretText value={r.account_password} /> : <span className="text-faint">—</span>}</Td>
                    <Td>{r.twofa ? <SecretText value={r.twofa} /> : <span className="text-faint">—</span>}</Td>
                    <Td className="font-mono text-xs">
                      {r.phone_number ?? '—'}
                      {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">{t.sms}</a></>}
                    </Td>
                    <Td className={`font-mono text-xs ${expiryTone(r.phone_expires_on)}`}>{r.phone_expires_on ? dateShort(r.phone_expires_on) : '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
