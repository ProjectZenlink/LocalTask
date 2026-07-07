import { useEffect, useState, type ReactNode } from 'react'
import { Button, Textarea } from './ui'

/** Dispatch 风格页内对话框外壳 */
export function DialogShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-hair bg-surface p-5 shadow-[0_16px_48px_rgba(26,32,30,0.18)]"
      >
        {children}
      </div>
    </div>
  )
}

export function PromptDialog({
  open, title, hint, placeholder, confirmLabel, cancelLabel, danger = false, onConfirm, onClose,
}: {
  open: boolean
  title: string
  hint?: string
  placeholder?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  useEffect(() => { if (open) setText('') }, [open])
  if (!open) return null
  return (
    <DialogShell onClose={onClose}>
      <p className="font-display text-base font-medium tracking-tight text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>}
      <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} className="mt-3" autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
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
    <DialogShell onClose={onClose}>
      <p className="font-display text-base font-medium tracking-tight text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </DialogShell>
  )
}
