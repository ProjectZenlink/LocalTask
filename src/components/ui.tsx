import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

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
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base = 'font-display text-sm font-medium rounded-lg px-4 py-2.5 transition disabled:opacity-50'
  const styles =
    variant === 'primary'
      ? 'bg-petrol text-paper hover:bg-petrol-hover'
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

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'warning'; children: ReactNode }) {
  const map = {
    error: 'border-danger-border bg-danger-bg text-danger-text',
    info: 'border-petrol/25 bg-petrol/5 text-petrol',
    warning: 'border-pending-border bg-pending-bg text-pending-text',
  }
  return <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${map[tone]}`}>{children}</div>
}
