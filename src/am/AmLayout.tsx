import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getDockOpen, subscribeDock } from '../lib/dockState'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { bjDay } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import type { AccountManager } from '../types/database'
import { AdminLangProvider, useLang } from '../admin/i18n'
import { ConfirmDialog } from '../components/dialogs'
import Bell from './Bell'
import Masthead from '../components/Masthead'
import { useUnread } from '../components/useUnread'
import { onWorkline } from '../lib/workline'
import AmTodayDock from './AmTodayDock'
import MessagesDock from '../components/MessagesDock'
import { isClaimable, HEARTBEAT_SECONDS } from '../lib/leads'

const AmContext = createContext<{ am: AccountManager | null; refresh: () => Promise<void> }>({ am: null, refresh: async () => {} })
export function useAm() { return useContext(AmContext) }

// 按工作流分组:日常区 | 审核与资料区 | 个人区
const NAV_GROUPS = [
  [
    { to: '/am/my', zh: '我的 Freelancer', en: 'My freelancers', badge: 'ci' },
    { to: '/am/tasks', zh: '任务', en: 'Tasks' },
    { to: '/am/pool', zh: '人才库', en: 'Pool' },
    { to: '/am/leads', zh: '线索', en: 'Leads', badge: 'leads' },
  ],
  [
    { to: '/am/payouts', zh: '提现', en: 'Payouts', badge: 'payout' },
    { to: '/am/kyc', zh: 'KYC 审核', en: 'KYC', badge: 'kyc' },
    { to: '/am/accounts', zh: '资料库', en: 'Library' },
  ],
  [
    { to: '/am/wallet', zh: '钱包', en: 'Wallet' },
    { to: '/am/me', zh: '我的资料', en: 'My profile' },
    { to: '/am/messages', zh: '消息', en: 'Messages', badge: true },
  ],
]

function Shell() {
  const { lang, toggle } = useLang()
  const { user } = useAuth()
  const navigate = useNavigate()
  // v77 并排工作区:统一状态源
  const [dockOpen, setDockOpen] = useState(getDockOpen)
  useEffect(() => subscribeDock(setDockOpen), [])
  const [am, setAm] = useState<AccountManager | null>(null)
  const [askOut, setAskOut] = useState(false)
  const unread = useUnread(!!user)
  const [payoutCount, setPayoutCount] = useState(0)
  const [ciCount, setCiCount] = useState(0)
  const [leadsCount, setLeadsCount] = useState(0)
  const [kycCount, setKycCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('account_managers').select('*').eq('user_id', user.id).maybeSingle()
    setAm((data ?? null) as AccountManager | null)
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  // 惰性过期:工作台打开时清一次超时 offer(任务自动退回池子;与控制台同款)
  useEffect(() => { void supabase.rpc('expire_stale_offers') }, [])
  // AM 心跳(v62):工作台在线期间每 60 秒一跳;在线判定 = 接收开关开 且 心跳 2 分钟内新鲜
  useEffect(() => {
    if (!user) return
    const beat = () => { void supabase.rpc('am_heartbeat') }
    beat()
    const timer = window.setInterval(beat, HEARTBEAT_SECONDS * 1000)
    return () => window.clearInterval(timer)
  }, [user])
  const { pathname } = useLocation()
  const loadBadges = useCallback(() => {
    if (!user) { setPayoutCount(0); return }
    supabase.from('payout_requests').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPayoutCount(count ?? 0))
    if (am) {
      supabase.from('checkins').select('user_id, freelancer:profiles!user_id!inner(id)', { count: 'exact', head: true })
        .eq('day', bjDay()).is('confirmed_at', null).eq('freelancer.managed_by', am.id)
        .then(({ count }) => setCiCount(count ?? 0))
      // 线索徽标(v62)= 我的未回新线索 + 池中可认领(惰性判定,与库侧 3 分钟常量同源)
      supabase.from('leads').select('id, status, first_reply_at, assigned_am, assigned_at')
        .eq('status', 'new').is('first_reply_at', null)
        .then(({ data }) => {
          const cand = (data ?? []) as { id: string; status: 'new'; first_reply_at: null; assigned_am: string | null; assigned_at: string | null }[]
          const mine = cand.filter(l => l.assigned_am === am.id).length
          const claimable = cand.filter(l => l.assigned_am !== am.id && isClaimable(l)).length
          setLeadsCount(mine + claimable)
        })
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('kyc_status', 'pending').eq('role', 'user').eq('managed_by', am.id)
        .then(({ count: kc }) => setKycCount(kc ?? 0))
    }
  }, [user, am])
  // 切页刷新 + 站内处理动作(workline)即时刷新:导航徽标与「今日待办」同步呼吸(v59)
  useEffect(() => { loadBadges() }, [loadBadges, pathname])
  useEffect(() => onWorkline(() => loadBadges()), [loadBadges])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <AmContext.Provider value={{ am, refresh }}>
      <div className="min-h-screen">
        <Masthead
          home="/am"
          badge="AM"
          groups={NAV_GROUPS.map(g => g.map(n => ({ to: n.to, label: lang === 'zh' ? n.zh : n.en, count: 'badge' in n ? (n.badge === 'payout' ? payoutCount : n.badge === 'ci' ? ciCount : n.badge === 'leads' ? leadsCount : n.badge === 'kyc' ? kycCount : unread) : undefined })))}
          right={
            <>
              <button onClick={toggle} className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
                {lang === 'zh' ? 'EN' : '中文'}
              </button>
              {am && <Bell amId={am.id} />}
              {am && <span className="hidden font-display text-sm font-medium tracking-tight text-ink sm:inline">{am.name}</span>}
              <button onClick={() => setAskOut(true)} className="text-muted transition hover:text-ink">
                {lang === 'zh' ? '退出' : 'Sign out'}
              </button>
            </>
          }
        />
        <div className={`transition-[padding] duration-300 ${dockOpen ? 'lg:pr-[400px]' : ''}`}>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet />
        </main>
        </div>
        {am && <AmTodayDock amId={am.id} />}
        <MessagesDock myRole="am" />
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
