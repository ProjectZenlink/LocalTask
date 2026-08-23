import { useCallback, useEffect, useRef, useState } from 'react'
import { Zap, ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from './ui'
import type { QuickReply } from '../types/database'

/** 自定义快捷话术(v63 ⑥):严格仅本人可见(RLS owner 锁死,admin 也看不到别人的)。
 *  弹层点选即插入输入框;「管理」弹窗支持 新增/删除/上下排序。 */

const COPY = {
  zh: { title: '快捷话术', empty: '还没有话术 —— 点「管理」添加常用回复。', manage: '管理',
        mTitle: '管理快捷话术', ph: '写一条常用回复…', add: '添加', close: '关闭', hint: '仅你自己可见。' },
  en: { title: 'Quick replies', empty: 'No phrases yet — click Manage to add your go-to replies.', manage: 'Manage',
        mTitle: 'Manage quick replies', ph: 'Write a reply you use often…', add: 'Add', close: 'Close', hint: 'Visible only to you.' },
}

export default function QuickReplies({
  meId, lang, onPick,
}: { meId: string; lang: 'zh' | 'en'; onPick: (body: string) => void }) {
  const t = COPY[lang]
  const [open, setOpen] = useState(false)
  const [manage, setManage] = useState(false)
  const [rows, setRows] = useState<QuickReply[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('quick_replies').select('*')
      .order('sort').order('created_at')
    setRows((data ?? []) as QuickReply[])
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function add() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    const nextSort = rows.length > 0 ? Math.max(...rows.map(r => r.sort)) + 1 : 0
    await supabase.from('quick_replies').insert({ owner_id: meId, body, sort: nextSort })
    setBusy(false); setDraft('')
    await load()
  }

  async function remove(id: string) {
    await supabase.from('quick_replies').delete().eq('id', id)
    await load()
  }

  async function move(idx: number, dir: -1 | 1) {
    const other = idx + dir
    if (other < 0 || other >= rows.length) return
    const a = rows[idx]; const b = rows[other]
    await Promise.all([
      supabase.from('quick_replies').update({ sort: b.sort }).eq('id', a.id),
      supabase.from('quick_replies').update({ sort: a.sort }).eq('id', b.id),
    ])
    await load()
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} title={t.title}
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
          open ? 'border-petrol/50 text-petrol' : 'border-hair text-faint hover:border-petrol/40 hover:text-petrol'
        }`}>
        <Zap size={16} strokeWidth={1.8} />
      </button>

      {open && (
        <div className="absolute bottom-11 left-0 z-30 w-80 rounded-2xl border border-hair bg-white p-2.5 shadow-[0_16px_48px_rgba(26,32,30,0.18)]">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.title}</span>
            <button onClick={() => { setOpen(false); setManage(true) }}
              className="font-mono text-[10px] uppercase tracking-wider text-petrol hover:text-petrol-hover">{t.manage}</button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {rows.length === 0 && <p className="px-2 py-3 text-xs leading-relaxed text-faint">{t.empty}</p>}
            {rows.map(r => (
              <button key={r.id} onClick={() => { onPick(r.body); setOpen(false) }}
                className="block w-full rounded-xl px-2.5 py-2 text-left text-sm leading-relaxed text-ink transition hover:bg-paper">
                <span className="line-clamp-2">{r.body}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {manage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={() => setManage(false)}>
          <div className="w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-sm" onClick={e => e.stopPropagation()}>
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.mTitle}</p>
            <p className="mb-3 mt-1 text-xs text-muted">{t.hint}</p>
            <div className="mb-3 max-h-64 space-y-1.5 overflow-y-auto">
              {rows.map((r, i) => (
                <div key={r.id} className="flex items-start gap-2 rounded-xl border border-hair bg-paper/50 px-2.5 py-2">
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">{r.body}</p>
                  <span className="flex shrink-0 gap-1">
                    <button onClick={() => void move(i, -1)} disabled={i === 0}
                      className="text-faint transition hover:text-ink disabled:opacity-25"><ArrowUp size={14} /></button>
                    <button onClick={() => void move(i, 1)} disabled={i === rows.length - 1}
                      className="text-faint transition hover:text-ink disabled:opacity-25"><ArrowDown size={14} /></button>
                    <button onClick={() => void remove(r.id)}
                      className="text-faint transition hover:text-danger-text"><Trash2 size={14} /></button>
                  </span>
                </div>
              ))}
            </div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder={t.ph}
              className="mb-2 w-full resize-none rounded-xl border border-hair bg-white px-3 py-2 text-sm text-ink outline-none focus:border-petrol" />
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !draft.trim()} onClick={() => void add()}>{t.add}</Button>
              <Button variant="ghost" onClick={() => setManage(false)}>{t.close}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
