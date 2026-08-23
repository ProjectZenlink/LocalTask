import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { bjDay, dateShort } from '../lib/format'
import type { PoolRow } from '../types/database'
import { Alert, Button, Card, Input, Label, PageHeading, StatusBadge } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'
import { pingWorkline } from '../lib/workline'
import { friendly } from '../lib/errors'

const COPY = {
  zh: {
    title: '我的 Freelancer', sub: '你名下的人才:负载与签到一览。三个入口:清单验收、完整档案、直接派任务。', createBtn: '+ 创建 Freelancer', cTitle: '创建 Freelancer', cEmail: '邮箱', cName: '法定姓名', cGo: '创建', cOkA: '已创建并挂入你名下。', cOkB: '初始密码 = 公司统一初始密码;请引导客户尽快首次登录(系统将强制其改密)。', cClose: '关闭',
    empty: '名下还没有人。去', poolLink: '人才库', empty2: '认领无归属的 freelancer。',
    chat: '对话', board: '清单', profile: '档案', assign: '派任务', search: '按名字/联系方式搜索…', ciNone: '今日未签到', ciPending: '确认签到', ciDone: '签到已复核 ✓',
    reg: '注册', active: '活跃', done: '完成', suspended: '已暂停',
    fAll: '全部', fCi: '今日签到待确认', fKycPending: 'KYC 待审核', fKycDone: 'KYC 已完成', noMatch: '没有匹配的人。',
  },
  en: {
    title: 'My freelancers', sub: 'Your roster with load and check-ins at a glance. Three doors: checklist, full profile, assign a task.', createBtn: '+ Create freelancer', cTitle: 'Create freelancer', cEmail: 'Email', cName: 'Legal full name', cGo: 'Create', cOkA: 'Created and assigned to you.', cOkB: 'Starter password = the company shared password; ask the client to log in soon (a password change is enforced).', cClose: 'Close',
    empty: 'Nobody yet. Claim unowned freelancers in the', poolLink: 'Pool', empty2: '.',
    chat: 'Chat', board: 'Checklist', profile: 'Profile', assign: 'Assign task', search: 'Search by name / contact…', ciNone: 'No check-in today', ciPending: 'Confirm check-in', ciDone: 'Check-in confirmed ✓',
    reg: 'Joined', active: 'active', done: 'done', suspended: 'Paused',
    fAll: 'All', fCi: 'Check-ins to confirm', fKycPending: 'KYC pending', fKycDone: 'KYC verified', noMatch: 'No one matches.',
  },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}


function useFocusFlash() {
  const [sp] = useSearchParams()
  const focus = sp.get('focus')
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => {
      const el = document.getElementById(`f-${focus}`)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('focus-flash') }
    }, 350)
    return () => clearTimeout(t)
  }, [focus])
}

