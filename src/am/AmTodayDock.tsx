import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../admin/i18n'
import { typeLabel } from '../lib/format'

/** 右下角可折叠「今日待办」浮窗:铃铛是事件流,这里是状态面板 —— 今天还剩什么没做完。 */
const COPY = {
  zh: {
    title: '今日待办', fold: '收起', empty: '全部清空,今天没有待办 ✦',
    reopened: (n: number) => `${n} 项跳审核待处理`,
    pending: (n: number) => `${n} 项等平台复核`,
    rejected: (n: number) => `${n} 项近 30 天被驳回`,
    phones: (n: number) => `${n} 个接码手机 7 天内到期`,
    todos: (n: number) => `${n} 条指派待办`, from: '来自', done: '完成',
  },
  en: {
    title: 'Today', fold: 'Fold', empty: 'All clear — nothing pending ✦',
    reopened: (n: number) => `${n} flagged to handle`,
    pending: (n: number) => `${n} in platform review`,
    rejected: (n: number) => `${n} rejected in last 30d`,
    phones: (n: number) => `${n} phones expiring in 7d`,
    todos: (n: number) => `${n} assigned todo(s)`, from: 'From', done: 'Done',
  },
}

interface ReRow { id: string; freelancer_id: string; task_type: string; freelancer: { display_name: string | null } | null }

export default function AmTodayDock({ amId }: { amId: string }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const [folded, setFolded] = useState(() => localStorage.getItem('am_today_folded') === '1')
  const [reopened, setReopened] = useState<ReRow[]>([])
  const [nPending, setNPending] = useState(0)
  const [nRejected, setNRejected] = useState(0)
  const [phRows, setPhRows] = useState<{ id: string; freelancer_id: string; phone_number: string | null; phone_expires_on: string }[]>([])
  const [showPhones, setShowPhones] = useState(false)
  const [assigned, setAssigned] = useState<{ id: string; content: string; creator: { display_name: string | null } | null }[]>([])

  const load = useCallback(async () => {
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString()
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const [ro, pe, rj, ph, td] = await Promise.all([
      supabase.from('platform_acceptances')
        .select('id, freelancer_id, task_type, freelancer:profiles!platform_acceptances_freelancer_id_fkey(display_name)')
        .eq('am_id', amId).eq('status', 'reopened').order('reopened_at', { ascending: false }),
      supabase.from('platform_acceptances').select('id', { count: 'exact', head: true })
        .eq('am_id', amId).eq('status', 'pending_admin'),
      supabase.from('platform_acceptances').select('id', { count: 'exact', head: true })
        .eq('am_id', amId).eq('status', 'rejected').gte('decided_at', d30),
      supabase.from('account_records')
        .select('id, freelancer_id, phone_number, phone_expires_on')
        .lte('phone_expires_on', d7).not('phone_expires_on', 'is', null)
        .order('phone_expires_on').limit(10),
      supabase.from('todos').select('id, content, creator:profiles!created_by(display_name)')
        .eq('status', 'open').order('created_at'),
    ])
    setReopened((ro.data ?? []) as unknown as ReRow[])
    setNPending(pe.count ?? 0)
    setNRejected(rj.count ?? 0)
    setPhRows((ph.data ?? []) as unknown as { id: string; freelancer_id: string; phone_number: string | null; phone_expires_on: string }[])
    setAssigned((td.data ?? []) as unknown as { id: string; content: string; creator: { display_name: string | null } | null }[])
  }, [amId])

  useEffect(() => { void load() }, [load])

  async function doneTodo(id: string) {
    await supabase.rpc('complete_todo', { p_id: id })
    await load()
  }

  function toggle() {
    setFolded(v => {
      localStorage.setItem('am_today_folded', v ? '0' : '1')
      return !v
    })
  }

  const total = reopened.length + nPending + nRejected + phRows.length + assigned.length

  if (folded) {
    return (
      <button onClick={toggle}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-hair bg-surface px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-muted shadow-[0_8px_28px_rgba(26,32,30,0.16)] transition hover:text-ink">
        <Sparkles size={13} strokeWidth={1.75} className="text-petrol" />
        {t.title}
        {total > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] text-paper">{total}</span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-30 w-64 rounded-2xl border border-hair bg-surface p-4 shadow-[0_16px_48px_rgba(26,32,30,0.18)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-petrol">
          <Sparkles size={12} strokeWidth={1.75} /> {t.title}
        </p>
        <button onClick={toggle} title={t.fold} className="rounded-md p-1 text-faint transition hover:text-ink">
          <ChevronDown size={14} strokeWidth={1.75} />
        </button>
      </div>

      {total === 0 ? (
        <p className="py-1 text-xs text-faint">{t.empty}</p>
      ) : (
        <div className="flex flex-col gap-1.5 text-xs">
          {assigned.length > 0 && (
            <div className="mb-1">
              <p className="text-petrol">{t.todos(assigned.length)}</p>
              {assigned.map(x => (
                <div key={x.id} className="mt-1 flex items-start justify-between gap-2 rounded-lg border border-hair bg-white px-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block text-ink">{x.content}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{t.from} {x.creator?.display_name ?? 'Admin'}</span>
                  </span>
                  <button onClick={() => void doneTodo(x.id)}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-petrol hover:text-petrol-hover">✓ {t.done}</button>
                </div>
              ))}
            </div>
          )}
          {reopened.length > 0 && (
            <div>
              <p className="text-danger-text">{t.reopened(reopened.length)}</p>
              {reopened.slice(0, 3).map(r => (
                <Link key={r.id} to={`/am/f/${r.freelancer_id}`}
                  className="mt-0.5 block truncate pl-3 text-muted underline-offset-2 transition hover:text-ink hover:underline">
                  {r.freelancer?.display_name ?? '—'} · {typeLabel(r.task_type, lang)}
                </Link>
              ))}
            </div>
          )}
          {nPending > 0 && (
            <Link to="/am/wallet?focus=pending" className="text-pending-text underline-offset-2 transition hover:underline">
              {t.pending(nPending)}
            </Link>
          )}
          {nRejected > 0 && (
            <Link to="/am/freelancers" className="text-muted underline-offset-2 transition hover:text-ink hover:underline">
              {t.rejected(nRejected)}
            </Link>
          )}
          {phRows.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowPhones(v => !v)}
                className="text-muted underline-offset-2 transition hover:text-ink hover:underline">
                {t.phones(phRows.length)}
              </button>
              {showPhones && (
                <div className="mt-1 space-y-0.5 pl-3">
                  {phRows.map(r => {
                    const left = Math.max(0, Math.ceil((new Date(r.phone_expires_on + 'T00:00:00Z').getTime() - Date.now()) / 86400000))
                    return (
                      <Link key={r.id} to={`/am/f/${r.freelancer_id}`}
                        className="block font-mono text-[11px] text-muted underline-offset-2 transition hover:text-ink hover:underline">
                        ···{(r.phone_number ?? '').slice(-4)} · {lang === 'zh' ? `剩 ${left} 天` : `${left}d left`}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
