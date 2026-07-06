import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Inbox, ListChecks, Wallet, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { supabase } from '../lib/supabase'

const TABS = [
  { to: '/offers', label: 'Offers', icon: Inbox },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/earnings', label: 'Earnings', icon: Wallet },
  { to: '/me', label: 'Profile', icon: UserRound },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'

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
              isAdmin ? (
                <>
                  <Link to="/admin" className="font-mono text-xs uppercase tracking-wider text-petrol transition hover:text-petrol-hover">Console</Link>
                  <button onClick={signOut} className="text-muted transition hover:text-ink">Sign out</button>
                </>
              ) : (
                <>
                  {/* Desktop nav — the bottom tab bar covers these on mobile */}
                  {TABS.map(t => (
                    <NavLink
                      key={t.to}
                      to={t.to}
                      className={({ isActive }) =>
                        `hidden transition sm:inline ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
                      }
                    >
                      {t.label}
                    </NavLink>
                  ))}
                  <button onClick={signOut} className="hidden text-muted transition hover:text-ink sm:inline">Sign out</button>
                </>
              )
            ) : (
              <>
                <Link to="/login" className="text-muted transition hover:text-ink">Log in</Link>
                <Link to="/signup" className="rounded-lg bg-petrol px-3.5 py-1.5 font-display text-sm font-medium text-paper transition hover:bg-petrol-hover">Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className={`mx-auto max-w-4xl px-5 py-8 sm:py-10 ${session && !isAdmin ? 'pb-24 sm:pb-10' : ''}`}>
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      {session && !isAdmin && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-hair bg-surface/95 backdrop-blur sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex max-w-4xl">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className="flex flex-1 flex-col items-center gap-1 py-2.5"
                >
                  {({ isActive }) => (
                    <>
                      <span className={`h-1 w-1 rounded-full ${isActive ? 'bg-petrol' : 'bg-transparent'}`} />
                      <Icon size={20} strokeWidth={1.75} className={isActive ? 'text-petrol' : 'text-faint'} />
                      <span className={`font-mono text-[10px] uppercase tracking-wider ${isActive ? 'text-petrol' : 'text-faint'}`}>
                        {t.label}
                      </span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
