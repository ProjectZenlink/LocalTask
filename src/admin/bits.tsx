import type { ReactNode } from 'react'
import { StatusBadge } from '../components/ui'
import type { TaskStatus } from '../types/database'
import { STATUS_LABEL, useLang } from './i18n'

export { DialogShell, PromptDialog, ConfirmDialog } from '../components/dialogs'

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
export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wider text-faint">{k}</span>
      <span className="min-w-0 text-sm text-ink">{children}</span>
    </div>
  )
}

export { waLink, tgLink } from '../lib/format'
