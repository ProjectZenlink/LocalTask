import { useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { waLink, tgLink } from '../lib/format'
import { SUPPORT } from '../lib/support'
import { useI18n } from '../lib/i18n'

interface AmContact { name: string; whatsapp: string | null; telegram: string | null }

const COPY = {
  en: {
    yourAm: 'Your account manager', support: 'LocalTask support',
    bodyAm: 'Questions about an offer or a task? Message them directly — replies are fastest here.',
    bodySupport: 'No account manager assigned yet — our support team can help with anything.',
    none: 'No contact set yet.', close: 'Close', open: 'Contact your account manager',
  },
  zh: {
    yourAm: '你的账户经理', support: 'LocalTask 支持',
    bodyAm: '关于邀约或任务有问题？直接给他发消息，这里回复最快。',
    bodySupport: '还没有分配账户经理。有任何问题都可以先找支持团队。',
    none: '还没有留联系方式。', close: '关闭', open: '联系账户经理',
  },
}

/** 右下角浮窗：一键联系「你的账户经理」；没有归属时显示平台支持方。 */
export default function AmContactDock() {
  const { profile } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [open, setOpen] = useState(false)
  const [am, setAm] = useState<AmContact | null>(null)

  useEffect(() => {
    if (!profile?.managed_by) { setAm(null); return }
    supabase.from('account_managers')
      .select('name, whatsapp, telegram')
      .eq('id', profile.managed_by).maybeSingle()
      .then(({ data }) => setAm((data ?? null) as AmContact | null))
  }, [profile?.managed_by])

  const c: AmContact = am ?? SUPPORT
  const isAm = !!am

  return (
    <div className="fixed bottom-20 right-4 z-30 sm:bottom-6 sm:right-6">
      {open && (
        <div className="mb-3 w-64 rounded-2xl border border-hair bg-surface p-4 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                {isAm ? t.yourAm : t.support}
              </p>
              <p className="mt-1 truncate font-display text-sm font-medium tracking-tight text-ink">{c.name}</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t.close} className="text-faint transition hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {isAm ? t.bodyAm : t.bodySupport}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {c.whatsapp && (
              <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer"
                className="flex items-center justify-center rounded-lg bg-petrol px-3 py-2 font-display text-sm font-medium text-paper transition hover:bg-petrol-hover">
                WhatsApp
              </a>
            )}
            {c.telegram && (
              <a href={tgLink(c.telegram)} target="_blank" rel="noreferrer"
                className="flex items-center justify-center rounded-lg border border-petrol/30 px-3 py-2 font-display text-sm font-medium text-petrol transition hover:bg-petrol/5">
                Telegram
              </a>
            )}
            {!c.whatsapp && !c.telegram && (
              <p className="text-center font-mono text-xs text-faint">{t.none}</p>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t.open}
        className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-petrol text-paper shadow-lg transition hover:bg-petrol-hover"
      >
        <MessageCircle size={22} strokeWidth={1.75} />
      </button>
    </div>
  )
}
