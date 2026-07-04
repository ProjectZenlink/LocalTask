import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../types/database'

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

  if (!loaded) return <div className="text-gray-500">Loading…</div>

  const kycLabel: Record<string, string> = {
    none: 'Not started', pending: 'Under review', verified: 'Verified', rejected: 'Rejected',
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">
        Welcome{profile?.display_name ? `, ${profile.display_name}` : ''}
      </h1>
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-gray-600">Identity verification</span>
          <span className="text-sm font-medium">{kycLabel[profile?.kyc_status ?? 'none']}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Payout addresses</span>
          <Link to="/settings" className="text-sm text-gray-900 underline">Manage</Link>
        </div>
      </div>
      <p className="mt-6 text-sm text-gray-500">
        Task posting and browsing will open once identity verification goes live (coming next).
      </p>
    </div>
  )
}
