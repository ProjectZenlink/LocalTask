import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { TASK_BADGE, type TaskStatus } from '../types/database'

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{children}</div>
  )
}

export function PageHeading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{children}</h1>
      {sub && <p className="mt-2 text-sm leading-relaxed text-muted">{sub}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-hair bg-surface ${className}`}>{children}</div>
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base = 'font-display text-sm font-medium rounded-lg px-4 py-2.5 transition disabled:opacity-50'
  const styles =
    variant === 'primary'
      ? 'bg-petrol text-paper hover:bg-petrol-hover'
      : variant === 'danger'
        ? 'border border-danger-border text-danger-text hover:bg-danger-bg'
        : 'border border-hair text-ink hover:bg-paper'
  return <button className={`${base} ${styles} ${className}`} {...props} />
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm text-muted">{children}</label>
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20 ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20 ${className}`}
      {...props}
    />
  )
}

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      <Input {...props} />
    </div>
  )
}

type Status = 'verified' | 'pending' | 'unverified'

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const map: Record<Status, { cls: string; dot: string; text: string }> = {
    verified: { cls: 'border-verified-border text-verified-text', dot: 'bg-verified', text: 'Verified' },
    pending: { cls: 'border-pending-border text-pending-text', dot: 'bg-pending', text: 'Pending' },
    unverified: { cls: 'border-inactive-border text-inactive-text', dot: 'bg-inactive', text: 'Unverified' },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label ?? s.text}
    </span>
  )
}

export function TaskBadge({ status }: { status: TaskStatus }) {
  const b = TASK_BADGE[status] ?? { s: 'unverified' as const, label: status }
  return <StatusBadge status={b.s} label={b.label} />
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'warning' | 'success'; children: ReactNode }) {
  const map = {
    error: 'border-danger-border bg-danger-bg text-danger-text',
    info: 'border-petrol/25 bg-petrol/5 text-petrol',
    warning: 'border-pending-border bg-pending-bg text-pending-text',
    success: 'border-verified-border bg-verified-bg text-verified-text',
  }
  return <div className={`mb-4 rounded-lg border px-3 py-2 text-sm leading-relaxed ${map[tone]}`}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{children}</p>
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g

/** Renders plain text with clickable links, preserving line breaks.
 *  split() with one capturing group alternates plain/url — odd indexes are URLs. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2 break-all">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}
