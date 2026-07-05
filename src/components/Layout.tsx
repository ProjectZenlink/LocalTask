import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/" className="font-display text-lg font-medium tracking-tight text-ink">LocalTask</Link>
          <nav className="flex items-center gap-5 text-sm">
            {session ? (
              <>
                <Link to="/settings" className="text-muted transition hover:text-ink">Settings</Link>
                <button onClick={signOut} className="text-muted transition hover:text-ink">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-muted transition hover:text-ink">Log in</Link>
                <Link to="/signup" className="rounded-lg bg-petrol px-3.5 py-1.5 font-display text-sm font-medium text-paper transition hover:bg-petrol-hover">Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10">{children}</main>
    </div>
  )
}
