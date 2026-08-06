import { useCallback, useEffect, useState } from 'react'
import { getDockOpen, subscribeDock } from '../lib/dockState'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui'
import { useLang } from './i18n'
import { onWorkline, pingWorkline } from '../lib/workline'
import { isClaimable } from '../lib/leads'

/** admin 待办坞(m27):右下浮窗,备忘与派单一体。自留或指派给 AM;AM 侧在今日待办里完成。 */

interface TodoRow {
  id: string; content: string; assigned_am: string | null
  status: 'open' | 'done'; created_at: string
}

const COPY = {
  zh: { pill: '待办', title: '待办与派单', empty: '没有未完成事项。', ph: '写点什么…',
        self: '自留备忘', add: '添加', del: '删', doneBtn: '完成', to: '→', leadWait: '待认领线索' },
  en: { pill: 'Todos', title: 'Todos & assignments', empty: 'Nothing open.', ph: 'Write something…',
        self: 'Keep to myself', add: 'Add', del: 'Del', doneBtn: 'Done', to: '→', leadWait: 'Unclaimed leads' },
}

export default function AdminTodoDock() {
  const [dockOpen, setDockOpen] = useState(getDockOpen)
  useEffect(() => subscribeDock(setDockOpen), [])
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [folded, setFolded] = useState(() => localStorage.getItem('admin_todo_folded') !== '0')
  const [rows, setRows] = useState<TodoRow[]>([])
  const [ams, setAms] = useState<{ id: string; name: string }[]>([])
  const [draft, setDraft] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [leadWait, setLeadWait] = useState(0)

  const load = useCallback(async () => {
    const [td, am] = await Promise.all([
      supabase.from('todos').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('account_managers').select('id, name').eq('is_active', true).order('name'),
    ])
    setRows((td.data ?? []) as TodoRow[])
    setAms((am.data ?? []) as { id: string; name: string }[])
    // 待认领线索计数(v62):与线索页同一惰性谓词
    const { data: ld } = await supabase.from('leads')
      .select('id, status, first_reply_at, assigned_am, assigned_at')
      .eq('status', 'new').is('first_reply_at', null)
    const cand = (ld ?? []) as { id: string; status: 'new'; first_reply_at: null; assigned_am: string | null; assigned_at: string | null }[]
    setLeadWait(cand.filter(l => isClaimable(l)).length)
  }, [])

  // v60 实时化:切页/30s 轮询/回到标签页/站内处理动作即时刷新(与 AM 今日待办同一机制)
  const { pathname } = useLocation()
  useEffect(() => { void load() }, [load, pathname])
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30_000)
    const onWake = () => { if (document.visibilityState === 'visible') void load() }
    const offWorkline = onWorkline(() => void load())
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      window.clearInterval(timer)
      offWorkline()
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [load])

  const amName = (id: string | null) => (id ? ams.find(a => a.id === id)?.name ?? '?' : t.self)

  async function add() {
    if (!draft.trim() || !user || busy) return
    setBusy(true)
    await supabase.from('todos').insert({ content: draft.trim(), created_by: user.id, assigned_am: to || null })
    setBusy(false); setDraft('')
    pingWorkline()
    await load()
  }
  async function done(id: string) { await supabase.rpc('complete_todo', { p_id: id }); pingWorkline(); await load() }
  async function del(id: string) { await supabase.from('todos').delete().eq('id', id); pingWorkline(); await load() }
  function toggle() {
    setFolded(v => { localStorage.setItem('admin_todo_folded', v ? '0' : '1'); return !v })
  }

  if (folded) {
    return (
      <button onClick={toggle}
        className={`fixed bottom-5  z-30 flex items-center gap-2 rounded-full border border-hair bg-surface px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-muted shadow-[0_8px_28px_rgba(26,32,30,0.16)] transition hover:text-ink transition-[right] duration-300 ${dockOpen ? 'right-4 lg:right-[416px]' : 'right-5'}`}>
        {t.pill}
        {rows.length > 0 && (
          <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">{rows.length}</span>
        )}
      </button>
    )
  }

  return (
    <div className={`fixed bottom-5 z-30 w-72 rounded-2xl border border-hair bg-surface p-4 shadow-[0_16px_48px_rgba(26,32,30,0.18)] transition-[right] duration-300 ${dockOpen ? 'right-4 lg:right-[416px]' : 'right-5'}`}>
      <button onClick={toggle} className="mb-3 flex w-full items-center justify-between font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
        {t.title}<span>×</span>
      </button>
      {leadWait > 0 && (
        <Link to="/admin/leads"
          className="mb-3 flex items-center justify-between rounded-xl border border-pending-border bg-pending-bg px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-pending-text transition hover:brightness-95">
          {t.leadWait}
          <span className="inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">{leadWait}</span>
        </Link>
      )}
      <div className="mb-3 max-h-56 space-y-2 overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-faint">{t.empty}</p>}
        {rows.map(r => (
          <div key={r.id} className="rounded-xl border border-hair bg-white p-2.5">
            <p className="text-xs leading-relaxed text-ink">{r.content}</p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] uppercase tracking-wider text-faint">{t.to} {amName(r.assigned_am)}</span>
              <span className="flex shrink-0 gap-1.5">
                <button onClick={() => void done(r.id)} className="font-mono text-[10px] uppercase tracking-wider text-petrol hover:text-petrol-hover">{t.doneBtn}</button>
                <button onClick={() => void del(r.id)} className="font-mono text-[10px] uppercase tracking-wider text-faint hover:text-danger-text">{t.del}</button>
              </span>
            </div>
          </div>
        ))}
      </div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder={t.ph}
        className="mb-2 w-full resize-none rounded-xl border border-hair bg-white px-3 py-2 text-xs text-ink outline-none focus:border-petrol" />
      <div className="flex items-center gap-2">
        <select value={to} onChange={e => setTo(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-hair bg-white px-2.5 py-1.5 text-xs text-ink outline-none focus:border-petrol">
          <option value="">{t.self}</option>
          {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Button className="px-3 py-1.5 text-xs" disabled={busy || !draft.trim()} onClick={() => void add()}>{t.add}</Button>
      </div>
    </div>
  )
}
