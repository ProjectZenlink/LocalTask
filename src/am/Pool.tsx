import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
     owned: '已归属', none: '—', claim: '认领', reject: '驳回', rejected: '已驳回', assign: '派任务', chat: '对话',
    empty: '暂无数据。', rejectQ: '驳回原因(内部记录):', cancel: '取消',
    paused: '已暂停', blocked: '已封禁',
    fAll: '全部', fDone: 'KYC 已完成', fPending: 'KYC 待审核', fNone: '未做 KYC', noMatch: '没有匹配的人。',
  },
  en: {
    title: 'Pool', sub: 'Every freelancer on the platform, console-grade detail. Click a name for the full profile; claim or reject unowned ones.',
    search: 'Search by name…', name: 'Name', email: 'Email', kyc: 'KYC', load: 'Active/Done', owner: 'Owner', act: '',
     owned: 'Owned', none: '—', claim: 'Claim', reject: 'Reject', rejected: 'Rejected', assign: 'Assign task', chat: 'Chat',
    empty: 'Nothing yet.', rejectQ: 'Rejection reason (internal):', cancel: 'Cancel',
    paused: 'Paused', blocked: 'Blocked',
    fAll: 'All', fDone: 'KYC verified', fPending: 'KYC pending', fNone: 'No KYC', noMatch: 'No one matches.',
  },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

export default function AmPool() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const navigate = useNavigate()
  const [rows, setRows] = useState<PoolRow[]>([])
  const [ams, setAms] = useState<Map<string, string>>(new Map())
  const amName = (id: string | null) => (id ? ams.get(id) ?? id.slice(0, 6) : '—')
  const [q, setQ] = useState('')
  const [kf, setKf] = useState<'all' | 'verified' | 'pending' | 'none'>('all')
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

  const searched = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return rows
    return rows.filter(r =>
      (r.display_name ?? '').toLowerCase().includes(k) ||
      (r.full_name ?? '').toLowerCase().includes(k) ||
      (r.email ?? '').toLowerCase().includes(k))
  }, [rows, q])

  // KYC 筛选片:未做 = 从未提交 + 被驳回(表格里仍保留红色标记)
  const kfMatch = (r: PoolRow, f: typeof kf) =>
    f === 'all' ? true : f === 'none' ? (r.kyc_status === 'none' || r.kyc_status === 'rejected') : r.kyc_status === f
  const counts = useMemo(() => ({
    verified: searched.filter(r => kfMatch(r, 'verified')).length,
    pending: searched.filter(r => kfMatch(r, 'pending')).length,
    none: searched.filter(r => kfMatch(r, 'none')).length,
  }), [searched])
  const filtered = useMemo(() => searched.filter(r => kfMatch(r, kf)), [searched, kf])


  // v74:池内直达对话(权限图 m51:名下+无主;他人名下不显示按钮)
  async function openChat(id: string) {
    setError(null)
    const { error: e } = await supabase.rpc('open_conversation', { p_other: id })
    if (e) { setError(e.message); return }
    // v75 ②:按偏好落小窗或整页
    const chatMode = localStorage.getItem('lt_chat_open') === 'dock' ? 'dock' : 'page'
    if (chatMode === 'dock') {
      window.dispatchEvent(new CustomEvent('lt-open-dock', { detail: { with: id } }))
      return
    }
    navigate(`/am/messages?with=${id}`)
  }

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
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="w-64" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {([['all', t.fAll, null], ['verified', t.fDone, counts.verified], ['pending', t.fPending, counts.pending], ['none', t.fNone, counts.none]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setKf(k)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${kf === k ? 'border-petrol bg-petrol text-paper' : 'border-hair bg-white text-muted hover:text-ink'}`}>
            {label}{n !== null ? ` · ${n}` : ''}
          </button>
        ))}
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{rows.length === 0 ? t.empty : t.noMatch}</p>
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
                  <Td><span className="break-all font-mono text-[11px] text-muted">{r.email ?? '—'}</span></Td>
                  <Td><StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} /></Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.active_tasks} <span className="text-faint">·</span> {r.completed_tasks}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {!r.is_banned && (r.managed_by === am?.id || (r.managed_by === null && !r.is_rejected)) && (
                        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void openChat(r.id)}>{t.chat}</Button>
                      )}
                      {r.managed_by === null && !r.is_rejected && !r.is_banned && (
                        <>
                          <Button className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => void claim(r.id)}>{t.claim}</Button>
                          <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => setRejectId(r.id)}>{t.reject}</Button>
                        </>
                      )}
                      {r.managed_by === am?.id && !r.is_banned && (
                        <Link to={`/am/tasks/new?fl=${r.id}`}>
                          <Button variant="ghost" className="px-3 py-1.5 text-xs">{t.assign}</Button>
                        </Link>
                      )}
                    </div>
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
