import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AccountRecord, AcceptanceRow, CommissionRate, PlatformType } from '../types/database'
import { PLATFORMS } from '../types/database'
import { usd, dateShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, StatusBadge, Field, Label, Input } from '../components/ui'
import TotpCode from '../components/TotpCode'
import SecretText from '../components/SecretText'
import { PromptDialog } from '../components/dialogs'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

/** 三圆圈进度：① freelancer 完成 → ② 你验收 → ③ 平台通过。
 *  对应 Roman 的心智模型：钱要走完三关才进钱包。 */
function Circles({ stage }: { stage: 0 | 1 | 2 | 3 }) {
  // stage = 已点亮的圈数（0 未开始 / 1 完成 / 2 已验收待复核 / 3 已入账）
  return (
    <span className="inline-flex items-center gap-1" title={`${stage}/3`}>
      {[1, 2, 3].map(n => (
        <span key={n} className="flex items-center">
          <span className={`h-2.5 w-2.5 rounded-full border ${
            n <= stage ? 'border-petrol bg-petrol' : 'border-hair bg-transparent'
          }`} />
          {n < 3 && <span className={`mx-0.5 h-px w-2.5 ${n < stage ? 'bg-petrol' : 'bg-hair'}`} />}
        </span>
      ))}
    </span>
  )
}

const COPY = {
  zh: {
    back: '← 我的 Freelancer', notFound: '不在你的名下。',
    stGrey: '未完成', stYellow: '待验收', stReview: '待平台复核', stGreen: '已入账',
    accept: '验收', reaccept: '重新验收', acceptedOn: '验收于', rejectedNote: '被驳回:', records: '账号资料', addRec: '＋ 添加账号',
    login: '账号', pw: '密码', twofa: '二步验证(2FA)', phone: '手机号码', sms: '接码链接', recStatus: '状态', rsActive: '正常', rsReview: '审核中', rsClosed: '已关闭',
    expires: '手机号到期日', notes: '备注', save: '保存', saving: '保存中…', cancel: '取消', edit: '编辑',
    daysLeft: (d: number) => d < 0 ? '已过期' : d === 0 ? '今天到期' : `剩 ${d} 天`,
    noRec: '还没有账号资料。',
    suspend: '暂停接单', resume: '恢复接单', suspended: '已暂停', strike: '记录违规',
    suspendQ: '暂停原因(内部记录):', strikeQ: 'Strike 原因(内部记录):',
    circleHint: '每一项要走完三关才计提成：① TA 完成任务 → ② 你验收 → ③ 平台复核通过。',
    profileLink: '查看档案', otherT: '其他任务(逐单验收)', otherEmpty: '没有已完成的「其他」类型任务。', est: '预计', otherHint: '「其他」不占八项清单;每单单独走三关,金额按单笔覆盖或费率表。',
  },
  en: {
    back: '← My freelancers', notFound: 'Not in your roster.',
    stGrey: 'Not done', stYellow: 'To accept', stReview: 'In platform review', stGreen: 'Credited',
    accept: 'Accept', reaccept: 'Re-accept', acceptedOn: 'Accepted', rejectedNote: 'Rejected:', records: 'Account records', addRec: '＋ Add account',
    login: 'Login', pw: 'Password', twofa: '2FA', phone: 'Phone number', sms: 'SMS inbox link', recStatus: 'Status', rsActive: 'Active', rsReview: 'In review', rsClosed: 'Closed',
    expires: 'Phone expires on', notes: 'Notes', save: 'Save', saving: 'Saving…', cancel: 'Cancel', edit: 'Edit',
    daysLeft: (d: number) => d < 0 ? 'expired' : d === 0 ? 'expires today' : `${d}d left`,
    noRec: 'No account records yet.',
    suspend: 'Pause', resume: 'Resume', suspended: 'Paused', strike: 'Record strike',
    suspendQ: 'Pause reason (internal):', strikeQ: 'Strike reason (internal):',
    circleHint: 'Each item clears three gates before it pays: ① they finish → ② you accept → ③ platform approves.',
    profileLink: 'Full profile', otherT: 'Other tasks (per-task acceptance)', otherEmpty: 'No completed "Other" tasks.', est: 'est.', otherHint: '"Other" tasks skip the 8-item list; each clears the three gates on its own.',
  },
}

