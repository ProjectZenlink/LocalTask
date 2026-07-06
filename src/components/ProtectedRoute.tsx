import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { supabase } from '../lib/supabase'
import { Card, Button, PageHeading } from './ui'

function BannedScreen() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeading>Account suspended</PageHeading>
      <Card className="p-5">
        <p className="text-sm text-muted">
          This account has been suspended for violating LocalTask's rules. If you believe this is a mistake, contact support.
        </p>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  )
}

export default function ProtectedRoute({
  children,
  adminOnly = false,
  freelancerOnly = false,
  requireOnboarded = false,
}: {
  children: ReactNode
  adminOnly?: boolean
  /** Freelancer-side pages bounce admins to the console — full role separation. */
  freelancerOnly?: boolean
  /** Main tabs require a completed profile; onboarding pages don't. */
  requireOnboarded?: boolean
}) {
  const { session, loading } = useAuth()
  const { profile, loading: pLoading } = useProfile()

  if (loading || pLoading) return <div className="p-8 text-muted">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (profile?.is_banned) return <BannedScreen />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />
  if (freelancerOnly && profile?.role === 'admin') return <Navigate to="/admin" replace />
  if (requireOnboarded && profile && !profile.display_name) return <Navigate to="/build-profile" replace />
  return <>{children}</>
}
