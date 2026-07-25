import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AccountRecord } from '../types/database'
import { TASK_TYPES } from '../types/database'
import { dateShort, typeLabel } from '../lib/format'
import { Search } from 'lucide-react'
import { PageHeading, Card, Alert } from '../components/ui'
import SecretText from '../components/SecretText'
import TotpCode from '../components/TotpCode'
import { Th, Td } from './bits'
import { PromptDialog } from '../components/dialogs'
import { useLang } from './i18n'

const REC_STATUS: Record<string, { s: 'verified' | 'pending' | 'unverified'; zh: string; en: string }> = {
  pending: { s: 'pending', zh: '待审核', en: 'Pending' },
  active: { s: 'verified', zh: '正常', en: 'Active' },
  review: { s: 'pending', zh: '审核中', en: 'In review' },
  closed: { s: 'unverified', zh: '已关闭', en: 'Closed' },
}

const COPY = {
  zh: {
    title: '账号', sub: '全库已开账号的集中视图。按平台筛选,一处看全:账号 / 密码 / 2FA / 接码手机 / 到期。',
    search: '搜索账号、手机、Freelancer…', all: '全部', platform: '平台', fl: 'Freelancer',
    login: '账号', pw: '密码', twofa: '2FA', phone: '手机 / 接码', expiry: '到期',
    empty: '没有账号资料。', sms: 'SMS', expired: '已过期', total: '条记录', status: '状态', stAll: '全部状态',
    flag: '跳审核', flagQ: '跳审核原因(会同步打回对应验收,归属 AM 铃铛可见):', dlgCancel: '取消',
  },
  en: {
    title: 'Accounts', sub: 'Every opened account in one place. Filter by platform: login / password / 2FA / SMS phone / expiry.',
    search: 'Search login, phone, freelancer…', all: 'All', platform: 'Platform', fl: 'Freelancer',
    login: 'Login', pw: 'Password', twofa: '2FA', phone: 'Phone / SMS', expiry: 'Expires',
    empty: 'No account records.', sms: 'SMS', expired: 'Expired', total: 'records', status: 'Status', stAll: 'All statuses',
    flag: 'Flag', flagQ: 'Flag reason (reopens the matching acceptance; the AM sees it in their bell):', dlgCancel: 'Cancel',
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
  const base = useLocation().pathname.startsWith('/am') ? '/am/pool' : '/admin/pool'
  const [rows, setRows] = useState<AccountRecord[]>([])
  const [names, setNames] = useState<Map<string, NameRow>>(new Map())
  const [filter, setFilter] = useState<string>('all')
  const [stFilter, setStFilter] = useState<string>('all')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [flagFor, setFlagFor] = useState<AccountRecord | null>(null)

  const reload = async () => {
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
  }
  useEffect(() => { void reload() // eslint-disable-line react-hooks/exhaustive-deps
  }, [])

  async function doFlag(reason: string) {
    const r = flagFor; setFlagFor(null)
    if (!r) return
    setError(null)
    const { error: e } = await supabase.rpc('flag_account_review', { p_record: r.id, p_reason: reason })
    if (e) { setError(e.message); return }
    await reload()
  }

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.task_type !== filter) return false
      if (stFilter !== 'all' && (r.status ?? 'active') !== stFilter) return false
      if (!k) return true
      const n = names.get(r.freelancer_id)
      return (r.account_login ?? '').toLowerCase().includes(k)
        || (r.phone_number ?? '').toLowerCase().includes(k)
        || (n?.display_name ?? '').toLowerCase().includes(k)
        || (n?.full_name ?? '').toLowerCase().includes(k)
    })
  }, [rows, names, filter, stFilter, q])

  if (!loaded) return <p className="text-muted">…</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <div className="relative">
          <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={lang === 'zh' ? '搜索…' : 'Search…'}
            className="w-40 rounded-full border border-hair bg-white py-1.5 pl-7 pr-3 text-xs text-ink transition placeholder:text-faint focus:w-56 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15" />
        </div>
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
        <select value={stFilter} onChange={e => setStFilter(e.target.value)}
          className="ml-auto self-center rounded-full border border-hair bg-white px-2.5 py-1 font-mono text-[11px] text-muted focus:border-petrol focus:outline-none">
          <option value="all">{t.stAll}</option>
          {Object.entries(REC_STATUS).map(([k, v]) => <option key={k} value={k}>{lang === 'zh' ? v.zh : v.en}</option>)}
        </select>
        <span className="self-center font-mono text-[11px] text-faint">{filtered.length} {t.total}</span>
      </div>

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr><Th>{t.platform}</Th><Th>{t.status}</Th><Th>{t.fl}</Th><Th>{t.login}</Th><Th>{t.pw}</Th><Th>{t.twofa}</Th><Th>{t.phone}</Th><Th>{t.expiry}</Th><Th> </Th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const n = names.get(r.freelancer_id)
                return (
                  <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                    <Td><span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{typeLabel(r.task_type, lang)}</span></Td>
                    <Td>{(() => { const m = REC_STATUS[r.status ?? 'active']; return <span className={`font-mono text-[11px] uppercase tracking-wider ${m.s === 'verified' ? 'text-verified-text' : m.s === 'pending' ? 'text-pending-text' : 'text-danger-text'}`}>{lang === 'zh' ? m.zh : m.en}</span> })()}</Td>
                    <Td>
                      <Link to={`${base}/${r.freelancer_id}`} className="text-petrol underline underline-offset-2">
                        {n?.display_name ?? n?.full_name ?? r.freelancer_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{r.account_login ?? '—'}</Td>
                    <Td>{r.account_password ? <SecretText value={r.account_password} /> : <span className="text-faint">—</span>}</Td>
                    <Td>{r.twofa ? <span className="flex flex-col gap-1"><SecretText value={r.twofa} /><TotpCode secret={r.twofa} /></span> : <span className="text-faint">—</span>}</Td>
                    <Td className="font-mono text-xs">
                      {r.phone_number ?? '—'}
                      {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">{t.sms}</a></>}
                    </Td>
                    <Td className={`font-mono text-xs ${expiryTone(r.phone_expires_on)}`}>{r.phone_expires_on ? dateShort(r.phone_expires_on) : '—'}</Td>
                    <Td>
                      {(r.status ?? 'active') !== 'closed' && (
                        <button onClick={() => setFlagFor(r)}
                          className="rounded-full border border-hair px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:border-danger-text/40 hover:text-danger-text">
                          {t.flag}
                        </button>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
      <PromptDialog
        open={flagFor !== null}
        title={t.flag}
        hint={t.flagQ}
        confirmLabel={t.flag}
        cancelLabel={t.dlgCancel}
        danger
        onConfirm={reason => void doFlag(reason)}
        onClose={() => setFlagFor(null)}
      />
    </div>
  )
}
