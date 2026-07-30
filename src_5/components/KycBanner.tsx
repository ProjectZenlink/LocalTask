import { Link } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { Alert } from './ui'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    pending1: 'Your identity documents are under review — usually 1–2 business days.',
    pending2: 'Need it faster?',
    pendingLink: 'Please contact customer support.',
    rejected: 'Your verification was rejected. Please submit new documents to receive tasks. ',
    none: 'Verify your identity to start receiving tasks. ',
    resubmit: 'Resubmit documents', start: 'Start verification',
  },
  zh: {
    pending1: '你的身份材料正在审核，通常需要 1–2 个工作日。',
    pending2: '想加急？',
    pendingLink: '请联系客服。',
    rejected: '你的身份验证被驳回。请重新提交材料后才能接任务。',
    none: '完成身份验证后才能接任务。',
    resubmit: '重新提交材料', start: '开始验证',
  },
}

/** Shown at the top of the main tabs until the freelancer is verified. */
export default function KycBanner() {
  const { profile } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
  if (!profile || profile.kyc_status === 'verified') return null

  if (profile.kyc_status === 'pending') {
    return (
      <Alert tone="info">
        {t.pending1}{' '}
        {t.pending2}{' '}{t.pendingLink}
      </Alert>
    )
  }
  return (
    <Alert tone="warning">
      {profile.kyc_status === 'rejected' ? t.rejected : t.none}
      <Link to="/onboarding/kyc" className="underline underline-offset-2">
        {profile.kyc_status === 'rejected' ? t.resubmit : t.start}
      </Link>
    </Alert>
  )
}
