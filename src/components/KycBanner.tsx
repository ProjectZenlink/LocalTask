import { Link } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { Alert } from './ui'
import { tgLink } from '../lib/format'
import { SUPPORT_TELEGRAM } from '../lib/support'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    pending1: 'Your identity documents are under review — usually 1–2 business days.',
    pending2: 'Need it faster?',
    pendingLink: 'Contact support on Telegram',
    rejected: 'Your verification was rejected. Please submit new documents to receive offers. ',
    none: 'Verify your identity to start receiving offers. ',
    resubmit: 'Resubmit documents', start: 'Start verification',
  },
  zh: {
    pending1: '你的身份材料正在审核，通常需要 1–2 个工作日。',
    pending2: '想加急？',
    pendingLink: '在 Telegram 联系支持',
    rejected: '你的身份验证被驳回。请重新提交材料后才能收到邀约。',
    none: '完成身份验证后才会收到任务邀约。',
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
        {t.pending2}{' '}
        <a href={tgLink(SUPPORT_TELEGRAM)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {t.pendingLink}
        </a>
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
