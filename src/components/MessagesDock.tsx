import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../admin/i18n'
import { useUnread } from './useUnread'
import ChatCenter from './ChatCenter'

/** 右侧贴边消息坞(v64 ⑩):AD/AM 全局小窗 —— 在任何后台页面边办公边聊。
 *  折叠=右缘竖把手(未读角标);展开=380px 面板,内核与消息整页同一个 ChatCenter
 *  (dock 变体:单栏切换,恒显返回键);消息整页保留 —— 坞管随手,页管正事。 */

const COPY = {
  zh: { title: '消息', open: '打开消息小窗', close: '收起' },
  en: { title: 'Messages', open: 'Open messages', close: 'Collapse' },
}

export default function MessagesDock({ myRole }: { myRole: 'am' | 'admin' }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const unread = useUnread(!!user)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(() => localStorage.getItem('lt_msgdock_open') === '1')
  const [want, setWant] = useState<string | null>(null)

  // v75 ②:三入口的「小窗」偏好经此事件开窗并直达对方
  useEffect(() => {
    const onOpen = (e: Event) => {
      const w = (e as CustomEvent<{ with?: string }>).detail?.with ?? null
      setWant(w); setOpen(true)
    }
    window.addEventListener('lt-open-dock', onOpen)
    return () => window.removeEventListener('lt-open-dock', onOpen)
  }, [])

  useEffect(() => {
    localStorage.setItem('lt_msgdock_open', open ? '1' : '0')
    // v76:向布局壳广播开合,内容区并排让位(iPad 分屏观感)
    window.dispatchEvent(new CustomEvent('lt-dock-state', { detail: { open } }))
  }, [open])

  // 消息整页上不重复出现(同一内核,两个壳不同时上台)
  if (pathname === '/am/messages' || pathname === '/admin/messages') return null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title={t.open}
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl border border-r-0 border-hair bg-surface px-2 py-3 text-muted shadow-[0_8px_28px_rgba(26,32,30,0.16)] transition hover:text-ink">
        <MessageSquare size={16} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[9.5px] leading-4 text-paper">{unread}</span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-24 right-0 top-20 z-30 flex w-[400px] max-w-[94vw] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-hair bg-surface shadow-[0_16px_48px_rgba(26,32,30,0.22)]">
      <div className="min-h-0 flex-1 bg-white/40">
        <ChatCenter lang={lang} myRole={myRole} variant="dock"
          initialWith={want} onClose={() => { setOpen(false); setWant(null) }} />
      </div>
    </div>
  )
}
