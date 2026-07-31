import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { useI18n } from '../lib/i18n'
import { EASE, CheckDraw, CountUp, Sparkles } from './motionKit'

const COPY = {
  en: {
    eyebrow: 'Identity verified',
    title: 'You\u2019re in. Welcome aboard.',
    amountLabel: 'Signup bonus, already in your wallet',
    body: 'Claim it — finishing Enhanced KYC on the way unlocks task assignments too.',
    cta: 'Claim in wallet',
    later: 'Later',
  },
  zh: {
    eyebrow: '身份审核通过',
    title: '欢迎正式加入。',
    amountLabel: '注册奖励，已在你的钱包',
    body: '去领取——顺手完成 Enhanced KYC，同时解锁接单资格。',
    cta: '去钱包领取',
    later: '稍后',
  },
}

/**
 * 基础 KYC 通过后的一次性揭幕(v49 signature moment):
 * 遮罩渐现 → 卡片弹入 → 徽章描画 → 标题浮现 → $2.99 弹性滚出 → 微光迸发 → CTA 呼吸。
 * 三秒钟,配得上"你通过了"。尊重系统减弱动效。
 */
export default function KycCongrats() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const { lang } = useI18n()
  const t = COPY[lang]
  const rm = useReducedMotion()
  const [open, setOpen] = useState(false)

  const key = user ? `lt_kyc_congrats_${user.id}` : null
  const bonus = Number(profile?.signup_bonus_usd ?? 2.99)

  useEffect(() => {
    if (!key || !profile) return
    if (profile.role !== 'user') return
    if (profile.kyc_status !== 'verified') return
    if (localStorage.getItem(key)) return
    setOpen(true)
  }, [key, profile])

  function dismiss(goWallet: boolean) {
    if (key) localStorage.setItem(key, '1')
    setOpen(false)
    if (goWallet) navigate('/earnings')
  }

  const at = (d: number) => (rm ? 0 : d)

  return (
    <AnimatePresence>
      {open && key && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-5"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => dismiss(false)}
        >
          <motion.div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-hair bg-paper p-6 text-center shadow-xl"
            initial={rm ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: 22 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center text-petrol">
              <CheckDraw size={60} delay={at(0.25)} />
              <Sparkles delay={at(1.15)} />
            </div>

            <motion.p
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-verified-text"
              initial={rm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: at(0.55) }}
            >
              {t.eyebrow}
            </motion.p>
            <motion.h2
              className="mt-1.5 font-display text-2xl font-medium tracking-tight text-ink"
              initial={rm ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: at(0.7) }}
            >
              {t.title}
            </motion.h2>

            <motion.div
              className="mt-4"
              initial={rm ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16, delay: at(0.95) }}
            >
              <p className="font-display text-4xl font-medium tracking-tight text-petrol">
                {rm ? `$${bonus.toFixed(2)}` : <CountUp value={bonus} format={n => `$${n.toFixed(2)}`} duration={0.7} />}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{t.amountLabel}</p>
            </motion.div>

            <motion.p
              className="mt-3 text-sm leading-relaxed text-muted"
              initial={rm ? false : { opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: at(1.35) }}
            >
              {t.body}
            </motion.p>

            <motion.div
              className="mt-5 flex items-center gap-3"
              initial={rm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: at(1.5) }}
            >
              <button
                onClick={() => dismiss(true)}
                className="press v49-breathe flex-1 rounded-xl bg-petrol px-4 py-2.5 font-display text-sm font-medium tracking-tight text-paper transition hover:bg-petrol-hover"
              >
                {t.cta}
              </button>
              <button
                onClick={() => dismiss(false)}
                className="font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink"
              >
                {t.later}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
