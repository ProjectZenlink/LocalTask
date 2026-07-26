import ChatCenter from '../components/ChatCenter'
import { useLang } from './i18n'

export default function AdminMessages() {
  const { lang } = useLang()
  return <ChatCenter lang={lang} myRole="admin" />
}
