import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare, X } from 'lucide-react'
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

  useEffect(() => { localStorage.setItem('lt_msgdock_open', open ? '1' : '0') }, [open])

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
    <div className="fixed bottom-24 right-0 top-20 z-30 flex w-[380px] max-w-[94vw] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-hair bg-surface shadow-[0_16px_48px_rgba(26,32,30,0.22)]">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2.5">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          {t.title}
          {unread > 0 && (
            <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[9.5px] leading-4 text-paper">{unread}</span>
          )}
        </span>
        <button onClick={() => setOpen(false)} title={t.close}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-hair text-faint transition hover:text-ink">
          <X size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-white/40">
        <ChatCenter lang={lang} myRole={myRole} variant="dock" />
      </div>
    </div>
  )
}
