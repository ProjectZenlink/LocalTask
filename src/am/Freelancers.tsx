import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PLATFORMS } from '../types/database'
import { PageHeading, Card, StatusBadge } from '../components/ui'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

interface Row { id: string; display_name: string | null; kyc_status: string; open_to_work: boolean }

const COPY = {
  zh: { title: '我的 Freelancer', sub: '你名下的人才。点进去看八项清单、验收和账号资料。',
        empty: '名下还没有人。去', poolLink: '人才库', empty2: '认领无归属的 freelancer。', accepted: '已验收' },
  en: { title: 'My freelancers', sub: 'People you manage. Open one for the 8-item checklist, acceptance and account records.',
        empty: 'Nobody yet. Claim unowned freelancers in the', poolLink: 'Pool', empty2: '.', accepted: 'accepted' },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

export default function AmFreelancers() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<Row[]>([])
  const [accCount, setAccCount] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!am) return
    const [p, a] = await Promise.all([
      supabase.from('profiles').select('id, display_name, kyc_status, open_to_work')
        .eq('managed_by', am.id).eq('role', 'user').order('created_at', { ascending: false }),
      supabase.from('platform_acceptances').select('freelancer_id').eq('am_id', am.id),
    ])
    setRows((p.data ?? []) as Row[])
    const m: Record<string, number> = {}
    for (const r of (a.data ?? []) as { freelancer_id: string }[]) m[r.freelancer_id] = (m[r.freelancer_id] ?? 0) + 1
    setAccCount(m)
    setLoaded(true)
  }, [am])

  useEffect(() => { void load() }, [load])

  if (!am || !loaded) return <p className="text-muted">…</p>

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      <Card className="p-5">
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-faint">
            {t.empty} <Link to="/am/pool" className="text-petrol underline underline-offset-2">{t.poolLink}</Link>{t.empty2}
          </p>
        ) : rows.map(r => (
          <Link key={r.id} to={`/am/f/${r.id}`} className="block">
            <div className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink">{r.display_name ?? r.id.slice(0, 8)}</span>
                <StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} />
              </div>
              <span className="font-mono text-xs text-muted">{accCount[r.id] ?? 0} / {PLATFORMS.length} {t.accepted}</span>
            </div>
          </Link>
        ))}
      </Card>
    </div>
  )
}
