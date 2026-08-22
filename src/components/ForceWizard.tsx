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
    s2t: '完成增强认证', s2b: '收款方式已就绪。完成 Enhanced KYC 后即可解锁全部任务与奖励;提交后即可先行使用钱包。',
    s2c: '去完成 Enhanced KYC',
    step: (n: number) => `第 ${n} 步 · 共 2 步`,
  },
  en: {
    s1t: 'Set up payout', s1b: 'Base verification passed. Add a payout method first — tasks and settlement unlock after this.',
    s1c: 'Add payout method',
    s2t: 'Finish enhanced verification', s2b: 'Payout is ready. Complete Enhanced KYC to unlock all tasks and bonuses; your wallet opens right after you submit.',
    s2c: 'Complete Enhanced KYC',
    step: (n: number) => `Step ${n} of 2`,
  },
}

interface Snap {
  role: string
  kyc_status: string
  enhanced_kyc_status: string
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
        .select('role, kyc_status, enhanced_kyc_status, payout_address, payout_paypal_email, must_change_password')
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
  const enh = snap.enhanced_kyc_status
  const stage: 1 | 2 | 0 = !hasPayout ? 1 : (enh === 'none' || enh === 'rejected') ? 2 : 0
  if (stage === 0) return null

  const exempt = stage === 1 ? '/me' : '/enhanced-kyc'
  if (pathname.startsWith(exempt)) return null

  const title = stage === 1 ? t.s1t : t.s2t
  const body = stage === 1 ? t.s1b : t.s2b
  const cta = stage === 1 ? t.s1c : t.s2c

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-6 shadow-[0_24px_64px_rgba(26,32,30,0.24)]">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{t.step(stage)}</p>
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-1.5 w-6 rounded-full bg-petrol" />
          <span className={`h-1.5 w-6 rounded-full ${stage === 2 ? 'bg-petrol' : 'bg-hair'}`} />
        </div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <Button className="mt-5 w-full" onClick={() => navigate(exempt)}>{cta}</Button>
      </div>
    </div>
  )
}
