import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Textarea } from './ui'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Dispatch 风格页内对话框外壳(v85.7 可达性重建):
 *  role="dialog" + aria-modal、Esc 关闭、Tab 焦点圈禁、初始焦点、
 *  关闭后焦点归还、背景滚动锁定。API 与旧版兼容,ariaLabel 为可选新增。 */
export function DialogShell({ children, onClose, ariaLabel }: { children: ReactNode; onClose: () => void; ariaLabel?: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const el = panel.current
    const first = el?.querySelector<HTMLElement>('[autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? el)?.focus()

    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        closeRef.current()
        return
      }
      if (ev.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.offsetParent !== null)
      if (items.length === 0) {
        ev.preventDefault()
        el.focus()
        return
      }
      const cur = document.activeElement as HTMLElement | null
      const i = cur ? items.indexOf(cur) : -1
      if (ev.shiftKey && i <= 0) {
        ev.preventDefault()
        items[items.length - 1].focus()
      } else if (!ev.shiftKey && (i === -1 || i === items.length - 1)) {
        ev.preventDefault()
        items[0].focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4" onClick={() => closeRef.current()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-hair bg-surface p-5 shadow-[0_16px_48px_rgba(26,32,30,0.18)] outline-none"
      >
        {children}
      </div>
    </div>
  )
}

export function PromptDialog({
  open, title, hint, placeholder, confirmLabel, cancelLabel, danger = false, allowEmpty = false, onConfirm, onClose,
}: {
  open: boolean
  title: string
  hint?: string
  placeholder?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  /** 允许提交空值（例如「留空清除」的场景）。默认必须非空。 */
  allowEmpty?: boolean
  onConfirm: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  useEffect(() => { if (open) setText('') }, [open])
  if (!open) return null
  return (
    <DialogShell onClose={onClose} ariaLabel={title}>
      <p className="font-display text-base font-medium tracking-tight text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>}
      <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} className="mt-3" autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={!allowEmpty && !text.trim()} onClick={() => onConfirm(text.trim())}>
          {confirmLabel}
        </Button>
      </div>
    </DialogShell>
  )
}

export function ConfirmDialog({
  open, title, hint, confirmLabel, cancelLabel, danger = true, onConfirm, onClose,
}: {
  open: boolean
  title: string
  hint?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <DialogShell onClose={onClose} ariaLabel={title}>
      <p className="font-display text-base font-medium tracking-tight text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </DialogShell>
  )
}
