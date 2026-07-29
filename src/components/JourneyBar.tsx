import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { useI18n } from '../lib/i18n'

/** 旅程引导条(v50):注册 → KYC → Enhanced KYC → 首个任务;四步全绿自动消失。 */

const COPY = {
  zh: { s1: '注册', s2: 'KYC', s3: 'Enhanced KYC', s4: '首个任务' },
  en: { s1: 'Sign up', s2: 'KYC', s3: 'Enhanced KYC', s4: 'First task' },
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

  const steps: { label: string; done: boolean; to: string | null }[] = [
    { label: t.s1, done: true, to: null },
    { label: t.s2, done: kyc, to: kyc ? null : '/verify' },
    { label: t.s3, done: ekyc, to: ekyc ? null : '/enhanced-kyc' },
    { label: t.s4, done: firstTask, to: null },
  ]
  const currentIdx = steps.findIndex(s => !s.done)

  return (
    <div className="mb-5 rounded-2xl border border-hair bg-white px-4 py-3">
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s.label} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && <span className={`mx-2 h-px flex-1 transition-colors ${steps[i - 1].done ? 'bg-petrol/50' : 'bg-hair'}`} />}
            {s.to ? (
              <Link to={s.to} className="group flex shrink-0 items-center gap-1.5">
                <StepDot done={s.done} current={i === currentIdx} />
                <span className={`font-mono text-[10px] uppercase tracking-wider transition ${i === currentIdx ? 'text-petrol group-hover:text-petrol-hover' : 'text-faint'}`}>{s.label}</span>
              </Link>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5">
                <StepDot done={s.done} current={i === currentIdx} />
                <span className={`font-mono text-[10px] uppercase tracking-wider ${s.done ? 'text-muted' : i === currentIdx ? 'text-petrol' : 'text-faint'}`}>{s.label}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StepDot({ done, current }: { done: boolean; current: boolean }) {
  if (done) return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-petrol">
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5"><path d="M2 5.2 L4.2 7.4 L8 3" fill="none" stroke="#F2EFE8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  )
  return <span className={`h-4 w-4 rounded-full border ${current ? 'border-petrol bg-petrol/10' : 'border-hair bg-white'}`}>
    {current && <span className="mx-auto mt-[4.5px] block h-1.5 w-1.5 rounded-full bg-petrol" />}
  </span>
}
