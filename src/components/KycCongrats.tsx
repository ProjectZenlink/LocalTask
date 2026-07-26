import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

const COPY = {
  en: {
    eyebrow: 'Identity verified',
    title: 'You\u2019re in. Welcome to LocalTask.',
    body: 'Your identity check has been approved. Your signup bonus is already sitting in your wallet, and every task you complete lands there too \u2014 one button withdraws it all.',
    cta: 'Go to my wallet',
    later: 'Later',
  },
  zh: {
    eyebrow: '身份审核通过',
    title: '审核完成，欢迎正式加入。',
    body: '你的身份认证已通过。注册奖励已经躺在钱包里了，之后每个完成的任务报酬也都会进钱包——一个按钮统一提现。',
    cta: '去我的钱包',
    later: '稍后再说',
  },
}

/** 基础 KYC 审核通过后的一次性祝贺弹窗(m31 引导旅程第三步):CTA 直达钱包。 */
export default function KycCongrats() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [open, setOpen] = useState(false)

  const key = user ? `lt_kyc_congrats_${user.id}` : null

  useEffect(() => {
    if (!key || !profile) return
    if (profile.role !== 'user') return
    if (profile.kyc_status !== 'verified') return
    if (localStorage.getItem(key)) return
    setOpen(true)
  }, [key, profile])

  if (!open || !key) return null

  function dismiss(goWallet: boolean) {
    if (key) localStorage.setItem(key, '1')
    setOpen(false)
    if (goWallet) navigate('/earnings')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5" onClick={() => dismiss(false)}>
      <div
        className="w-full max-w-sm rounded-2xl border border-hair bg-paper p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-verified-text">{t.eyebrow}</p>
        <h2 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink">{t.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{t.body}</p>
        <div className="mt-5 flex items-center gap-3">
          <Button className="flex-1" onClick={() => dismiss(true)}>{t.cta}</Button>
          <button
            onClick={() => dismiss(false)}
            className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink"
          >
            {t.later}
          </button>
        </div>
      </div>
    </div>
  )
}
