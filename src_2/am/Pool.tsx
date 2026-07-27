import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PoolRow } from '../types/database'
import { PageHeading, Card, Alert, Button, Input, StatusBadge } from '../components/ui'
import { PromptDialog } from '../admin/bits'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

const COPY = {
  zh: {
    title: '人才库', sub: '全平台的 freelancer,信息与控制台同级。点名字看完整档案;无归属的可以认领或驳回。',
    search: '按名字/邮箱搜索…', claim: '认领', reject: '驳回', rejected: '已驳回', assign: '派任务',
    empty: '暂无数据。', rejectQ: '驳回原因(内部记录):', cancel: '取消',
    paused: '已暂停', blocked: '已封禁',
    active: '活跃', done: '完成', owner: '归属', ownerNone: '无归属', needEnh: '待 Enhanced KYC',
  },
  en: {
    title: 'Pool', sub: 'Every freelancer on the platform, console-grade detail. Click a name for the full profile; claim or reject unowned ones.',
    search: 'Search by name / email…', claim: 'Claim', reject: 'Reject', rejected: 'Rejected', assign: 'Assign task',
    empty: 'Nothing yet.', rejectQ: 'Rejection reason (internal):', cancel: 'Cancel',
    paused: 'Paused', blocked: 'Blocked',
    active: 'active', done: 'done', owner: 'Owner', ownerNone: 'Unowned', needEnh: 'Enhanced KYC pending',
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
  const amName = (id: string | null) => (id ? ams.get(id) ?? id.slice(0, 6) : t.ownerNone)
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
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      <div className="mb-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : filtered.map(r => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3.5 last:border-b-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <Link to={`/am/pool/${r.id}`} className="text-sm font-medium text-ink hover:text-petrol">
                  {r.display_name ?? r.id.slice(0, 8)}
                </Link>
                <StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} />
                {r.is_banned && <span className="font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.blocked}</span>}
                {r.is_rejected && !r.is_banned && <span className="font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.rejected}</span>}
                {r.is_suspended && !r.is_banned && <span className="font-mono text-[11px] uppercase tracking-wider text-pending-text">{t.paused}</span>}
              </div>
              {r.email && <p className="mt-1 break-all font-mono text-[11px] text-muted">{r.email}</p>}
              <p className="mt-0.5 font-mono text-xs text-faint">
                {r.active_tasks} {t.active} · {r.completed_tasks} {t.done} · {t.owner}{' '}
                <span className={r.managed_by === am?.id ? 'text-verified-text' : r.managed_by ? 'text-muted' : undefined}>
                  {amName(r.managed_by)}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {r.managed_by === null && !r.is_rejected && !r.is_banned && (
                <>
                  <Button className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => void claim(r.id)}>{t.claim}</Button>
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => setRejectId(r.id)}>{t.reject}</Button>
                </>
              )}
              {r.managed_by === am?.id && !r.is_banned && (
                r.enhanced_kyc_status === 'verified' ? (
                  <Link to={`/am/tasks/new?fl=${r.id}`}>
                    <Button variant="ghost" className="px-3 py-1.5 text-xs">{t.assign}</Button>
                  </Link>
                ) : (
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled title={t.needEnh}>{t.assign}</Button>
                )
              )}
            </div>
          </div>
        ))}
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
