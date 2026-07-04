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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">LocalTask</Link>
          <nav className="flex items-center gap-4 text-sm">
            {session ? (
              <>
                <Link to="/settings" className="text-gray-600 hover:text-gray-900">Settings</Link>
                <button onClick={signOut} className="text-gray-600 hover:text-gray-900">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-600 hover:text-gray-900">Log in</Link>
                <Link to="/signup" className="rounded bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700">Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  )
}
