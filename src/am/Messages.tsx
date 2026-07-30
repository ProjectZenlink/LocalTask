import ChatCenter from '../components/ChatCenter'
import { useLang } from '../admin/i18n'

export default function AmMessages() {
  const { lang } = useLang()
  return <ChatCenter lang={lang} myRole="am" />
}
