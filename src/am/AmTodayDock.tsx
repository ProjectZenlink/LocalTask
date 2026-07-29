import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { bjDay } from '../lib/format'
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
    todos: (n: number) => `${n} 条指派待办`, from: '来自', done: '完成', ciWait: (n: number) => `${n} 人签到待确认`, kycWait: (n: number) => `${n} 份 KYC 待审核`,
  },
  en: {
    title: 'Today', fold: 'Fold', empty: 'All clear — nothing pending ✦',
    reopened: (n: number) => `${n} flagged to handle`,
    pending: (n: number) => `${n} in platform review`,
    rejected: (n: number) => `${n} rejected in last 30d`,
    phones: (n: number) => `${n} phones expiring in 7d`,
    todos: (n: number) => `${n} assigned todo(s)`, from: 'From', done: 'Done', ciWait: (n: number) => `${n} check-in(s) to confirm`, kycWait: (n: number) => `${n} KYC to review`,
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
  const [nPhones, setNPhones] = useState(0)
  const [assigned, setAssigned] = useState<{ id: string; content: string; creator: { display_name: string | null } | null }[]>([])
  const [ciWait, setCiWait] = useState<{ user_id: string; freelancer: { display_name: string | null } | null }[]>([])
  const [kycWait, setKycWait] = useState<{ id: string; display_name: string | null }[]>([])

  const load = useCallback(async () => {
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString()
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const [ro, pe, rj, ph, td, ci, ky] = await Promise.all([
      supabase.from('platform_acceptances')
        .select('id, freelancer_id, task_type, freelancer:profiles!platform_acceptances_freelancer_id_fkey(display_name)')
        .eq('am_id', amId).eq('status', 'reopened').order('reopened_at', { ascending: false }),
      supabase.from('platform_acceptances').select('id', { count: 'exact', head: true })
        .eq('am_id', amId).eq('status', 'pending_admin'),
      supabase.from('platform_acceptances').select('id', { count: 'exact', head: true })
        .eq('am_id', amId).eq('status', 'rejected').gte('decided_at', d30),
      supabase.from('account_records').select('id', { count: 'exact', head: true })
        .lte('phone_expires_on', d7).not('phone_expires_on', 'is', null),
      supabase.from('todos').select('id, content, creator:profiles!created_by(display_name)')
        .eq('status', 'open').order('created_at'),
      supabase.from('checkins').select('user_id, freelancer:profiles!user_id(display_name)')
        .eq('day', bjDay()).is('confirmed_at', null),
      supabase.from('profiles').select('id, display_name')
        .eq('kyc_status', 'pending').eq('managed_by', amId).eq('role', 'user'),
    ])
    setReopened((ro.data ?? []) as unknown as ReRow[])
    setNPending(pe.count ?? 0)
    setNRejected(rj.count ?? 0)
    setNPhones(ph.count ?? 0)
    setAssigned((td.data ?? []) as unknown as { id: string; content: string; creator: { display_name: string | null } | null }[])
    setCiWait((ci.data ?? []) as unknown as { user_id: string; freelancer: { display_name: string | null } | null }[])
    setKycWait((ky.data ?? []) as { id: string; display_name: string | null }[])
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

  const total = reopened.length + nPending + nRejected + nPhones + assigned.length + ciWait.length + kycWait.length

  // 新的待确认/待审出现时自动展开(每会话一次)
  useEffect(() => {
    if ((ciWait.length + kycWait.length) > 0 && folded && !sessionStorage.getItem('am_dock_autopop')) {
      sessionStorage.setItem('am_dock_autopop', '1')
      setFolded(false)
    }
  }, [ciWait.length, kycWait.length, folded])

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
          {ciWait.length > 0 && (
            <div className="mb-1">
              <p className="text-petrol">{t.ciWait(ciWait.length)}</p>
              {ciWait.slice(0, 3).map(x => (
                <Link key={x.user_id} to={`/am/my?focus=${x.user_id}`}
                  className="mt-1 block rounded-lg border border-hair bg-white px-2 py-1.5 text-ink transition hover:border-petrol/40">
                  {x.freelancer?.display_name ?? '—'} <span className="font-mono text-[10px] uppercase tracking-wider text-petrol">→</span>
                </Link>
              ))}
            </div>
          )}
          {kycWait.length > 0 && (
            <div className="mb-1">
              <p className="text-petrol">{t.kycWait(kycWait.length)}</p>
              {kycWait.slice(0, 3).map(x => (
                <Link key={x.id} to={`/am/kyc?focus=${x.id}`}
                  className="mt-1 block rounded-lg border border-hair bg-white px-2 py-1.5 text-ink transition hover:border-petrol/40">
                  {x.display_name ?? '—'} <span className="font-mono text-[10px] uppercase tracking-wider text-petrol">→</span>
                </Link>
              ))}
            </div>
          )}
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
          {nPending > 0 && <p className="text-pending-text">{t.pending(nPending)}</p>}
          {nRejected > 0 && (
            <Link to="/am/freelancers" className="text-muted underline-offset-2 transition hover:text-ink hover:underline">
              {t.rejected(nRejected)}
            </Link>
          )}
          {nPhones > 0 && (
            <Link to="/am/freelancers" className="text-muted underline-offset-2 transition hover:text-ink hover:underline">
              {t.phones(nPhones)}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
