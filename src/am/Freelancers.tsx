import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PoolRow } from '../types/database'
import { PageHeading, Card, Alert, Button, StatusBadge } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

const COPY = {
  zh: {
    title: '我的 Freelancer', sub: '你名下的人才:负载、评分、strike 一览。三个入口:清单验收、完整档案、直接派任务。',
    empty: '名下还没有人。去', poolLink: '人才库', empty2: '认领无归属的 freelancer。',
    board: '清单', profile: '档案', assign: '派任务',
    active: '活跃', done: '完成', qsa: '质/速/态', strikes: 'strikes', suspended: '已暂停',
  },
  en: {
    title: 'My freelancers', sub: 'Your roster with load, ratings and strikes at a glance. Three doors: checklist, full profile, assign a task.',
    empty: 'Nobody yet. Claim unowned freelancers in the', poolLink: 'Pool', empty2: '.',
    board: 'Checklist', profile: 'Profile', assign: 'Assign task',
    active: 'active', done: 'done', qsa: 'Q/S/A', strikes: 'strikes', suspended: 'Paused',
  },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

export default function AmFreelancers() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<PoolRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!am) return
    const { data, error: e } = await supabase.from('freelancer_pool')
      .select('*').eq('managed_by', am.id).order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoaded(true); return }
    setRows((data ?? []) as PoolRow[])
    setLoaded(true)
  }, [am])

  useEffect(() => { void load() }, [load])

  if (!am || !loaded) return <p className="text-muted">…</p>

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">
            {t.empty} <Link to="/am/pool" className="text-petrol underline underline-offset-2">{t.poolLink}</Link> {t.empty2}
          </p>
        ) : rows.map(r => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3.5 last:border-b-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <Link to={`/am/pool/${r.id}`} className="text-sm font-medium text-ink hover:text-petrol">
                  {r.display_name ?? r.id.slice(0, 8)}
                </Link>
                <StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} />
                {r.is_suspended && <StatusBadge status="pending" label={t.suspended} />}
              </div>
              <p className="mt-1 font-mono text-xs text-faint">
                {r.active_tasks} {t.active} · {r.completed_tasks} {t.done} · {t.qsa} {r.avg_quality ?? '–'}/{r.avg_speed ?? '–'}/{r.avg_attitude ?? '–'} · {r.strikes_count} {t.strikes}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
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
