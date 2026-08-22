import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { Button } from './ui'

/** 里程碑庆祝卡(v50):KYC 通过 / Enhanced KYC 通过 / 首次被打款。
 *  一次性(localStorage 记忆),墨线勾画 ✓ + 光环脉冲,克制的仪式感。 */

type Kind = 'kyc' | 'ekyc' | 'paid'
const KEY: Record<Kind, string> = { kyc: 'lt_ms_kyc', ekyc: 'lt_ms_ekyc', paid: 'lt_ms_paid' }

const COPY = {
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
  const t = COPY.en[show]

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
          onClick={() => dismiss(false)}>{COPY.en.close}</button>
      </div>
    </div>
  )
}
