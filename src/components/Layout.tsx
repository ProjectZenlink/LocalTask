import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ListChecks, Wallet, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import FreelancerBell from './FreelancerBell'
import { supabase } from '../lib/supabase'
import { ConfirmDialog } from './dialogs'
import AmContactDock from './AmContactDock'
import { useState } from 'react'
import { I18nProvider, useI18n } from '../lib/i18n'

const COPY = {
  en: {
    tabs: { tasks: 'Tasks', wallet: 'Wallet', me: 'Profile' },
    console: 'Console', workspace: 'Workspace', signOut: 'Sign out',
    login: 'Log in', signup: 'Sign up',
    outTitle: 'Sign out?', outConfirm: 'Sign out', outCancel: 'Cancel',
  },
  zh: {
    tabs: { tasks: '我的任务', wallet: '钱包', me: '我的资料' },
    console: '控制台', workspace: '工作台', signOut: '退出登录',
    login: '登录', signup: '注册',
    outTitle: '退出登录？', outConfirm: '退出', outCancel: '取消',
  },
}

function LayoutInner({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const isAm = profile?.role === 'am'
  const [askOut, setAskOut] = useState(false)
  const { lang, toggle } = useI18n()
  const t = COPY[lang]

  const TABS = [
    { to: '/tasks', label: t.tabs.tasks, icon: ListChecks },
    { to: '/earnings', label: t.tabs.wallet, icon: Wallet },
    { to: '/me', label: t.tabs.me, icon: UserRound },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight text-ink"><img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />LocalTask</Link>
          <nav className="flex items-center gap-5 text-sm">
            <button onClick={toggle} className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            {session ? (
              isAdmin || isAm ? (
                <>
                  <Link to={isAdmin ? '/admin' : '/am'} className="font-mono text-xs uppercase tracking-wider text-petrol transition hover:text-petrol-hover">{isAdmin ? t.console : t.workspace}</Link>
                  <button onClick={() => setAskOut(true)} className="text-muted transition hover:text-ink">{t.signOut}</button>
                </>
              ) : (
                <>
                  <FreelancerBell />
                  {/* Desktop nav — the bottom tab bar covers these on mobile */}
                  {TABS.map(tb => (
                    <NavLink
                      key={tb.to}
                      to={tb.to}
                      className={({ isActive }) =>
                        `hidden transition sm:inline ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
                      }
                    >
                      {tb.label}
                    </NavLink>
                  ))}
                  <button onClick={() => setAskOut(true)} className="hidden text-muted transition hover:text-ink sm:inline">{t.signOut}</button>
                </>
              )
            ) : (
              <>
                <Link to="/login" className="text-muted transition hover:text-ink">{t.login}</Link>
                <Link to="/signup" className="rounded-lg bg-petrol px-3.5 py-1.5 font-display text-sm font-medium text-paper transition hover:bg-petrol-hover">{t.signup}</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className={`mx-auto max-w-4xl px-5 py-8 sm:py-10 ${session && !isAdmin && !isAm ? 'pb-24 sm:pb-10' : ''}`}>
        {children}
      </main>

      <ConfirmDialog
        open={askOut}
        title={t.outTitle}
        confirmLabel={t.outConfirm}
        cancelLabel={t.outCancel}
        danger={false}
        onConfirm={() => { setAskOut(false); void signOut() }}
        onClose={() => setAskOut(false)}
      />

      {/* AM 联系浮窗:仅 freelancer 会话显示 */}
      {session && !isAdmin && !isAm && <AmContactDock />}

      {/* Mobile bottom tab bar */}
      {session && !isAdmin && !isAm && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-hair bg-surface/95 backdrop-blur sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex max-w-4xl">
            {TABS.map(tb => {
              const Icon = tb.icon
              return (
                <NavLink
                  key={tb.to}
                  to={tb.to}
                  className="flex flex-1 flex-col items-center gap-1 py-2.5"
                >
                  {({ isActive }) => (
                    <>
                      <span className={`h-1 w-1 rounded-full ${isActive ? 'bg-petrol' : 'bg-transparent'}`} />
                      <Icon size={20} strokeWidth={1.75} className={isActive ? 'text-petrol' : 'text-faint'} />
                      <span className={`font-mono text-[10px] uppercase tracking-wider ${isActive ? 'text-petrol' : 'text-faint'}`}>
                        {tb.label}
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

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <LayoutInner>{children}</LayoutInner>
    </I18nProvider>
  )
}
