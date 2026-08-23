import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { FreelancerCompany } from '../types/database'
import { dateShort } from '../lib/format'
import { Search } from 'lucide-react'
import { PageHeading, Card, Alert } from '../components/ui'
import { Th, Td } from './bits'
import { useLang } from './i18n'
import { friendly } from '../lib/errors'

const COPY = {
  zh: {
    title: '公司', sub: '全库公司登记,可按公司名 / EIN / 州反查到 freelancer。',
     co: '公司', ein: 'EIN', state: '州', docs: '文件',
    fl: 'Freelancer', added: '登记', empty: '还没有公司登记。', notes: '备注',
  },
  en: {
    title: 'Companies', sub: 'Every company on file — reverse-search by name / EIN / state to the freelancer.',
     co: 'Company', ein: 'EIN', state: 'State', docs: 'Docs',
    fl: 'Freelancer', added: 'Added', empty: 'No companies on file yet.', notes: 'Notes',
  },
}

interface NameRow { id: string; display_name: string | null; full_name: string | null }

export default function AdminCompanies({ embedded = false }: { embedded?: boolean } = {}) {
  const { lang } = useLang()
  const base = useLocation().pathname.startsWith('/am') ? '/am/pool' : '/admin/pool'
  const t = COPY[lang]
  const [rows, setRows] = useState<FreelancerCompany[]>([])
  const [names, setNames] = useState<Map<string, NameRow>>(new Map())
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await supabase.from('freelancer_companies')
        .select('*').order('created_at', { ascending: false }).limit(500)
      if (e) { setError(friendly(e)); setLoaded(true); return }
      const list = (data ?? []) as FreelancerCompany[]
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
    if (!k) return rows
    return rows.filter(r => {
      const n = names.get(r.freelancer_id)
      return r.company_name.toLowerCase().includes(k)
        || (r.ein ?? '').toLowerCase().includes(k)
        || (r.state ?? '').toLowerCase().includes(k)
        || (r.notes ?? '').toLowerCase().includes(k)
        || (n?.display_name ?? '').toLowerCase().includes(k)
        || (n?.full_name ?? '').toLowerCase().includes(k)
    })
  }, [rows, names, q])

  if (!loaded) return <p className="text-muted">…</p>

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        {!embedded && <PageHeading sub={t.sub}>{t.title}</PageHeading>}
        <div className="relative">
          <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={lang === 'zh' ? '搜索…' : 'Search…'}
            className="w-40 rounded-full border border-hair bg-white py-1.5 pl-7 pr-3 text-xs text-ink transition placeholder:text-faint focus:w-56 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15" />
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr><Th>{t.co}</Th><Th>{t.ein}</Th><Th>{t.state}</Th><Th>{t.docs}</Th><Th>{t.fl}</Th><Th>{t.added}</Th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const n = names.get(r.freelancer_id)
                return (
                  <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                    <Td>
                      <p className="text-ink">{r.company_name}</p>
                      {r.notes && <p className="mt-0.5 max-w-xs truncate font-mono text-[11px] text-faint">{r.notes}</p>}
                    </Td>
                    <Td className="font-mono text-xs">{r.ein ?? '—'}</Td>
                    <Td className="font-mono text-xs">{r.state ?? '—'}</Td>
                    <Td className="font-mono text-xs">{r.doc_paths.length}</Td>
                    <Td>
                      <Link to={`${base}/${r.freelancer_id}`} className="text-petrol underline underline-offset-2">
                        {n?.display_name ?? n?.full_name ?? r.freelancer_id.slice(0, 8)}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs text-faint">{dateShort(r.created_at)}</Td>
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
