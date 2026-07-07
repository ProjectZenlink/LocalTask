import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AdminLangProvider, useLang } from './i18n'
import { ConfirmDialog } from './bits'

const NAV = [
  { to: '/admin/tasks', zh: '任务', en: 'Tasks' },
  { to: '/admin/ams', zh: '账户经理', en: 'AMs' },
  { to: '/admin/pool', zh: '人才池', en: 'Pool' },
  { to: '/admin/kyc', zh: 'KYC 审核', en: 'KYC' },
]

function Shell() {
  const { lang, toggle } = useLang()
  const navigate = useNavigate()
  const [askOut, setAskOut] = useState(false)

  // 惰性过期:控制台打开时清一次超时 offer(任务自动退回池子)
  useEffect(() => { void supabase.rpc('expire_stale_offers') }, [])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-hair bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
          <Link to="/admin" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight text-ink">
            <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
            LocalTask <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">{lang === 'zh' ? '控制台' : 'Console'}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `transition ${isActive ? 'text-ink font-medium' : 'text-muted hover:text-ink'}`}
              >
                {lang === 'zh' ? n.zh : n.en}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <button onClick={toggle} className="rounded-lg border border-hair px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:text-ink">
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button onClick={() => setAskOut(true)} className="text-muted transition hover:text-ink">
              {lang === 'zh' ? '退出' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <Outlet />
      </main>
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
  )
}

export default function AdminLayout() {
  return (
    <AdminLangProvider>
      <Shell />
    </AdminLangProvider>
  )
}
