import { useEffect, useState, type ReactNode } from 'react'
import { StatusBadge, Button, Textarea } from '../components/ui'
import type { TaskStatus } from '../types/database'
import { STATUS_LABEL, useLang } from './i18n'

/** Dispatch 风格页内对话框（替代原生 prompt/confirm 的丑弹窗） */
function DialogShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
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

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { lang } = useLang()
  const m = STATUS_LABEL[status]
  return <StatusBadge status={m.s} label={lang === 'zh' ? m.zh : m.en} />
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-left font-mono text-[11px] font-normal uppercase tracking-wider text-faint ${className}`}>
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle text-sm text-ink ${className}`}>{children}</td>
}

/** 1–5 picker for the three rating dimensions. */
export function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-lg border font-mono text-sm transition ${
            n <= value ? 'border-petrol bg-petrol text-paper' : 'border-hair bg-white text-faint hover:text-ink'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wider text-faint">{k}</span>
      <span className="min-w-0 text-sm text-ink">{children}</span>
    </div>
  )
}

export { waLink, tgLink } from '../lib/format'
