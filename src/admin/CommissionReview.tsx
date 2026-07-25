import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SecretText from '../components/SecretText'
import type { AcceptanceRow } from '../types/database'
import { usd, dateTimeShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, StatusBadge } from '../components/ui'
import { Th, Td, PromptDialog, ConfirmDialog } from './bits'
import { useLang } from './i18n'

type Row = AcceptanceRow & {
  freelancer: { display_name: string | null } | null
  am: { name: string } | null
  task: { title: string } | null
}

const COPY = {
  zh: {
    title: '提成复核', sub: '第三圈：AM 验收后进入这里排队，你通过后钱才进 AM 钱包；驳回会记录原因，AM 可整改后重新验收。',
    pending: '待复核', empty: '没有待复核的验收，休息一下 ☕',
    thWhen: '验收于', thAm: 'AM', thFl: 'Freelancer', thType: '平台', thTask: '任务', thCreds: '账号凭证', thAmount: '提成', thAct: '',
    approve: '通过', reject: '驳回', none: '—',
    approveT: '通过并入账', approveQ: (amt: string, am: string) => `确认通过？${amt} 将立即计入 ${am} 的钱包。`,
    rejectT: '驳回验收', rejectQ: '驳回原因（AM 可见，必填）：', dlgCancel: '取消',
    history: '最近已处理', hEmpty: '还没有处理记录。', ok: '已通过', bad: '已驳回',
    reBadge: '跳审核复验', roTitle: '跳审核处理中', roHint: '这些验收被打回,等归属 AM 联系 freelancer 解决后重新提交。', roBy: '原因', roEmptyHide: '',
  },
  en: {
    title: 'Commission review', sub: 'Third circle: AM acceptances queue here. Money hits the AM wallet only after you approve; rejections are noted and the AM can re-accept later.',
    pending: 'Pending', empty: 'Nothing to review. ☕',
    thWhen: 'Accepted', thAm: 'AM', thFl: 'Freelancer', thType: 'Platform', thTask: 'Task', thCreds: 'Credentials', thAmount: 'Commission', thAct: '',
    approve: 'Approve', reject: 'Reject', none: '—',
    approveT: 'Approve & credit', approveQ: (amt: string, am: string) => `Approve? ${amt} will be credited to ${am}'s wallet now.`,
    rejectT: 'Reject acceptance', rejectQ: 'Reason (visible to the AM, required):', dlgCancel: 'Cancel',
    history: 'Recently decided', hEmpty: 'No decisions yet.', ok: 'Approved', bad: 'Rejected',
    reBadge: 'Flag re-review', roTitle: 'Flagged — in progress', roHint: 'Reopened acceptances waiting for the AM to resolve with the freelancer.', roBy: 'Reason', roEmptyHide: '',
  },
}

const SEL = '*, freelancer:profiles!platform_acceptances_freelancer_id_fkey(display_name), am:account_managers(name), task:tasks(title)'

