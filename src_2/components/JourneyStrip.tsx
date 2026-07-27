import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { useI18n } from '../lib/i18n'
import { EASE, CheckDraw } from './motionKit'
import { Card } from './ui'

const COPY = {
  en: {
    eyebrow: 'Your first payout, four steps',
    steps: ['Profile', 'Identity check', 'Claim $2.99 bonus', 'First task'],
    hints: {
      profileGo: 'Finish your profile to begin.',
      kycGo: 'Verify your identity — it takes two minutes.',
      kycRejected: 'Verification was rejected — resubmit your documents.',
      kycWait: 'Our turn · usually 1–2 business days. Rushing? Chat with support (bottom right).',
      bonusGo: '$2.99 is waiting in your wallet. Claiming it verifies you for tasks too.',
      bonusWait: 'Our turn · Enhanced KYC in review — tasks unlock right after.',
      taskWait: 'Your AM is matching you with a first task. New tasks land here.',
      done: 'Journey complete — you\u2019re fully set up.',
    },
    cta: { profile: 'Complete profile', kyc: 'Verify identity', resubmit: 'Resubmit', bonus: 'Claim bonus' },
  },
  zh: {
    eyebrow: '第一笔提现，四步',
    steps: ['建档', '身份审核', '领取 $2.99 奖励', '第一个任务'],
    hints: {
      profileGo: '先完成建档。',
      kycGo: '验证身份——两分钟搞定。',
      kycRejected: '验证被驳回——请重新提交材料。',
      kycWait: '轮到我们 · 通常 1–2 个工作日。想加急？点右下角联系客服。',
      bonusGo: '$2.99 已在钱包等你。领取的同时也解锁接单资格。',
      bonusWait: '轮到我们 · Enhanced KYC 审核中——通过后即可接单。',
      taskWait: '你的 AM 正在为你匹配第一个任务，新任务会出现在这里。',
      done: '旅程完成——一切就绪。',
    },
    cta: { profile: '去建档', kyc: '去验证', resubmit: '重新提交', bonus: '去领奖励' },
  },
}

/**
 * 旅程进度条(v49):注册 → 首单的四步地图,渲染在任务页顶部。
 * 设计代文字:墨线在步与步之间"生长",当前步呼吸,完成步落勾。
 * 全部完成后展示一次收官态,之后永久隐藏(localStorage)。
 */
export default function JourneyStrip() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
  const rm = useReducedMotion()
  const [everTask, setEverTask] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('assigned_freelancer', user.id)
      .then(({ count }) => setEverTask((count ?? 0) > 0))
  }, [user])

  const doneKey = user ? `lt_journey_done_${user.id}` : null
  const [hidden] = useState(() => !!(doneKey && localStorage.getItem(doneKey)))

  if (!profile || everTask === null || hidden) return null

  const s1 = !!profile.full_name
  const s2 = profile.kyc_status === 'verified'
  const s3 = profile.enhanced_kyc_status === 'verified'
  const s4 = everTask
  const done = [s1, s2, s3, s4]
  const allDone = done.every(Boolean)
  const current = done.findIndex(d => !d)

  if (allDone && doneKey && !localStorage.getItem(doneKey)) {
    // 收官态展示一次;下次进入不再渲染
    setTimeout(() => localStorage.setItem(doneKey, '1'), 400)
  }

  const hint = allDone ? t.hints.done
    : current === 0 ? t.hints.profileGo
    : current === 1 ? (profile.kyc_status === 'pending' ? t.hints.kycWait : profile.kyc_status === 'rejected' ? t.hints.kycRejected : t.hints.kycGo)
    : current === 2 ? (profile.enhanced_kyc_status === 'pending' ? t.hints.bonusWait : t.hints.bonusGo)
    : t.hints.taskWait

  const cta = allDone ? null
    : current === 0 ? { to: '/build-profile', label: t.cta.profile }
    : current === 1 ? (profile.kyc_status === 'pending' ? null : { to: '/onboarding/kyc', label: profile.kyc_status === 'rejected' ? t.cta.resubmit : t.cta.kyc })
    : current === 2 ? (profile.enhanced_kyc_status === 'pending' ? null : { to: '/earnings', label: t.cta.bonus })
    : null

  return (
    <Card className="mb-5 overflow-hidden p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-faint">{t.eyebrow}</p>

      <div className="mt-4 flex items-start">
        {t.steps.map((label, i) => {
          const isDone = done[i]
          const isCurrent = i === current && !allDone
          return (
            <div key={label} className="flex min-w-0 flex-1 items-start">
              {i > 0 && (
                <div className="relative mt-[13px] h-px flex-1 bg-hair">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-petrol"
                    initial={rm ? { width: done[i - 1] ? '100%' : '0%' } : { width: 0 }}
                    animate={{ width: done[i - 1] ? '100%' : '0%' }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.15 + i * 0.12 }}
                  />
                </div>
              )}
              <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 sm:w-20">
                <div className="relative flex h-[27px] items-center">
                  {isDone ? (
                    <motion.span
                      className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-petrol text-paper"
                      initial={rm ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.35, ease: EASE, delay: 0.1 + i * 0.12 }}
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.4 L5 8.8 L9.6 3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.span>
                  ) : (
                    <span className={`h-[22px] w-[22px] rounded-full border-2 ${isCurrent ? 'border-petrol v49-breathe bg-petrol/10' : 'border-hair bg-surface'}`}>
                      {isCurrent && <span className="mx-auto mt-[5px] block h-2 w-2 rounded-full bg-petrol" />}
                    </span>
                  )}
                </div>
                <span className={`text-center font-mono text-[9.5px] uppercase leading-tight tracking-wider ${isDone ? 'text-petrol' : isCurrent ? 'text-ink' : 'text-faint'}`}>
                  {label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-3.5">
        {allDone ? (
          <div className="flex items-center gap-2.5 text-verified-text">
            <CheckDraw size={26} />
            <p className="text-sm">{hint}</p>
          </div>
        ) : (
          <p className="min-w-0 text-sm leading-relaxed text-muted">{hint}</p>
        )}
        {cta && (
          <Link to={cta.to}
            className="press shrink-0 rounded-xl bg-petrol px-4 py-2 font-display text-sm font-medium tracking-tight text-paper transition hover:bg-petrol-hover">
            {cta.label}
          </Link>
        )}
      </div>
    </Card>
  )
}
