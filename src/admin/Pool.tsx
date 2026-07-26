import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PoolRow } from '../types/database'
import { payoutLabel } from '../types/database'
import { PageHeading, Card, Alert, Button, Input, StatusBadge, Label } from '../components/ui'
import { usd } from '../lib/format'
import { Th, Td, waLink, tgLink, ConfirmDialog, DialogShell } from './bits'
import { xLink } from '../lib/format'
import { useLang } from './i18n'

const COPY = {
  zh: {
    title: '人才库', sub: '所有 freelancer 的状态、负载、评分与可靠性记录。',
    search: '按名字搜索…', name: '姓名', email: '注册邮箱', kyc: 'KYC', combo: '收款组合',
    active: '活跃', done: '完成', qsa: '质/速/态', strikes: 'Strikes', contact: '联系',
    assign: '派任务', assignTitle: '派任务给', pickTask: '选择任务(未指派)', noTasks: '没有未指派的任务。先去「任务」页新建。', send: '直接派任务', sent: '已派:', pause: '暂停', resume: '恢复', block: '封禁', unblock: '解封',
    paused: '已暂停', blocked: '已封禁', rejected: '已驳回', pauseHint: '暂停 = 不再收到 offer(可恢复);封禁 = 永久,仅用于欺诈。',
    empty: '还没有 freelancer 注册。', blockQ: '封禁是给欺诈用的,可靠性问题请用「暂停」。确认永久封禁?', dlgCancel: '取消', confirmBlock: '确认封禁',
  },
  en: {
    title: 'Pool', sub: 'Every freelancer: status, load, ratings, reliability.',
    search: 'Search by name…', name: 'Name', email: 'Email', kyc: 'KYC', combo: 'Payout combo',
    active: 'Active', done: 'Done', qsa: 'Q/S/A', strikes: 'Strikes', contact: 'Contact',
    assign: 'Assign', assignTitle: 'Assign task to', pickTask: 'Pick a task (unassigned)', noTasks: 'No unassigned tasks. Create one on the Tasks page.', send: 'Assign now', sent: 'Assigned:', pause: 'Pause', resume: 'Resume', block: 'Block', unblock: 'Unblock',
    paused: 'Paused', blocked: 'Blocked', rejected: 'Rejected', pauseHint: 'Pause = no new offers (reversible); Block = permanent, fraud only.',
    empty: 'No freelancers yet.', blockQ: 'Blocking is for fraud — use Pause for reliability issues. Block permanently?', dlgCancel: 'Cancel', confirmBlock: 'Block',
  },
}

const KYC_BADGE: Record<string, { s: 'verified' | 'pending' | 'unverified' }> = {
  verified: { s: 'verified' }, pending: { s: 'pending' }, rejected: { s: 'unverified' }, none: { s: 'unverified' },
}

