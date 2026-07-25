import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PoolRow } from '../types/database'
import { PageHeading, Card, Alert, Button, Input, StatusBadge } from '../components/ui'
import { Th, Td, PromptDialog } from '../admin/bits'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

const COPY = {
  zh: {
    title: '人才库', sub: '全平台的 freelancer,信息与控制台同级。点名字看完整档案;无归属的可以认领或驳回。',
    search: '按名字搜索…', name: '姓名', email: '注册邮箱', kyc: 'KYC', load: '活跃/完成', owner: '归属', act: '',
    mine: '我的', owned: '已归属', none: '—', claim: '认领', reject: '驳回', rejected: '已驳回', assign: '派任务',
    empty: '暂无数据。', rejectQ: '驳回原因(内部记录):', cancel: '取消',
    paused: '已暂停', blocked: '已封禁',
  },
  en: {
    title: 'Pool', sub: 'Every freelancer on the platform, console-grade detail. Click a name for the full profile; claim or reject unowned ones.',
    search: 'Search by name…', name: 'Name', email: 'Email', kyc: 'KYC', load: 'Active/Done', owner: 'Owner', act: '',
    mine: 'Mine', owned: 'Owned', none: '—', claim: 'Claim', reject: 'Reject', rejected: 'Rejected', assign: 'Assign task',
    empty: 'Nothing yet.', rejectQ: 'Rejection reason (internal):', cancel: 'Cancel',
    paused: 'Paused', blocked: 'Blocked',
  },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

export default function AmPool() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<PoolRow[]>([])
  const [ams, setAms] = useState<Map<string, string>>(new Map())
  const amName = (id: string | null) => (id ? ams.get(id) ?? id.slice(0, 6) : '—')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('freelancer_pool')
      .select('*').order('created_at', { ascending: false }).limit(300)
    if (e) { setError(e.message); return }
    setRows((data ?? []) as PoolRow[])
  }, [])

  useEffect(() => {
    supabase.from('account_managers').select('id, name')
      .then(({ data }) => setAms(new Map(((data ?? []) as { id: string; name: string }[]).map(a => [a.id, a.name]))))
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return rows
    return rows.filter(r =>
      (r.display_name ?? '').toLowerCase().includes(k) ||
      (r.full_name ?? '').toLowerCase().includes(k) ||
      (r.email ?? '').toLowerCase().includes(k))
  }, [rows, q])

  async function claim(id: string) {
    setError(null); setBusy(id)
    const { error: e } = await supabase.rpc('claim_freelancer', { p_freelancer: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    await load()
  }

  async function doReject(reason: string) {
    const id = rejectId; setRejectId(null)
    if (!id) return
    setError(null); setBusy(id)
    const { error: e } = await supabase.rpc('am_reject_freelancer', { p_freelancer: id, p_reason: reason })
    setBusy(null)
    if (e) { setError(e.message); return }
    await load()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="w-64" />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr>
                <Th>{t.owner}</Th><Th>{t.name}</Th><Th>{t.email}</Th><Th>{t.kyc}</Th>
                <Th>{t.load}</Th><Th>{t.act}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                  <Td className="font-mono text-xs">
                    {r.managed_by === am?.id ? <span className="text-verified-text">{amName(r.managed_by)}</span>
                      : r.managed_by ? <span className="text-muted">{amName(r.managed_by)}</span> : <span className="text-faint">{t.none}</span>}
                  </Td>
                  <Td>
                    <Link to={`/am/pool/${r.id}`} className="text-ink hover:text-petrol">
                      {r.display_name ?? r.id.slice(0, 8)}
                    </Link>
                    {r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.blocked}</span>}
                    {r.is_rejected && !r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.rejected}</span>}
                    {r.is_suspended && !r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-pending-text">{t.paused}</span>}
                  </Td>
                  <Td><StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} /></Td>
                  <Td className="font-mono text-xs">{r.active_tasks} / {r.completed_tasks}</Td>
                  <Td>
                    {r.managed_by === null && !r.is_rejected && !r.is_banned && (
                      <div className="flex gap-2">
                        <Button className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => void claim(r.id)}>{t.claim}</Button>
                        <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => setRejectId(r.id)}>{t.reject}</Button>
                      </div>
                    )}
                    {r.managed_by === am?.id && !r.is_banned && (
                      <Link to={`/am/tasks/new?fl=${r.id}`}>
                        <Button variant="ghost" className="px-3 py-1.5 text-xs">{t.assign}</Button>
                      </Link>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <PromptDialog
        open={rejectId !== null}
        title={t.reject}
        hint={t.rejectQ}
        confirmLabel={t.reject}
        cancelLabel={t.cancel}
        danger
        onConfirm={reason => void doReject(reason)}
        onClose={() => setRejectId(null)}
      />
    </div>
  )
}
