import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ListChecks, Wallet, UserRound, MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import KycBanner from './KycBanner'
import FreelancerBell from './FreelancerBell'
import { supabase } from '../lib/supabase'
import { ConfirmDialog } from './dialogs'
import AmContactDock from './AmContactDock'
import { useUnread } from './useUnread'
import Milestone from './Milestone'
import LogoMark from './LogoMark'
import { useState, useEffect } from 'react'
import { I18nProvider, useI18n } from '../lib/i18n'

const COPY = {
  en: {
    tabs: { tasks: 'Tasks', wallet: 'Wallet', messages: 'Messages', me: 'Profile' },
    console: 'Console', workspace: 'Workspace', signOut: 'Sign out',
    login: 'Log in', signup: 'Sign up',
    outTitle: 'Sign out?', outConfirm: 'Sign out', outCancel: 'Cancel',
  },
  zh: {
    tabs: { tasks: '我的任务', wallet: '钱包', messages: '消息', me: '我的资料' },
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
  const unread = useUnread(!!session && !isAdmin && !isAm && !!profile && profile.role === 'user')
  const [ciToast, setCiToast] = useState(false)
  useEffect(() => {
    if (!session || !profile || profile.role !== 'user') return
    const ch = supabase.channel('ci-toast')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'checkins' }, payload => {
        const row = payload.new as { user_id: string; confirmed_at: string | null }
        if (row.user_id === profile.id && row.confirmed_at) {
          setCiToast(true)
          setTimeout(() => setCiToast(false), 3200)
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [session, profile])
  const [askOut, setAskOut] = useState(false)
  const { lang, toggle } = useI18n()
  // v79:FR 界面锁定英文(中文暂屏蔽)
  useEffect(() => {
    if (profile?.role === 'user' && lang !== 'en') toggle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, lang])
  const t = COPY[lang]

  const TABS = [
    { to: '/tasks', label: t.tabs.tasks, icon: ListChecks, badge: 0 },
    { to: '/earnings', label: t.tabs.wallet, icon: Wallet, badge: 0 },
    { to: '/messages', label: t.tabs.messages, icon: MessageSquare, badge: unread },
    { to: '/me', label: t.tabs.me, icon: UserRound, badge: 0 },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-hair bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight text-ink"><LogoMark />LocalTask</Link>
          <nav className="flex items-center gap-5 text-sm">
            {profile?.role !== 'user' && (
              <button onClick={toggle} className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
                {lang === 'en' ? '中文' : 'EN'}
              </button>
            )}
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
                        `-mb-0.5 hidden border-b-2 pb-0.5 transition sm:inline ${isActive ? 'border-petrol font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`
                      }
                    >
                      {tb.label}
                      {tb.badge > 0 && (
                        <span className="ml-1 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">{tb.badge}</span>
                      )}
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
        {profile?.role === 'user' && profile.kyc_status === 'pending' && (
          <div className="mb-5"><KycBanner /></div>
        )}
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
      {session && !isAdmin && !isAm && <Milestone />}
      {ciToast && (
        <div className="ms-rise fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-verified-border bg-verified-bg px-4 py-2 font-mono text-xs text-verified-text shadow-sm">
          ✓ Check-in confirmed · streak counted
        </div>
      )}

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
                      <span className="relative">
                        <Icon size={20} strokeWidth={1.75} className={isActive ? 'text-petrol' : 'text-faint'} />
                        {tb.badge > 0 && (
                          <span className="absolute -right-2 -top-1 inline-flex min-w-[0.95rem] items-center justify-center rounded-full bg-petrol px-0.5 font-mono text-[9px] leading-[0.95rem] text-paper">{tb.badge}</span>
                        )}
                      </span>
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
