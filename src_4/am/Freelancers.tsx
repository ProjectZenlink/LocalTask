import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { bjDay } from '../lib/format'
import type { PoolRow } from '../types/database'
import { PageHeading, Card, Alert, Button, StatusBadge, Input } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'
import { pingWorkline } from '../lib/workline'

const COPY = {
  zh: {
    title: '我的 Freelancer', sub: '你名下的人才:负载与签到一览。三个入口:清单验收、完整档案、直接派任务。',
    empty: '名下还没有人。去', poolLink: '人才库', empty2: '认领无归属的 freelancer。',
    board: '清单', profile: '档案', assign: '派任务', search: '按名字/联系方式搜索…', ciNone: '今日未签到', ciPending: '确认签到', ciDone: '签到已复核 ✓',
    active: '活跃', done: '完成', suspended: '已暂停',
  },
  en: {
    title: 'My freelancers', sub: 'Your roster with load and check-ins at a glance. Three doors: checklist, full profile, assign a task.',
    empty: 'Nobody yet. Claim unowned freelancers in the', poolLink: 'Pool', empty2: '.',
    board: 'Checklist', profile: 'Profile', assign: 'Assign task', search: 'Search by name / contact…', ciNone: 'No check-in today', ciPending: 'Confirm check-in', ciDone: 'Check-in confirmed ✓',
    active: 'active', done: 'done', suspended: 'Paused',
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
  useFocusFlash()
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<PoolRow[]>([])
  const [q, setQ] = useState('')
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
    if (e) { setError(e.message); setLoaded(true); return }
    const list = (data ?? []) as PoolRow[]
    setRows(list)
    void loadCi(list.map(r => r.id))
    setLoaded(true)
  }, [am, loadCi])

  useEffect(() => { void load() }, [load])

  if (!am || !loaded) return <p className="text-muted">…</p>

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter(r => [r.display_name, r.full_name, r.contact_whatsapp, r.contact_telegram]
        .some(v => (v ?? '').toLowerCase().includes(needle)))
    : rows

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      <div className="mb-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">
            {t.empty} <Link to="/am/pool" className="text-petrol underline underline-offset-2">{t.poolLink}</Link> {t.empty2}
          </p>
        ) : shown.map(r => (
          <div key={r.id} id={`f-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3.5 last:border-b-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <Link to={`/am/pool/${r.id}`} className="text-sm font-medium text-ink hover:text-petrol">
                  {r.display_name ?? r.id.slice(0, 8)}
                </Link>
                <StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} />
                {r.is_suspended && <StatusBadge status="pending" label={t.suspended} />}
              </div>
              <p className="mt-1 font-mono text-xs text-faint">
                {r.active_tasks} {t.active} · {r.completed_tasks} {t.done}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {ci[r.id] === 'confirmed' ? (
                <span className="rounded-full border border-verified-border bg-verified-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-verified-text">{t.ciDone}</span>
              ) : ci[r.id] === 'pending' ? (
                <Button className="px-3 py-1.5 text-xs" disabled={ciBusy === r.id} onClick={() => void confirmCi(r.id)}>
                  {ciBusy === r.id ? '…' : t.ciPending}
                </Button>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{t.ciNone}</span>
              )}
              <Link to={`/am/f/${r.id}`}><Button className="px-3 py-1.5 text-xs">{t.board}</Button></Link>
              <Link to={`/am/pool/${r.id}`}><Button variant="ghost" className="px-3 py-1.5 text-xs">{t.profile}</Button></Link>
              <Link to={`/am/tasks/new?fl=${r.id}`}><Button variant="ghost" className="px-3 py-1.5 text-xs">{t.assign}</Button></Link>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
