import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { Profile } from '../types/database'

interface ProfileState {
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
}

const ProfileContext = createContext<ProfileState>({ profile: null, loading: true, refresh: async () => {} })

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile((data ?? null) as Profile | null)
    setLoading(false)
  }, [user])

  useEffect(() => { setLoading(true); void refresh() }, [refresh])

  return <ProfileContext.Provider value={{ profile, loading, refresh }}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  return useContext(ProfileContext)
}
