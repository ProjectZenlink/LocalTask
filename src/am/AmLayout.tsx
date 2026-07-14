import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountManager } from '../types/database'
import { AdminLangProvider, useLang } from '../admin/i18n'
import { ConfirmDialog } from '../components/dialogs'
import Bell from './Bell'
import AmTodayDock from './AmTodayDock'

const AmContext = createContext<{ am: AccountManager | null; refresh: () => Promise<void> }>({ am: null, refresh: async () => {} })
export function useAm() { return useContext(AmContext) }

const NAV = [
  { to: '/am/my', zh: '我的 Freelancer', en: 'My freelancers' },
  { to: '/am/tasks', zh: '任务', en: 'Tasks' },
  { to: '/am/pool', zh: '人才库', en: 'Pool' },
  { to: '/am/kyc', zh: 'KYC 审核', en: 'KYC' },
  { to: '/am/wallet', zh: '钱包', en: 'Wallet' },
  { to: '/am/me', zh: '我的资料', en: 'My profile' },
]

function Shell() {
  const { lang, toggle } = useLang()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [am, setAm] = useState<AccountManager | null>(null)
  const [askOut, setAskOut] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('account_managers').select('*').eq('user_id', user.id).maybeSingle()
    setAm((data ?? null) as AccountManager | null)
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  // 惰性过期:工作台打开时清一次超时 offer(任务自动退回池子;与控制台同款)
  useEffect(() => { void supabase.rpc('expire_stale_offers') }, [])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <AmContext.Provider value={{ am, refresh }}>
      <div className="min-h-screen">
        <header className="border-b border-hair bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
            <Link to="/am" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight text-ink">
              <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
              LocalTask <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">{lang === 'zh' ? '工作台' : 'Workspace'}</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {NAV.map(n => (
                <NavLink key={n.to} to={n.to}
                  className={({ isActive }) => `transition ${isActive ? 'text-ink font-medium' : 'text-muted hover:text-ink'}`}>
                  {lang === 'zh' ? n.zh : n.en}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {am && <Bell amId={am.id} />}
              <button onClick={toggle} className="rounded-lg border border-hair px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:text-ink">
                {lang === 'zh' ? 'EN' : '中文'}
              </button>
              {am && <span className="hidden font-display text-sm font-medium tracking-tight text-ink sm:inline">{am.name}</span>}
              <button onClick={() => setAskOut(true)} className="text-muted transition hover:text-ink">
                {lang === 'zh' ? '退出' : 'Sign out'}
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet />
        </main>
        {am && <AmTodayDock amId={am.id} />}
        <ConfirmDialog
          open={askOut}
          title={lang === 'zh' ? '退出登录?' : 'Sign out?'}
          confirmLabel={lang === 'zh' ? '退出' : 'Sign out'}
          cancelLabel={lang === 'zh' ? '取消' : 'Cancel'}
          danger={false}
          onConfirm={() => { setAskOut(false); void signOut() }}
          onClose={() => setAskOut(false)}
        />
      </div>
    </AmContext.Provider>
  )
}

export default function AmLayout() {
  return (
    <AdminLangProvider>
      <Shell />
    </AdminLangProvider>
  )
}
