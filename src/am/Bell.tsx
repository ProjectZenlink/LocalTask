import { useCallback, useEffect, useState } from 'react'
import { Bell as BellIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import type { AmNote, AccountRecord, AcceptanceRow } from '../types/database'
import { typeLabel } from '../lib/format'
import { Button, Input } from '../components/ui'
import { useLang } from '../admin/i18n'

type ExpRow = AccountRecord & { freelancer: { display_name: string | null } | null }
type ReopenRow = AcceptanceRow & { freelancer: { display_name: string | null } | null }

const COPY = {
  zh: {
    expiring: '手机号即将到期', none: '暂无提醒,也没有未完成的备忘。', reopened: '跳审核待处理', goBoard: '去处理',
    memos: '备忘录', add: '添加', placeholder: '例:明天联系 James 做 Shopify',
    daysLeft: (d: number) => d <= 0 ? '今天到期' : `${d} 天后到期`,
  },
  en: {
    expiring: 'Phone numbers expiring', none: 'No reminders and no open memos.', reopened: 'Flagged accounts', goBoard: 'Handle',
    memos: 'Memos', add: 'Add', placeholder: 'e.g. Ping James about Shopify tomorrow',
    daysLeft: (d: number) => d <= 0 ? 'expires today' : `expires in ${d}d`,
  },
}

function daysUntil(iso: string): number {
  const a = new Date(iso + 'T00:00:00')
  const b = new Date(); b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

export default function Bell({ amId }: { amId: string }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<AmNote[]>([])
  const [expiring, setExpiring] = useState<ExpRow[]>([])
  const [reopened, setReopened] = useState<ReopenRow[]>([])
  const [draft, setDraft] = useState('')
  const [draftDate, setDraftDate] = useState('')

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const [n, e, ro] = await Promise.all([
      supabase.from('am_notes').select('*').eq('am_id', amId).eq('done', false)
        .order('remind_on', { ascending: true, nullsFirst: false }),
      supabase.from('account_records')
        .select('*, freelancer:profiles!account_records_freelancer_id_fkey(display_name)')
        .lte('phone_expires_on', cutoff)
        .not('phone_expires_on', 'is', null),
      supabase.from('platform_acceptances')
        .select('*, freelancer:profiles!platform_acceptances_freelancer_id_fkey(display_name)')
        .eq('am_id', amId).eq('status', 'reopened')
        .order('reopened_at', { ascending: false }),
    ])
    setNotes((n.data ?? []) as AmNote[])
    setExpiring((e.data ?? []) as unknown as ExpRow[])
    setReopened((ro.data ?? []) as unknown as ReopenRow[])
  }, [amId])

  useEffect(() => { void load() }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const badge = reopened.length + expiring.length + notes.filter(x => x.remind_on && x.remind_on <= today).length

  async function addNote() {
    if (!draft.trim()) return
    await supabase.from('am_notes').insert({ am_id: amId, content: draft.trim(), remind_on: draftDate || null })
    setDraft(''); setDraftDate('')
    await load()
  }

  async function toggleDone(n: AmNote) {
    await supabase.from('am_notes').update({ done: true }).eq('id', n.id)
    await load()
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="relative rounded-lg border border-hair p-1.5 text-muted transition hover:text-ink">
        <BellIcon size={16} strokeWidth={1.75} />
        {badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-text px-1 font-mono text-[10px] text-paper">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-80 rounded-xl border border-hair bg-surface p-4 shadow-[0_16px_48px_rgba(26,32,30,0.18)]">
          {reopened.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-danger-text">{t.reopened}</p>
              {reopened.map(r => (
                <div key={r.id} className="border-b border-hair py-1.5 text-xs last:border-b-0">
                  <p className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-ink">
                      {r.freelancer?.display_name ?? '—'} · {typeLabel(r.task_type, lang)}
                    </span>
                    <Link to={`/am/f/${r.freelancer_id}`} onClick={() => setOpen(false)}
                      className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-petrol underline underline-offset-2">
                      {t.goBoard}
                    </Link>
                  </p>
                  {r.reopened_reason && <p className="mt-0.5 text-faint">{r.reopened_reason}</p>}
                </div>
              ))}
            </div>
          )}

          {expiring.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-danger-text">{t.expiring}</p>
              {expiring.map(r => (
                <p key={r.id} className="border-b border-hair py-1.5 text-xs text-ink last:border-b-0">
                  {r.freelancer?.display_name ?? '—'} · {r.task_type} · <span className="font-mono">{r.phone_number ?? '—'}</span>
                  <span className="ml-1 text-danger-text">{t.daysLeft(daysUntil(r.phone_expires_on!))}</span>
                </p>
              ))}
            </div>
          )}

          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.memos}</p>
          {notes.length === 0 && expiring.length === 0 && reopened.length === 0 && (
            <p className="py-1 text-xs text-faint">{t.none}</p>
          )}
          {notes.map(n => (
            <div key={n.id} className="flex items-start gap-2 border-b border-hair py-1.5 last:border-b-0">
              <input type="checkbox" className="mt-0.5 accent-[#244B4D]" onChange={() => void toggleDone(n)} />
              <div className="min-w-0">
                <p className="text-xs text-ink">{n.content}</p>
                {n.remind_on && (
                  <p className={`font-mono text-[10px] ${n.remind_on <= today ? 'text-danger-text' : 'text-faint'}`}>{n.remind_on}</p>
                )}
              </div>
            </div>
          ))}

          <div className="mt-3 flex flex-col gap-2">
            <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder={t.placeholder} className="py-1.5 text-xs" />
            <div className="flex gap-2">
              <Input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)} className="py-1.5 text-xs" />
              <Button className="px-3 py-1.5 text-xs" onClick={() => void addNote()}>{t.add}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
