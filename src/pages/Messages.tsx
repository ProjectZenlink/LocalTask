import ChatCenter from '../components/ChatCenter'
import { useI18n } from '../lib/i18n'

export default function FreelancerMessages() {
  const { lang } = useI18n()
  return <ChatCenter lang={lang} myRole="user" />
}
