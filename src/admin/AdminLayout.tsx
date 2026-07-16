import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AdminLangProvider, useLang } from './i18n'
import { ConfirmDialog } from './bits'

const NAV = [
  { to: '/admin/kyc', zh: 'KYC 审核', en: 'KYC' },
  { to: '/admin/pool', zh: '人才库', en: 'Pool' },
  { to: '/admin/companies', zh: '公司', en: 'Companies' },
  { to: '/admin/accounts', zh: '账号', en: 'Accounts' },
  { to: '/admin/tasks', zh: '任务', en: 'Tasks' },
  { to: '/admin/review', zh: '提成复核', en: 'Review', badge: true },
  { to: '/admin/ams', zh: '账户经理', en: 'AMs' },
]

function Shell() {
  const { lang, toggle } = useLang()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [askOut, setAskOut] = useState(false)
  const [reviewCount, setReviewCount] = useState(0)

  // 惰性过期:控制台打开时清一次超时 offer(任务自动退回池子)
  useEffect(() => { void supabase.rpc('expire_stale_offers') }, [])

  // 提成复核待办角标（换页即刷新,处理完待办数字实时归零）
  useEffect(() => {
    supabase.from('platform_acceptances')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending_admin')
      .then(({ count }) => setReviewCount(count ?? 0))
  }, [pathname])

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
          <button onClick={toggle} className="rounded-lg border border-hair px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:text-ink">
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `transition ${isActive ? 'text-ink font-medium' : 'text-muted hover:text-ink'}`}
              >
                {lang === 'zh' ? n.zh : n.en}
                {n.badge && reviewCount > 0 && (
                  <span className="ml-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">
                    {reviewCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
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
