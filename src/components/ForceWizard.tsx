import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui'

/** v72 批Ⅳ:强制向导(硬阻断,无关闭钮 —— 决策2)。
 *  状态机纯派生,不吃事件:基础 KYC 已过而收款未备 → 阶段A;
 *  收款已备而增强认证未提交/被驳回 → 阶段B;其余放行。
 *  老用户卡在半途同样被接住;目标页本身豁免遮罩以便填表。 */

const COPY = {
  zh: {
    s1t: '开通收款', s1b: '基础认证已通过。请先添加收款方式——完成后才能接任务与结算。',
    s1c: '去添加收款方式',
    step: () => '开工前一步',
  },
  en: {
    s1t: 'Set up payout', s1b: 'Base verification passed. Add a payout method first — tasks and settlement unlock after this.',
    s1c: 'Add payout method',
    step: () => 'One step to go',
  },
}

interface Snap {
  role: string
  kyc_status: string
  payout_address: string | null
  payout_paypal_email: string | null
  must_change_password?: boolean
}

export default function ForceWizard() {
  const { user } = useAuth()
  const t = COPY.en  // v84.4:FR 界面中文下架 —— 向导恒英文,不随语言开关
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [snap, setSnap] = useState<Snap | null>(null)

  useEffect(() => {
    if (!user) { setSnap(null); return }
    let alive = true
    const pull = () => {
      void supabase.from('profiles')
        .select('role, kyc_status, payout_address, payout_paypal_email, must_change_password')
        .eq('id', user.id).maybeSingle()
        .then(({ data }) => { if (alive) setSnap((data as Snap | null) ?? null) })
    }
    pull()
    // v83:AM 过审即时推送 —— 订阅本人 profile 行,免手刷看到下一步
    const ch = supabase.channel(`profile-self-${user.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => pull())
      .subscribe()
    const onWake = () => { if (document.visibilityState === 'visible') pull() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      alive = false
      void supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [user, pathname])

  if (!user || !snap || snap.role !== 'user') return null
  if (snap.must_change_password) return null
  if (snap.kyc_status !== 'verified') return null

  const hasPayout = !!(snap.payout_address?.trim() || snap.payout_paypal_email?.trim())
  if (hasPayout) return null

  const exempt = '/me'
  if (pathname.startsWith(exempt)) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-6 shadow-[0_24px_64px_rgba(26,32,30,0.24)]">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{t.step()}</p>
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-1.5 w-6 rounded-full bg-petrol" />
        </div>
        <h2 className="font-display text-lg font-semibold text-ink">{t.s1t}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t.s1b}</p>
        <Button className="mt-5 w-full" onClick={() => navigate(exempt)}>{t.s1c}</Button>
      </div>
    </div>
  )
}
