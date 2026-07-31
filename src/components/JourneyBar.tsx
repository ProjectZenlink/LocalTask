import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { useI18n } from '../lib/i18n'

/** 下一步引导胶囊(v53):只提示当前该做的一步,一行搞定;全部完成自动消失。 */

const COPY = {
  zh: { next: '下一步', kyc: '完成 KYC 身份验证', ekyc: '完成 Enhanced KYC,解锁奖励', task: '等待 AM 派发首个任务' },
  en: { next: 'Next', kyc: 'Complete KYC verification', ekyc: 'Complete Enhanced KYC to unlock your bonus', task: 'Wait for your AM to assign your first task' },
}

export default function JourneyBar() {
  const { profile } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [firstTask, setFirstTask] = useState(true)
  useEffect(() => {
    if (!profile || profile.role !== 'user') return
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('assigned_freelancer', profile.id)
      .then(({ count }) => setFirstTask((count ?? 0) > 0))
  }, [profile])
  if (!profile || profile.role !== 'user') return null

  const kyc = profile.kyc_status === 'verified'
  const ekyc = profile.enhanced_kyc_status === 'verified'
  if (kyc && ekyc && firstTask) return null

  const done = 1 + (kyc ? 1 : 0) + (ekyc ? 1 : 0)
  const step: { label: string; to: string | null } = !kyc
    ? { label: t.kyc, to: '/verify' }
    : !ekyc
      ? { label: t.ekyc, to: '/enhanced-kyc' }
      : { label: t.task, to: null }

  const inner = (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex h-6 shrink-0 items-center rounded-full bg-petrol px-2 font-mono text-[10px] text-paper">{done}/4</span>
      <span className="min-w-0 truncate text-sm text-ink">
        <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">{t.next}</span>
        {step.label}
      </span>
      {step.to && (
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-petrol"><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </span>
  )

  return step.to ? (
    <Link to={step.to} className="mb-5 flex items-center rounded-full border border-hair bg-white px-3 py-2 transition hover:border-petrol/40">
      {inner}
    </Link>
  ) : (
    <div className="mb-5 flex items-center rounded-full border border-hair bg-white px-3 py-2">{inner}</div>
  )
}
