import { Link } from 'react-router-dom'
import { useProfile } from '../context/ProfileContext'
import { Alert } from './ui'
import { tgLink } from '../lib/format'
import { SUPPORT_TELEGRAM } from '../lib/support'

/** Shown at the top of the main tabs until the freelancer is verified. */
export default function KycBanner() {
  const { profile } = useProfile()
  if (!profile || profile.kyc_status === 'verified') return null

  if (profile.kyc_status === 'pending') {
    return (
      <Alert tone="info">
        Your identity documents are under review — usually 1–2 business days.{' '}
        Need it faster?{' '}
        <a href={tgLink(SUPPORT_TELEGRAM)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Contact support on Telegram
        </a>.
      </Alert>
    )
  }
  return (
    <Alert tone="warning">
      {profile.kyc_status === 'rejected'
        ? 'Your verification was rejected. Please submit new documents to receive offers. '
        : 'Verify your identity to start receiving offers. '}
      <Link to="/onboarding/kyc" className="underline underline-offset-2">
        {profile.kyc_status === 'rejected' ? 'Resubmit documents' : 'Start verification'}
      </Link>
    </Alert>
  )
}