const REC_EMPTY = { account_login: '', account_password: '', twofa: '', phone_number: '', sms_link: '', phone_expires_on: '', notes: '', status: 'active' }

function daysUntil(iso: string): number {
  const a = new Date(iso + 'T00:00:00')
  const b = new Date(); b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export default function AmFreelancerBoard() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { id } = useParams<{ id: string }>()
  const { am } = useAm()

  const [name, setName] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const [suspended, setSuspended] = useState(false)
  const [completedTypes, setCompletedTypes] = useState<Set<PlatformType>>(new Set())
  const [otherTasks, setOtherTasks] = useState<{ id: string; title: string; commission_override: number | null; freelancer_confirmed_at: string | null; rate_item: { label: string; amount: number } | null }[]>([])
  const [otherLive, setOtherLive] = useState<AcceptanceRow[]>([])
  const [otherRej, setOtherRej] = useState<AcceptanceRow[]>([])
  // live = 未驳回的验收（待复核 or 已通过）；rejected = 最近一条被驳回的
  const [acceptances, setAcceptances] = useState<Map<PlatformType, AcceptanceRow>>(new Map())
  const [rejected, setRejected] = useState<Map<PlatformType, AcceptanceRow>>(new Map())
  const [records, setRecords] = useState<AccountRecord[]>([])
  const [rates, setRates] = useState<Map<PlatformType, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyType, setBusyType] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'suspend' | 'strike'>(null)

  const [openType, setOpenType] = useState<PlatformType | null>(null)
  const [recEditing, setRecEditing] = useState<'new' | string | null>(null)
  const [recForm, setRecForm] = useState(REC_EMPTY)
  const [recBusy, setRecBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id || !am) return
    const [p, tk, ot, ac, rc, rt] = await Promise.all([
      supabase.from('profiles').select('display_name, managed_by, is_suspended').eq('id', id).maybeSingle(),
      supabase.from('tasks').select('task_type').eq('assigned_freelancer', id)
        .eq('status', 'completed').not('task_type', 'is', null),
      supabase.from('tasks').select('id, title, commission_override, freelancer_confirmed_at, rate_item:custom_rate_items(label, amount)')
        .eq('assigned_freelancer', id).eq('status', 'completed').eq('task_type', 'Other')
        .order('freelancer_confirmed_at', { ascending: false }),
      supabase.from('platform_acceptances').select('*').eq('freelancer_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('account_records').select('*').eq('freelancer_id', id).order('created_at'),
      supabase.from('commission_rates').select('*'),
    ])
    const prof = p.data as { display_name: string | null; managed_by: string | null; is_suspended: boolean } | null
    setName(prof?.display_name ?? null)
    setMine(prof?.managed_by === am.id)
    setSuspended(prof?.is_suspended ?? false)
    setCompletedTypes(new Set(((tk.data ?? []) as { task_type: PlatformType }[]).map(x => x.task_type)))
    setOtherTasks((ot.data ?? []) as unknown as { id: string; title: string; commission_override: number | null; freelancer_confirmed_at: string | null; rate_item: { label: string; amount: number } | null }[])
    const live = new Map<PlatformType, AcceptanceRow>()
    const rej = new Map<PlatformType, AcceptanceRow>()
    const oLive: AcceptanceRow[] = []
    const oRej: AcceptanceRow[] = []
    for (const a of (ac.data ?? []) as AcceptanceRow[]) {
      if (a.task_type === 'Other') {
        // 「其他」逐单：不能按类型去重,整表分桶
        if (a.status === 'rejected') oRej.push(a); else oLive.push(a)
      } else if (a.status === 'rejected') {
        if (!rej.has(a.task_type)) rej.set(a.task_type, a)
      } else if (!live.has(a.task_type)) {
        live.set(a.task_type, a)   // 每平台至多一条 live
      }
    }
    setAcceptances(live)
    setRejected(rej)
    setOtherLive(oLive)
    setOtherRej(oRej)
    setRecords((rc.data ?? []) as AccountRecord[])
    setRates(new Map(((rt.data ?? []) as CommissionRate[]).map(r => [r.task_type, Number(r.amount)])))
    setLoaded(true)
  }, [id, am])

  useEffect(() => { void load() }, [load])

  async function accept(type: PlatformType) {
    if (!id) return
    setError(null); setBusyType(type)
    const { error: e } = await supabase.rpc('am_accept', { p_freelancer: id, p_type: type })
    setBusyType(null)
    if (e) { setError(e.message); return }
    await load()
  }

  async function acceptTask(taskId: string) {
    setError(null); setBusyType(taskId)
    const { error: e } = await supabase.rpc('am_accept_task', { p_task: taskId })
    setBusyType(null)
    if (e) { setError(e.message); return }
    await load()
  }

  async function setSuspend(reason: string) {
    setDialog(null)
    if (!id) return
    setError(null)
    const { error: e } = await supabase.rpc('am_set_suspended', { p_freelancer: id, p_suspend: true, p_reason: reason })
    if (e) { setError(e.message); return }
    await load()
  }

  async function resume() {
    if (!id) return
    setError(null)
    const { error: e } = await supabase.rpc('am_set_suspended', { p_freelancer: id, p_suspend: false })
    if (e) { setError(e.message); return }
    await load()
  }

  async function addStrike(reason: string) {
    setDialog(null)
    if (!id) return
    setError(null)
    const { error: e } = await supabase.from('strikes').insert({ freelancer_id: id, reason })
    if (e) { setError(e.message); return }
  }

  function startRec(type: PlatformType, r: AccountRecord | null) {
    setOpenType(type); setError(null)
    if (!r) { setRecEditing('new'); setRecForm(REC_EMPTY); return }
    setRecEditing(r.id)
    setRecForm({
      account_login: r.account_login ?? '', account_password: r.account_password ?? '',
      twofa: r.twofa ?? '', phone_number: r.phone_number ?? '', sms_link: r.sms_link ?? '', status: r.status ?? 'active',
      phone_expires_on: r.phone_expires_on ?? '', notes: r.notes ?? '',
    })
  }

  async function saveRec(type: PlatformType) {
    if (!id) return
    setRecBusy(true); setError(null)
    const payload = {
      account_login: recForm.account_login.trim() || null,
      account_password: recForm.account_password.trim() || null,
      twofa: recForm.twofa.trim() || null,
      status: recForm.status,
      phone_number: recForm.phone_number.trim() || null,
      sms_link: recForm.sms_link.trim() || null,
      phone_expires_on: recForm.phone_expires_on || null,
      notes: recForm.notes.trim() || null,
    }
    const res = recEditing === 'new'
      ? await supabase.from('account_records').insert({ ...payload, freelancer_id: id, task_type: type })
      : await supabase.from('account_records').update(payload).eq('id', recEditing!)
    setRecBusy(false)
    if (res.error) { setError(res.error.message); return }
    setRecEditing(null); setRecForm(REC_EMPTY)
    await load()
  }

  if (!loaded || !am) return <p className="text-muted">…</p>
  if (!mine) {
    return (
      <div>
        <Link to="/am/my" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
        <PageHeading>{t.notFound}</PageHeading>
      </div>
    )
  }

  const recFormCard = (type: PlatformType) => (
    <div className="mt-3 rounded-xl border border-petrol/25 bg-paper p-4">
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label={t.login} value={recForm.account_login} onChange={e => setRecForm({ ...recForm, account_login: e.target.value })} />
        <Field label={t.pw} value={recForm.account_password} onChange={e => setRecForm({ ...recForm, account_password: e.target.value })} />
        <Field label={t.twofa} value={recForm.twofa} onChange={e => setRecForm({ ...recForm, twofa: e.target.value })} />
        <div className="mb-4">
          <Label>{t.recStatus}</Label>
          <select value={recForm.status} onChange={e => setRecForm({ ...recForm, status: e.target.value })}
            className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20">
            <option value="active">{t.rsActive}</option>
            <option value="review">{t.rsReview}</option>
            <option value="closed">{t.rsClosed}</option>
          </select>
        </div>
        <Field label={t.phone} value={recForm.phone_number} onChange={e => setRecForm({ ...recForm, phone_number: e.target.value })} />
        <Field label={t.sms} value={recForm.sms_link} onChange={e => setRecForm({ ...recForm, sms_link: e.target.value })} placeholder="https://…" />
        <div className="mb-4">
          <Label>{t.expires}</Label>
          <Input type="date" value={recForm.phone_expires_on} onChange={e => setRecForm({ ...recForm, phone_expires_on: e.target.value })} />
        </div>
      </div>
      <Field label={t.notes} value={recForm.notes} onChange={e => setRecForm({ ...recForm, notes: e.target.value })} />
      <div className="flex gap-2">
        <Button onClick={() => void saveRec(type)} disabled={recBusy}>{recBusy ? t.saving : t.save}</Button>
        <Button variant="ghost" onClick={() => { setRecEditing(null); setRecForm(REC_EMPTY) }}>{t.cancel}</Button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/am/my" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{name ?? id?.slice(0, 8)}</h1>
          <Link to={`/am/pool/${id}`} className="font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">{t.profileLink}</Link>
          {suspended && <StatusBadge status="pending" label={t.suspended} />}
        </div>
        <div className="flex gap-2">
          {suspended
            ? <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void resume()}>{t.resume}</Button>
            : <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDialog('suspend')}>{t.suspend}</Button>}
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDialog('strike')}>{t.strike}</Button>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <p className="mb-3 text-xs leading-relaxed text-faint">{t.circleHint}</p>

      <Card className="p-5">
        {PLATFORMS.map(type => {
          const acc = acceptances.get(type)
          const rej = rejected.get(type)
          const done = completedTypes.has(type)
          // 四态：green 已入账 / review 待平台复核 / yellow 待验收 / grey 未完成
          const state: 'grey' | 'yellow' | 'review' | 'green' =
            acc?.status === 'approved' ? 'green'
            : acc?.status === 'pending_admin' ? 'review'
            : done ? 'yellow' : 'grey'
          const stage: 0 | 1 | 2 | 3 =
            state === 'green' ? 3 : state === 'review' ? 2 : state === 'yellow' ? 1 : 0
          const recs = records.filter(r => r.task_type === type)
          const rate = rates.get(type) ?? 0
          const badgeTone = state === 'green' ? 'verified' : state === 'grey' ? 'unverified' : 'pending'
          const badgeLabel = state === 'green' ? t.stGreen : state === 'review' ? t.stReview : state === 'yellow' ? t.stYellow : t.stGrey
          return (
            <div key={type} className="border-b border-hair py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-24 font-display text-sm font-medium text-ink">{type}</span>
                  <Circles stage={stage} />
                  <StatusBadge status={badgeTone} label={badgeLabel} />
                  {state === 'green' && acc && (
                    <span className="font-mono text-xs text-faint">
                      {t.acceptedOn} {dateShort(acc.created_at)} · +{usd(Number(acc.amount))}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {state === 'yellow' && (
                    <Button className="px-3 py-1.5 text-xs" disabled={busyType === type} onClick={() => void accept(type)}>
                      {rej ? t.reaccept : t.accept}{rate > 0 ? ` +${usd(rate)}` : ''}
                    </Button>
                  )}
                  <Button variant="ghost" className="px-3 py-1.5 text-xs"
                    onClick={() => { setOpenType(openType === type ? null : type); setRecEditing(null) }}>
                    {t.records} {recs.length > 0 && <span className="font-mono">({recs.length})</span>}
                  </Button>
                </div>
              </div>
              {rej && state !== 'green' && (
                <p className="mt-1.5 text-xs text-danger-text">
                  {t.rejectedNote} {rej.review_note ?? '—'}
                </p>
              )}

              {openType === type && (
                <div className="mt-3">
                  {recs.length === 0 && recEditing !== 'new' && (
                    <p className="text-xs text-faint">{t.noRec}</p>
                  )}
                  {recs.map(r => (
                    <div key={r.id} className="mt-2 rounded-lg border border-hair bg-white p-3">
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                        <p><span className="text-faint">{t.login}: </span><span className="font-mono text-ink">{r.account_login ?? '—'}</span></p>
                        <p><span className="text-faint">{t.pw}: </span>{r.account_password ? <SecretText value={r.account_password} /> : '—'}</p>
                        <p className="flex flex-wrap items-center gap-2"><span className="text-faint">{t.twofa}: </span>{r.twofa ? <><SecretText value={r.twofa} /><TotpCode secret={r.twofa} /></> : '—'}
                          <span className={`font-mono text-[10px] uppercase tracking-wider ${ (r.status ?? 'active') === 'active' ? 'text-verified-text' : (r.status ?? 'active') === 'review' ? 'text-pending-text' : 'text-danger-text'}`}>
                            {(r.status ?? 'active') === 'active' ? t.rsActive : (r.status ?? 'active') === 'review' ? t.rsReview : t.rsClosed}
                          </span></p>
                        <p>
                          <span className="text-faint">{t.phone}: </span>
                          <span className="font-mono text-ink">{r.phone_number ?? '—'}</span>
                          {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">SMS</a></>}
                          {r.phone_expires_on && (
                            <span className={`ml-2 font-mono ${daysUntil(r.phone_expires_on) <= 3 ? 'text-danger-text' : 'text-faint'}`}>
                              {r.phone_expires_on} · {t.daysLeft(daysUntil(r.phone_expires_on))}
                            </span>
                          )}
                        </p>
                      </div>
                      {r.notes && <p className="mt-1.5 text-xs text-muted">{r.notes}</p>}
                      <button onClick={() => startRec(type, r)}
                        className="mt-2 font-mono text-[10px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
                        {t.edit}
                      </button>
                      {recEditing === r.id && recFormCard(type)}
                    </div>
                  ))}
                  {recEditing === 'new' ? recFormCard(type) : (
                    <Button variant="ghost" className="mt-2 px-3 py-1.5 text-xs" onClick={() => startRec(type, null)}>
                      {t.addRec}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card className="mt-5 p-5">
        <div className="mb-1 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.otherT}</p>
        </div>
        <p className="mb-2 text-xs leading-relaxed text-faint">{t.otherHint}</p>
        {otherTasks.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.otherEmpty}</p>
        ) : otherTasks.map(ot => {
          const live = otherLive.find(a => a.task_id === ot.id)
          const rej = otherRej.find(a => a.task_id === ot.id)
          const state: 'yellow' | 'review' | 'green' =
            live?.status === 'approved' ? 'green' : live?.status === 'pending_admin' ? 'review' : 'yellow'
          const stage: 1 | 2 | 3 = state === 'green' ? 3 : state === 'review' ? 2 : 1
          const amt = live ? Number(live.amount) : (ot.commission_override != null ? Number(ot.commission_override) : (ot.rate_item ? Number(ot.rate_item.amount) : (rates.get('Other') ?? 0)))
          return (
            <div key={ot.id} className="border-b border-hair py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Link to={`/am/tasks/${ot.id}`} className="max-w-[14rem] truncate text-sm text-ink hover:text-petrol">{ot.title}</Link>
                  {ot.rate_item && <span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{ot.rate_item.label}</span>}
                  <Circles stage={stage} />
                  <StatusBadge status={state === 'green' ? 'verified' : 'pending'}
                    label={state === 'green' ? t.stGreen : state === 'review' ? t.stReview : t.stYellow} />
                  <span className="font-mono text-xs text-faint">
                    {state === 'green' ? `+${usd(amt)}` : `${t.est} +${usd(amt)}`}
                  </span>
                </div>
                {state === 'yellow' && (
                  <Button className="px-3 py-1.5 text-xs" disabled={busyType === ot.id} onClick={() => void acceptTask(ot.id)}>
                    {rej ? t.reaccept : t.accept}
                  </Button>
                )}
              </div>
              {rej && state === 'yellow' && (
                <p className="mt-1.5 text-xs text-danger-text">{t.rejectedNote} {rej.review_note ?? '—'}</p>
              )}
            </div>
          )
        })}
      </Card>

      <PromptDialog
        open={dialog === 'suspend'}
        title={t.suspend}
        hint={t.suspendQ}
        confirmLabel={t.suspend}
        cancelLabel={t.cancel}
        danger
        onConfirm={reason => void setSuspend(reason)}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        open={dialog === 'strike'}
        title={t.strike}
        hint={t.strikeQ}
        confirmLabel={t.strike}
        cancelLabel={t.cancel}
        onConfirm={reason => void addStrike(reason)}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
