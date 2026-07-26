import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Masthead from '../components/Masthead'
import { AdminLangProvider, useLang } from './i18n'
import { ConfirmDialog } from './bits'

// 按工作流分组:日常区 | 审批区(角标) | 管理区
const NAV_GROUPS = [
  [
    { to: '/admin/tasks', zh: '任务', en: 'Tasks' },
    { to: '/admin/pool', zh: '人才库', en: 'Pool' },
    { to: '/admin/accounts', zh: '账号', en: 'Accounts' },
  ],
  [
    { to: '/admin/review', zh: '提成复核', en: 'Review', badge: 'review' as const },
    { to: '/admin/kyc', zh: 'KYC 审核', en: 'KYC', badge: 'kyc' as const },
  ],
  [
    { to: '/admin/companies', zh: '公司', en: 'Companies' },
    { to: '/admin/ams', zh: '账户经理', en: 'AMs' },
  ],
]

function Shell() {
  const { lang, toggle } = useLang()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [askOut, setAskOut] = useState(false)
  const [reviewCount, setReviewCount] = useState(0)
  const [kycCount, setKycCount] = useState(0)

  // 惰性过期:控制台打开时清一次超时 offer(任务自动退回池子)
  useEffect(() => { void supabase.rpc('expire_stale_offers') }, [])

  // 提成复核待办角标（换页即刷新,处理完待办数字实时归零）
  useEffect(() => {
    supabase.from('platform_acceptances')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending_admin')
      .then(({ count }) => setReviewCount(count ?? 0))
    supabase.from('kyc_submissions')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setKycCount(count ?? 0))
  }, [pathname])

  const { user } = useAuth()
  const [meName, setMeName] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('display_name, full_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        const d = data as { display_name: string | null; full_name: string | null } | null
        setMeName(d?.display_name || d?.full_name || user.email?.split('@')[0] || null)
      })
  }, [user])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen">
      <Masthead
        home="/admin"
        badge="Admin"
        groups={NAV_GROUPS.map(g => g.map(n => ({
          to: n.to,
          label: lang === 'zh' ? n.zh : n.en,
          count: 'badge' in n ? (n.badge === 'review' ? reviewCount : kycCount) : undefined,
        })))}
        right={
          <>
            <button onClick={toggle} className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            {meName && <span className="hidden font-display text-sm font-medium tracking-tight text-ink sm:inline">{meName}</span>}
            <button onClick={() => setAskOut(true)} className="text-muted transition hover:text-ink">
              {lang === 'zh' ? '退出' : 'Sign out'}
            </button>
          </>
        }
      />
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
