import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PoolRow } from '../types/database'
import { payoutLabel } from '../types/database'
import { PageHeading, Card, Alert, Button, Input, StatusBadge } from '../components/ui'
import { Th, Td, waLink, tgLink } from './bits'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '人才池', sub: '所有 freelancer 的状态、负载、评分与可靠性记录。评分对 freelancer 永久不可见。',
    search: '按名字搜索…', name: '姓名', kyc: 'KYC', open: '接单', combo: '收款组合',
    active: '活跃', done: '完成', qsa: '质/速/态', strikes: 'Strikes', contact: '联系',
    on: '开', off: '关', pause: '暂停', resume: '恢复', block: '封禁', unblock: '解封',
    paused: '已暂停', blocked: '已封禁', pauseHint: '暂停 = 不再收到 offer(可恢复);封禁 = 永久,仅用于欺诈。',
    empty: '还没有 freelancer 注册。', blockQ: '确认封禁?封禁是给欺诈用的,可靠性问题请用「暂停」。',
  },
  en: {
    title: 'Pool', sub: 'Every freelancer: status, load, ratings, reliability. Ratings are never visible to freelancers.',
    search: 'Search by name…', name: 'Name', kyc: 'KYC', open: 'Open', combo: 'Payout combo',
    active: 'Active', done: 'Done', qsa: 'Q/S/A', strikes: 'Strikes', contact: 'Contact',
    on: 'On', off: 'Off', pause: 'Pause', resume: 'Resume', block: 'Block', unblock: 'Unblock',
    paused: 'Paused', blocked: 'Blocked', pauseHint: 'Pause = no new offers (reversible); Block = permanent, fraud only.',
    empty: 'No freelancers yet.', blockQ: 'Block permanently? Blocking is for fraud — use Pause for reliability issues.',
  },
}

const KYC_BADGE: Record<string, { s: 'verified' | 'pending' | 'unverified' }> = {
  verified: { s: 'verified' }, pending: { s: 'pending' }, rejected: { s: 'unverified' }, none: { s: 'unverified' },
}

export default function AdminPool() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [rows, setRows] = useState<PoolRow[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('freelancer_pool').select('*').order('created_at', { ascending: false })
    if (e) { setError(e.message); return }
    setRows((data ?? []) as PoolRow[])
  }, [])

  useEffect(() => { void load() }, [load])

  async function setFlags(id: string, patch: { is_suspended?: boolean; is_banned?: boolean }) {
    setError(null)
    const { error: e } = await supabase.from('profiles').update(patch).eq('id', id)
    if (e) { setError(e.message); return }
    await load()
  }

  const filtered = rows.filter(r => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return (r.display_name ?? '').toLowerCase().includes(s) || (r.full_name ?? '').toLowerCase().includes(s)
  })

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="w-64"><Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="py-1.5 text-sm" /></div>
        <p className="text-xs text-faint">{t.pauseHint}</p>
      </div>

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr>
                <Th>{t.name}</Th><Th>{t.kyc}</Th><Th>{t.open}</Th><Th>{t.combo}</Th>
                <Th>{t.active}</Th><Th>{t.done}</Th><Th>{t.qsa}</Th><Th>{t.strikes}</Th><Th>{t.contact}</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                  <Td>
                    <span className="text-ink">{r.display_name ?? r.id.slice(0, 8)}</span>
                    {r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.blocked}</span>}
                    {r.is_suspended && !r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-pending-text">{t.paused}</span>}
                  </Td>
                  <Td><StatusBadge status={KYC_BADGE[r.kyc_status].s} label={r.kyc_status} /></Td>
                  <Td className="font-mono text-xs">{r.open_to_work ? t.on : t.off}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.payout_network && r.payout_token ? payoutLabel(r.payout_network, r.payout_token) : '—'}</Td>
                  <Td className="font-mono text-xs">{r.active_tasks}</Td>
                  <Td className="font-mono text-xs">{r.completed_tasks}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.avg_quality ?? '–'} / {r.avg_speed ?? '–'} / {r.avg_attitude ?? '–'}</Td>
                  <Td className="font-mono text-xs">{r.strikes_count}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    {r.contact_whatsapp && <a className="text-petrol underline underline-offset-2" href={waLink(r.contact_whatsapp)} target="_blank" rel="noreferrer">WA</a>}
                    {r.contact_whatsapp && r.contact_telegram && ' · '}
                    {r.contact_telegram && <a className="text-petrol underline underline-offset-2" href={tgLink(r.contact_telegram)} target="_blank" rel="noreferrer">TG</a>}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setFlags(r.id, { is_suspended: !r.is_suspended })}>
                        {r.is_suspended ? t.resume : t.pause}
                      </Button>
                      <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => {
                        if (!r.is_banned && !window.confirm(t.blockQ)) return
                        void setFlags(r.id, { is_banned: !r.is_banned })
                      }}>
                        {r.is_banned ? t.unblock : t.block}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
