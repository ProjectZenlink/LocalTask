import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Masthead from '../components/Masthead'
import AdminTodoDock from './AdminTodoDock'
import { useUnread } from '../components/useUnread'
import { onWorkline } from '../lib/workline'
import { AdminLangProvider, useLang } from './i18n'
import { ConfirmDialog } from './bits'
import { isClaimable } from '../lib/leads'

// 按工作流分组:日常区 | 审批区(角标) | 管理区
const NAV_GROUPS = [
  [
    { to: '/admin/tasks', zh: '任务', en: 'Tasks' },
    { to: '/admin/pool', zh: '人才库', en: 'Pool' },
    { to: '/admin/leads', zh: '线索', en: 'Leads', badge: 'leads' as const },
  ],
  [
    { to: '/admin/kyc', zh: 'KYC 审核', en: 'KYC', badge: 'kyc' as const },
    { to: '/admin/payouts', zh: '提现', en: 'Payouts' },
    { to: '/admin/accounts', zh: '资料库', en: 'Library' },
  ],
  [
    { to: '/admin/review', zh: '提成复核', en: 'Review', badge: 'review' as const },
    { to: '/admin/ams', zh: '账户经理', en: 'AMs' },
  ],
  [
    { to: '/admin/me', zh: '我的资料', en: 'My profile' },
    { to: '/admin/messages', zh: '消息', en: 'Messages', badge: 'chat' as const },
  ],
]

function Shell() {
  const { lang, toggle } = useLang()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [askOut, setAskOut] = useState(false)
  const [reviewCount, setReviewCount] = useState(0)
  const [kycCount, setKycCount] = useState(0)
  const [leadsCount, setLeadsCount] = useState(0)

  // 惰性过期:控制台打开时清一次超时 offer(任务自动退回池子)
  useEffect(() => { void supabase.rpc('expire_stale_offers') }, [])

  // 提成复核/KYC 角标:换页刷新 + 站内处理动作(workline)即时刷新(v60,与 AM 端同一机制)
  const loadBadges = useCallback(() => {
    supabase.from('platform_acceptances')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending_admin')
      .then(({ count }) => setReviewCount(count ?? 0))
    supabase.from('kyc_submissions')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setKycCount(count ?? 0))
    // 待认领线索(v62):惰性判定,与 AM 端同一常量
    supabase.from('leads').select('id, status, first_reply_at, assigned_am, assigned_at')
      .eq('status', 'new').is('first_reply_at', null)
      .then(({ data }) => {
        const cand = (data ?? []) as { id: string; status: 'new'; first_reply_at: null; assigned_am: string | null; assigned_at: string | null }[]
        setLeadsCount(cand.filter(l => isClaimable(l)).length)
      })
  }, [])
  useEffect(() => { loadBadges() }, [loadBadges, pathname])
  useEffect(() => onWorkline(() => loadBadges()), [loadBadges])

  const { user } = useAuth()
  const unread = useUnread(!!user)
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
          count: 'badge' in n ? (n.badge === 'review' ? reviewCount : n.badge === 'kyc' ? kycCount : n.badge === 'leads' ? leadsCount : unread) : undefined,
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
        <AdminTodoDock />
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
