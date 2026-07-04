import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../types/database'
import { PageHeading, Card, Eyebrow, StatusBadge } from '../components/ui'

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
  const badge: { status: 'verified' | 'pending' | 'unverified'; label: string } =
    kyc === 'verified' ? { status: 'verified', label: 'Verified' }
    : kyc === 'pending' ? { status: 'pending', label: 'Under review' }
    : kyc === 'rejected' ? { status: 'unverified', label: 'Rejected' }
    : { status: 'unverified', label: 'Not started' }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading>Welcome{profile?.display_name ? `, ${profile.display_name}` : ''}</PageHeading>
      <Card className="p-5">
        <Eyebrow>Account status</Eyebrow>
        <div className="flex items-center justify-between border-b border-hair py-2.5">
          <span className="text-sm text-muted">Identity verification</span>
          <StatusBadge status={badge.status} label={badge.label} />
        </div>
        <div className="flex items-center justify-between pt-3">
          <span className="text-sm text-muted">Payout addresses</span>
          <Link to="/settings" className="text-sm text-petrol underline underline-offset-2">Manage</Link>
        </div>
      </Card>
      <p className="mt-6 text-sm text-faint">
        Task posting and browsing will open once identity verification goes live (coming next).
      </p>
    </div>
  )
}
