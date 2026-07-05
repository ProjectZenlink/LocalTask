import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../types/database'
import { PageHeading, Card, Eyebrow, StatusBadge, Button } from '../components/ui'

function Row({ label, badge, action, last }: { label: string; badge: ReactNode; action?: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${last ? '' : 'border-b border-hair'}`}>
      <span className="text-sm text-ink">{label}</span>
      <div className="flex items-center gap-3">
        {badge}
        {action}
      </div>
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => {
        const p = (data ?? null) as Profile | null
        setProfile(p)
        setLoaded(true)
        if (p && !p.display_name) navigate('/build-profile')
      })
  }, [user, navigate])

  if (!loaded) return <div className="text-muted">Loading…</div>

  const kyc = profile?.kyc_status ?? 'none'
  const kycBadge: { status: 'verified' | 'pending' | 'unverified'; label: string } =
    kyc === 'verified' ? { status: 'verified', label: 'Verified' }
    : kyc === 'pending' ? { status: 'pending', label: 'Under review' }
    : kyc === 'rejected' ? { status: 'unverified', label: 'Rejected' }
    : { status: 'unverified', label: 'Not started' }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading>Welcome{profile?.display_name ? `, ${profile.display_name}` : ''}</PageHeading>

      <Card className="p-5">
        <Eyebrow>Get verified</Eyebrow>
        <Row label="Profile" badge={<StatusBadge status="verified" label="Complete" />} />
        <Row label="Phone number" badge={<StatusBadge status="unverified" label="Coming soon" />} />
        <Row
          label="Identity verification"
          badge={<StatusBadge status={kycBadge.status} label={kycBadge.label} />}
          action={
            kyc === 'none' || kyc === 'rejected'
              ? <Link to="/onboarding/kyc"><Button className="px-3.5 py-1.5">{kyc === 'rejected' ? 'Re-submit' : 'Start'}</Button></Link>
              : undefined
          }
          last
        />
      </Card>

      <p className="mt-6 text-sm text-faint">
        Once your identity is verified, you'll be able to post tasks and take on work.
      </p>
    </div>
  )
}