export default function CommissionReview() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [rows, setRows] = useState<Row[]>([])
  const [done, setDone] = useState<Row[]>([])
  const [reopened, setReopened] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creds, setCreds] = useState<Record<string, { login: string | null; pass: string | null }>>({})
  const [approving, setApproving] = useState<Row | null>(null)
  const [rejecting, setRejecting] = useState<Row | null>(null)

  const load = useCallback(async () => {
    const [pRes, dRes, roRes] = await Promise.all([
      supabase.from('platform_acceptances').select(SEL)
        .eq('status', 'pending_admin').order('created_at', { ascending: true }),
      supabase.from('platform_acceptances').select(SEL)
        .in('status', ['approved', 'rejected']).order('decided_at', { ascending: false }).limit(20),
      supabase.from('platform_acceptances').select(SEL)
        .eq('status', 'reopened').order('reopened_at', { ascending: false }),
    ])
    if (pRes.error) { setError(pRes.error.message); setLoaded(true); return }
    setRows((pRes.data ?? []) as unknown as Row[])
    // 提成复核需要核账号:按关联任务批量取最新交付凭证(m24/A1)
    const ids = ((pRes.data ?? []) as unknown as Row[]).map(r => r.task_id).filter((x): x is string => !!x)
    if (ids.length > 0) {
      const { data: subs } = await supabase.from('task_submissions')
        .select('task_id, account_login, account_password, created_at')
        .in('task_id', ids).order('created_at', { ascending: true })
      const map: Record<string, { login: string | null; pass: string | null }> = {}
      for (const r of (subs ?? []) as { task_id: string; account_login: string | null; account_password: string | null }[]) {
        map[r.task_id] = { login: r.account_login, pass: r.account_password }  // 升序遍历,末次覆盖=最新
      }
      setCreds(map)
    } else setCreds({})
    setDone((dRes.data ?? []) as unknown as Row[])
    setReopened((roRes.data ?? []) as unknown as Row[])
    setLoaded(true)
  }, [])

  useEffect(() => { void load() }, [load])

  async function decide(row: Row, approve: boolean, note: string | null) {
    setBusy(true); setError(null)
    const { error: e } = await supabase.rpc('review_acceptance', {
      p_acceptance: row.id, p_approve: approve, p_note: note,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    await load()
  }

  if (!loaded) return <p className="text-muted">…</p>

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="mb-6 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr>
                <Th>{t.thWhen}</Th><Th>{t.thAm}</Th><Th>{t.thFl}</Th>
                <Th>{t.thType}</Th><Th>{t.thTask}</Th><Th>{t.thCreds}</Th><Th>{t.thAmount}</Th><Th>{t.thAct}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                  <Td className="whitespace-nowrap font-mono text-xs text-muted">{dateTimeShort(r.created_at)}</Td>
                  <Td>{r.am?.name ?? t.none}</Td>
                  <Td>{r.freelancer?.display_name ?? r.freelancer_id.slice(0, 8)}</Td>
                  <Td>
                    <span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{r.task_type}</span>
                    {r.reopened_at && (
                      <>
                        <span className="ml-1.5 rounded-full border border-pending-border bg-pending-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-pending-text">{t.reBadge}</span>
                        {r.reopened_reason && <p className="mt-1 max-w-[16rem] truncate text-[11px] text-faint">{r.reopened_reason}</p>}
                      </>
                    )}
                  </Td>
                  <Td className="max-w-[14rem] truncate text-muted">{r.task?.title ?? t.none}</Td>
                  <Td>
                    {r.task_id && creds[r.task_id]?.login ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="break-all font-mono text-[11px]">{creds[r.task_id].login}</span>
                        {creds[r.task_id].pass && <SecretText value={creds[r.task_id].pass!} />}
                      </span>
                    ) : <span className="text-faint">—</span>}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-sm text-ink">{usd(Number(r.amount))}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => setApproving(r)}>{t.approve}</Button>
                      <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => setRejecting(r)}>{t.reject}</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-5">
      {reopened.length > 0 && (
        <Card className="mb-6 p-5">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-danger-text">{t.roTitle} · {reopened.length}</p>
          <p className="mb-3 text-xs text-faint">{t.roHint}</p>
          {reopened.map(r => (
            <div key={r.id} className="border-b border-hair py-2 text-xs last:border-b-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-ink">{r.freelancer?.display_name ?? r.freelancer_id.slice(0, 8)}</span>
                <span className="text-faint">·</span>
                <span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{r.task_type}</span>
                {r.task?.title && <span className="max-w-[12rem] truncate text-faint">{r.task.title}</span>}
                <span className="ml-auto font-mono text-[10px] text-faint">{r.am?.name ?? '—'} · {r.reopened_at ? dateTimeShort(r.reopened_at) : ''}</span>
              </p>
              {r.reopened_reason && <p className="mt-0.5 text-faint">{t.roBy}: {r.reopened_reason}</p>}
            </div>
          ))}
        </Card>
      )}

        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.history}</p>
        {done.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.hEmpty}</p>
        ) : done.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-b border-hair py-2.5 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">
                {r.am?.name ?? t.none} · {r.freelancer?.display_name ?? r.freelancer_id.slice(0, 8)} · {r.task_type} · {usd(Number(r.amount))}
              </p>
              <p className="mt-0.5 font-mono text-xs text-faint">
                {dateTimeShort(r.decided_at)}{r.review_note ? ` · ${r.review_note}` : ''}
              </p>
            </div>
            <StatusBadge status={r.status === 'approved' ? 'verified' : 'unverified'} label={r.status === 'approved' ? t.ok : t.bad} />
          </div>
        ))}
      </Card>

      <ConfirmDialog
        open={approving !== null}
        title={t.approveT}
        hint={approving ? t.approveQ(usd(Number(approving.amount)), approving.am?.name ?? 'AM') : undefined}
        confirmLabel={t.approve}
        cancelLabel={t.dlgCancel}
        danger={false}
        onConfirm={() => { const r = approving; setApproving(null); if (r) void decide(r, true, null) }}
        onClose={() => setApproving(null)}
      />
      <PromptDialog
        open={rejecting !== null}
        title={t.rejectT}
        hint={t.rejectQ}
        confirmLabel={t.reject}
        cancelLabel={t.dlgCancel}
        danger
        onConfirm={note => { const r = rejecting; setRejecting(null); if (r) void decide(r, false, note) }}
        onClose={() => setRejecting(null)}
      />
    </div>
  )
}