export default function AmFreelancers() {
  const navigate = useNavigate()
  useFocusFlash()
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<PoolRow[]>([])
  const [q, setQ] = useState('')
  const [ff, setFf] = useState<'all' | 'ci' | 'kyc_pending' | 'kyc_done'>('all')
  const [cOpen, setCOpen] = useState(false)
  const [cEmail, setCEmail] = useState('')
  const [cName, setCName] = useState('')
  const [cBusy, setCBusy] = useState(false)
  const [cErr, setCErr] = useState<string | null>(null)
  const [cMsg, setCMsg] = useState<string | null>(null)

  async function createFl() {
    if (!cEmail.trim() || cName.trim().length < 2) { setCErr(t.cEmail + ' / ' + t.cName); return }
    setCBusy(true); setCErr(null)
    const { data, error } = await supabase.functions.invoke('am-create-freelancer', {
      body: { email: cEmail.trim(), full_name: cName.trim() },
    })
    setCBusy(false)
    const errMsg = (data as { error?: string } | null)?.error ?? error?.message
    if (errMsg) { setCErr(errMsg); return }
    setCMsg(t.cOkA); setCEmail(''); setCName('')
    void load()
  }
  const [ci, setCi] = useState<Record<string, 'pending' | 'confirmed'>>({})
  const [ciBusy, setCiBusy] = useState<string | null>(null)
  const bjToday = bjDay()

  const loadCi = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setCi({}); return }
    const { data } = await supabase.from('checkins').select('user_id, confirmed_at')
      .eq('day', bjToday).in('user_id', ids)
    const map: Record<string, 'pending' | 'confirmed'> = {}
    for (const r of (data ?? []) as { user_id: string; confirmed_at: string | null }[]) {
      map[r.user_id] = r.confirmed_at ? 'confirmed' : 'pending'
    }
    setCi(map)
  }, [bjToday])


  // v74.1:名下直达对话(深链 /am/messages?with=)
  async function openChat(id: string) {
    const { error: e } = await supabase.rpc('open_conversation', { p_other: id })
    if (e) { setError(friendly(e)); return }
    // v75 ②:按偏好落小窗或整页
    const chatMode = localStorage.getItem('lt_chat_open') === 'dock' ? 'dock' : 'page'
    if (chatMode === 'dock') {
      window.dispatchEvent(new CustomEvent('lt-open-dock', { detail: { with: id } }))
      return
    }
    navigate(`/am/messages?with=${id}`)
  }

  async function confirmCi(id: string) {
    setCiBusy(id)
    const { error: e } = await supabase.rpc('confirm_checkin', { p_user: id, p_day: bjToday })
    setCiBusy(null)
    if (!e) { setCi(prev => ({ ...prev, [id]: 'confirmed' })); pingWorkline() }
  }
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!am) return
    const { data, error: e } = await supabase.from('freelancer_pool')
      .select('*').eq('managed_by', am.id).order('created_at', { ascending: false })
    if (e) { setError(friendly(e)); setLoaded(true); return }
    const list = (data ?? []) as PoolRow[]
    setRows(list)
    void loadCi(list.map(r => r.id))
    setLoaded(true)
  }, [am, loadCi])

  useEffect(() => { void load() }, [load])

  if (!am || !loaded) return <p className="text-muted">…</p>

  const needle = q.trim().toLowerCase()
  const searched = needle
    ? rows.filter(r => [r.display_name, r.full_name, r.contact_whatsapp, r.contact_telegram]
        .some(v => (v ?? '').toLowerCase().includes(needle)))
    : rows
  // 快捷筛选片:今日签到待确认 / KYC 待审核 / KYC 已完成
  const ffMatch = (r: PoolRow, f: typeof ff) =>
    f === 'all' ? true
      : f === 'ci' ? ci[r.id] === 'pending'
      : f === 'kyc_pending' ? r.kyc_status === 'pending'
      : r.kyc_status === 'verified'
  const counts = {
    ci: searched.filter(r => ffMatch(r, 'ci')).length,
    kyc_pending: searched.filter(r => ffMatch(r, 'kyc_pending')).length,
    kyc_done: searched.filter(r => ffMatch(r, 'kyc_done')).length,
  }
  const shown = searched.filter(r => ffMatch(r, ff))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Button className="px-4 py-2 text-sm" onClick={() => { setCOpen(true); setCMsg(null); setCErr(null) }}>{t.createBtn}</Button>
      </div>
      <div className="mb-3">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {([['all', t.fAll, null], ['ci', t.fCi, counts.ci], ['kyc_pending', t.fKycPending, counts.kyc_pending], ['kyc_done', t.fKycDone, counts.kyc_done]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setFf(k)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${ff === k ? 'border-petrol bg-petrol text-paper' : 'border-hair bg-white text-muted hover:text-ink'}`}>
            {label}{n !== null ? ` · ${n}` : ''}
          </button>
        ))}
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">
            {t.empty} <Link to="/am/pool" className="text-petrol underline underline-offset-2">{t.poolLink}</Link> {t.empty2}
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.noMatch}</p>
        ) : shown.map(r => (
          <div key={r.id} id={`f-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3.5 last:border-b-0">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Link to={`/am/pool/${r.id}`}
                  className="w-40 min-w-0 truncate text-sm font-medium text-ink hover:text-petrol sm:w-52">
                  {r.display_name ?? r.id.slice(0, 8)}
                </Link>
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} />
                  {r.is_suspended && <StatusBadge status="pending" label={t.suspended} />}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-faint">
                {t.reg} {dateShort(r.created_at)} · {r.active_tasks} {t.active} · {r.completed_tasks} {t.done}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {ci[r.id] === 'confirmed' ? (
                <span className="inline-flex items-center rounded-full border border-verified-border bg-verified-bg px-2.5 py-1.5 font-mono text-[10px] leading-none uppercase tracking-wider text-verified-text">{t.ciDone}</span>
              ) : ci[r.id] === 'pending' ? (
                <Button className="px-3 py-1.5 text-xs" disabled={ciBusy === r.id} onClick={() => void confirmCi(r.id)}>
                  {ciBusy === r.id ? '…' : t.ciPending}
                </Button>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{t.ciNone}</span>
              )}
              <Link to={`/am/f/${r.id}`}><Button className="px-3 py-1.5 text-xs">{t.board}</Button></Link>
              <Link to={`/am/pool/${r.id}`}><Button variant="ghost" className="px-3 py-1.5 text-xs">{t.profile}</Button></Link>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void openChat(r.id)}>{t.chat}</Button>
              <Link to={`/am/tasks/new?fl=${r.id}`}><Button variant="ghost" className="px-3 py-1.5 text-xs">{t.assign}</Button></Link>
            </div>
          </div>
        ))}
      </Card>

      {cOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setCOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-5" onClick={e => e.stopPropagation()}>
            <p className="font-display text-lg text-ink">{t.cTitle}</p>
            {cErr && <Alert tone="error">{cErr}</Alert>}
            {cMsg ? (
              <>
                <p className="mt-3 text-sm text-verified-text">{cMsg}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t.cOkB}</p>
                <Button variant="ghost" className="mt-4 w-full" onClick={() => setCOpen(false)}>{t.cClose}</Button>
              </>
            ) : (
              <>
                <div className="mt-3 space-y-3">
                  <div><Label>{t.cEmail}</Label><Input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} /></div>
                  <div><Label>{t.cName}</Label><Input value={cName} onChange={e => setCName(e.target.value)} /></div>
                </div>
                <Button className="mt-4 w-full" disabled={cBusy} onClick={() => void createFl()}>{cBusy ? '…' : t.cGo}</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
