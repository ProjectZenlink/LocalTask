import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { SUPPORT } from '../lib/support'

/** 公开页右下角客服浮钮:点开 WhatsApp / Telegram 双行直达。 */
export default function SupportDock() {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-64 rounded-2xl border border-hair bg-surface p-4 shadow-[0_16px_48px_rgba(30,29,25,0.18)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-petrol">Talk to support</p>
          <p className="mt-1 text-xs text-muted">A person answers — usually fast.</p>
          <div className="mt-3 flex flex-col gap-2">
            {SUPPORT.whatsapp && (
              <a href={`https://wa.me/${SUPPORT.whatsapp}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-hair px-3.5 py-2.5 transition hover:-translate-y-px hover:border-petrol/40">
                <span className="text-sm text-ink">WhatsApp</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">Open ↗</span>
              </a>
            )}
            <a href={`https://t.me/${SUPPORT.telegram}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-hair px-3.5 py-2.5 transition hover:-translate-y-px hover:border-petrol/40">
              <span className="text-sm text-ink">Telegram</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">Open ↗</span>
            </a>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Support"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-petrol text-paper shadow-[0_12px_32px_rgba(36,75,77,0.35)] transition hover:-translate-y-0.5 hover:bg-petrol-hover"
      >
        {open ? <X size={19} strokeWidth={1.75} /> : <MessageCircle size={19} strokeWidth={1.75} />}
      </button>
    </div>
  )
}