export default function AdminPool() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [rows, setRows] = useState<PoolRow[]>([])
  const [ams, setAms] = useState<Map<string, string>>(new Map())
  const amName = (id: string | null) => (id ? ams.get(id) ?? id.slice(0, 6) : '—')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blocking, setBlocking] = useState<PoolRow | null>(null)
  const [assignFor, setAssignFor] = useState<PoolRow | null>(null)
  const [unTasks, setUnTasks] = useState<{ id: string; title: string; amount: number }[]>([])
  const [pickId, setPickId] = useState('')
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState<string | null>(null)

  async function openAssign(r: PoolRow) {
    setAssignFor(r); setPickId(''); setError(null)
    const { data } = await supabase.from('tasks').select('id, title, amount')
      .eq('status', 'unassigned').order('created_at', { ascending: false })
    setUnTasks((data ?? []) as { id: string; title: string; amount: number }[])
  }

  async function sendOffer() {
    if (!assignFor || !pickId) return
    setSending(true); setError(null)
    const { error: e } = await supabase.rpc('assign_task_direct', {
      p_task: pickId, p_freelancer: assignFor.id,
    })
    setSending(false)
    if (e) { setError(e.message); return }
    const tk = unTasks.find(x => x.id === pickId)
    setSentMsg(`${t.sent} ${tk?.title ?? ''}`)
    setAssignFor(null); load()
  }

  useEffect(() => {
    supabase.from('account_managers').select('id, name')
      .then(({ data }) => setAms(new Map(((data ?? []) as { id: string; name: string }[]).map(a => [a.id, a.name]))))
  }, [])

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
    return (r.display_name ?? '').toLowerCase().includes(s) || (r.full_name ?? '').toLowerCase().includes(s) || (r.email ?? '').toLowerCase().includes(s)
  })

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      {sentMsg && <Alert tone="success">{sentMsg}</Alert>}
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
                <Th>AM</Th><Th>{t.name}</Th><Th>{t.email}</Th><Th>{t.kyc}</Th><Th>{t.combo}</Th>
                <Th>{t.active}</Th><Th>{t.done}</Th><Th>{t.qsa}</Th><Th>{t.strikes}</Th><Th>{t.contact}</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                  <Td className="font-mono text-xs text-muted">{amName(r.managed_by)}</Td>
                  <Td>
                    <Link to={`/admin/pool/${r.id}`} className="text-ink transition hover:text-petrol">{r.display_name ?? r.id.slice(0, 8)}</Link>
                    {r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.blocked}</span>}
                    {r.is_rejected && !r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.rejected}</span>}
                    {r.is_suspended && !r.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-pending-text">{t.paused}</span>}
                  </Td>
                  <Td><span className="break-all font-mono text-[11px] text-muted">{r.email ?? '—'}</span></Td>
                  <Td><StatusBadge status={KYC_BADGE[r.kyc_status].s} label={r.kyc_status} /></Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.payout_network && r.payout_token ? payoutLabel(r.payout_network, r.payout_token) : '—'}</Td>
                  <Td className="font-mono text-xs">{r.active_tasks}</Td>
                  <Td className="font-mono text-xs">{r.completed_tasks}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.avg_quality ?? '–'} / {r.avg_speed ?? '–'} / {r.avg_attitude ?? '–'}</Td>
                  <Td className="font-mono text-xs">{r.strikes_count}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    {r.contact_whatsapp && <a className="text-petrol underline underline-offset-2" href={waLink(r.contact_whatsapp)} target="_blank" rel="noreferrer">WA</a>}
                    {r.contact_whatsapp && r.contact_telegram && ' · '}
                    {r.contact_telegram && <a className="text-petrol underline underline-offset-2" href={tgLink(r.contact_telegram)} target="_blank" rel="noreferrer">TG</a>}
                    {(r.contact_whatsapp || r.contact_telegram) && r.contact_x && ' · '}
                    {r.contact_x && <a className="text-petrol underline underline-offset-2" href={xLink(r.contact_x)} target="_blank" rel="noreferrer">X</a>}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        className="px-2.5 py-1 text-xs"
                        disabled={r.kyc_status !== 'verified' || r.is_suspended || r.is_banned || r.is_rejected || !r.managed_by}
                        onClick={() => void openAssign(r)}
                      >
                        {t.assign}
                      </Button>
                      <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => setFlags(r.id, { is_suspended: !r.is_suspended })}>
                        {r.is_suspended ? t.resume : t.pause}
                      </Button>
                      <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => {
                        if (r.is_banned) { void setFlags(r.id, { is_banned: false }); return }
                        setBlocking(r)
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
      {assignFor && (
        <DialogShell onClose={() => setAssignFor(null)}>
          <p className="font-display text-base font-medium tracking-tight text-ink">
            {t.assignTitle} {assignFor.display_name ?? assignFor.id.slice(0, 8)}
          </p>
          <div className="mt-3">
            <Label>{t.pickTask}</Label>
            {unTasks.length === 0 ? (
              <p className="text-sm text-faint">{t.noTasks}</p>
            ) : (
              <select value={pickId} onChange={e => setPickId(e.target.value)}
                className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20">
                <option value="">—</option>
                {unTasks.map(x => <option key={x.id} value={x.id}>{x.title} · {usd(x.amount)}</option>)}
              </select>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_7rem] gap-3">
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignFor(null)}>{t.dlgCancel}</Button>
            <Button disabled={!pickId || sending} onClick={sendOffer}>{sending ? '…' : t.send}</Button>
          </div>
        </DialogShell>
      )}

      <ConfirmDialog
        open={blocking !== null}
        title={t.block}
        hint={t.blockQ}
        confirmLabel={t.confirmBlock}
        cancelLabel={t.dlgCancel}
        onConfirm={() => { const r = blocking; setBlocking(null); if (r) void setFlags(r.id, { is_banned: true }) }}
        onClose={() => setBlocking(null)}
      />
    </div>
  )
}
