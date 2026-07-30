import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { Button } from './ui'
import { useI18n } from '../lib/i18n'

/** 里程碑庆祝卡(v50):KYC 通过 / Enhanced KYC 通过 / 首次被打款。
 *  一次性(localStorage 记忆),墨线勾画 ✓ + 光环脉冲,克制的仪式感。 */

type Kind = 'kyc' | 'ekyc' | 'paid'
const KEY: Record<Kind, string> = { kyc: 'lt_ms_kyc', ekyc: 'lt_ms_ekyc', paid: 'lt_ms_paid' }

const COPY = {
  zh: {
    kyc: { h: '恭喜,平台注册完成', b: '身份验证已通过,你现在可以接任务了。', btn: '联系我的账户经理' },
    ekyc: { h: '注册奖励已解锁', b: 'Enhanced KYC 已通过——$2.99 注册奖励可以打包提现了。', btn: '去钱包提现' },
    paid: { h: '钱在路上了', b: '你的提现工单已打款,注意查收。确认到账只是回执,不影响任何流程。', btn: '查看工单' },
    close: '知道了',
  },
  en: {
    kyc: { h: 'Registration complete', b: 'Identity verified — you can now take tasks.', btn: 'Message my AM' },
    ekyc: { h: 'Signup bonus unlocked', b: 'Enhanced KYC approved — your $2.99 bonus is ready to withdraw.', btn: 'Open wallet' },
    paid: { h: 'Money is on the way', b: 'Your payout has been sent. Confirming receipt is just an acknowledgement — nothing is blocked.', btn: 'View payout' },
    close: 'Got it',
  },
}
const GOTO: Record<Kind, string> = { kyc: '/messages', ekyc: '/earnings', paid: '/earnings' }

export default function Milestone() {
  const { profile } = useProfile()
  const { lang } = useI18n()
  const nav = useNavigate()
  const [show, setShow] = useState<Kind | null>(null)

  useEffect(() => {
    if (!profile || profile.role !== 'user') return
    let alive = true
    void (async () => {
      if (profile.kyc_status === 'verified' && !localStorage.getItem(KEY.kyc)) {
        if (alive) setShow('kyc'); return
      }
      if (profile.enhanced_kyc_status === 'verified' && !localStorage.getItem(KEY.ekyc)) {
        if (alive) setShow('ekyc'); return
      }
      if (!localStorage.getItem(KEY.paid)) {
        const { count } = await supabase.from('payout_requests')
          .select('id', { count: 'exact', head: true })
          .in('status', ['paid_pending_confirm', 'completed'])
        if (alive && (count ?? 0) > 0) setShow('paid')
      }
    })()
    return () => { alive = false }
  }, [profile])

  if (!show) return null
  const t = COPY[lang][show]

  function dismiss(go: boolean) {
    localStorage.setItem(KEY[show as Kind], '1')
    const target = GOTO[show as Kind]
    setShow(null)
    if (go) nav(target)
  }

  return (
    <div className="ms-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4" onClick={() => dismiss(false)}>
      <div className="ms-rise w-full max-w-xs rounded-2xl border border-hair bg-surface p-6 text-center shadow-[0_24px_64px_rgba(26,32,30,0.25)]"
        onClick={e => e.stopPropagation()}>
        <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="ms-halo absolute inset-0 rounded-full border border-petrol/40" />
          <svg viewBox="0 0 64 64" className="h-16 w-16">
            <circle cx="32" cy="32" r="29" fill="none" stroke="var(--color-petrol, #244B4D)" strokeWidth="1.5" className="ms-ring" opacity="0.35" />
            <path d="M20 33 L28.5 41.5 L45 24" fill="none" stroke="var(--color-petrol, #244B4D)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="ms-check" />
          </svg>
        </span>
        <p className="mt-4 font-display text-lg font-medium text-ink">{t.h}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.b}</p>
        <Button className="mt-5 w-full" onClick={() => dismiss(true)}>{t.btn}</Button>
        <button className="mt-2.5 font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink"
          onClick={() => dismiss(false)}>{COPY[lang].close}</button>
      </div>
    </div>
  )
}
