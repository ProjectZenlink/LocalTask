import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Card, Button, Alert } from './ui'

/** 站内聊天中心(m26):三端共用。桌面双栏/移动单栏;Realtime 实时上屏;
 *  发送经 RPC(权限图+旧线只读+脏话拦截);freelancer 视角常驻文明提醒条。 */

interface ConvRow {
  id: string
  other_id: string
  other_name: string | null
  other_role: 'user' | 'am' | 'admin'
  last_message_at: string
  last_body: string | null
  unread: number
  active: boolean
}
interface Msg { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }
interface Target { id: string; name: string; role: string }

const COPY = {
  zh: {
    title: '消息', sub: '与团队的站内沟通。',
    civil: '请文明沟通,尊重你的账户经理——不当言论将被拦截并记录。',
    empty: '还没有会话。', pickTitle: '发起新会话', pick: '新会话', search: '搜索…',
    contactAm: '联系我的账户经理', noTargets: '暂无可联系对象(可能还没有归属 AM)。',
    readOnly: '此会话已只读(归属已变更)。', placeholder: '输入消息,回车发送…',
    send: '发送', blocked: '消息未发送:请文明沟通,尊重你的账户经理。', back: '← 会话列表',
    roleAm: '账户经理', roleAdmin: '管理员', roleFl: 'Freelancer', close: '关闭',
  },
  en: {
    title: 'Messages', sub: 'On-platform conversations with your team.',
    civil: 'Please keep it civil and respect your account manager — abusive messages are blocked and logged.',
    empty: 'No conversations yet.', pickTitle: 'Start a conversation', pick: 'New', search: 'Search…',
    contactAm: 'Contact my account manager', noTargets: 'No one to contact yet (you may not have an AM assigned).',
    readOnly: 'This conversation is read-only (ownership changed).', placeholder: 'Type a message, Enter to send…',
    send: 'Send', blocked: 'Not sent: please keep the conversation civil and respect your AM.', back: '← Conversations',
    roleAm: 'Account manager', roleAdmin: 'Admin', roleFl: 'Freelancer', close: 'Close',
  },
}

export default function ChatCenter({ lang, myRole }: { lang: 'zh' | 'en'; myRole: 'user' | 'am' | 'admin' }) {
  const t = COPY[lang]
  const { user } = useAuth()
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [targets, setTargets] = useState<Target[]>([])
  const [tq, setTq] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = sel

  const roleLabel = (r: string) => (r === 'am' ? t.roleAm : r === 'admin' ? t.roleAdmin : t.roleFl)

  const loadConvs = useCallback(async () => {
    const { data } = await supabase.rpc('list_conversations')
    setConvs((data ?? []) as ConvRow[])
  }, [])

  const loadMsgs = useCallback(async (cid: string) => {
    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', cid).order('created_at').limit(500)
    setMsgs((data ?? []) as Msg[])
    await supabase.rpc('mark_read', { p_conversation: cid })
    void loadConvs()
  }, [loadConvs])

  useEffect(() => { void loadConvs() }, [loadConvs])
  useEffect(() => { if (sel) void loadMsgs(sel) }, [sel, loadMsgs])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // Realtime:新消息 → 开着的对话即时上屏,其余刷新列表
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('chat-center')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Msg
        if (m.conversation_id === selRef.current) {
          setMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
          void supabase.rpc('mark_read', { p_conversation: m.conversation_id })
        }
        void loadConvs()
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, loadConvs])

  async function openPicker() {
    setError(null)
    const { data } = await supabase.rpc('message_targets')
    const list = (data ?? []) as Target[]
    setTargets(list)
    // freelancer 只有一个对象(名下 AM):直接开线不弹选人器
    if (myRole === 'user' && list.length === 1) { await startWith(list[0].id); return }
    setPicker(true)
  }

  async function startWith(otherId: string) {
    setPicker(false)
    const { data, error: e } = await supabase.rpc('open_conversation', { p_other: otherId })
    if (e) { setError(e.message); return }
    await loadConvs()
    setSel(data as string)
  }

  async function send() {
    if (!sel || !draft.trim() || busy) return
    setBusy(true); setError(null)
    const { data, error: e } = await supabase.rpc('send_message', { p_conversation: sel, p_body: draft.trim() })
    setBusy(false)
    if (e) { setError(e.message); return }
    const r = data as { ok: boolean; id?: string; error?: string }
    if (!r.ok) { setError(t.blocked); return }
    setDraft('')
    await loadMsgs(sel)
  }

  const cur = convs.find(c => c.id === sel) ?? null
  const filteredTargets = targets.filter(x =>
    !tq.trim() || (x.name ?? '').toLowerCase().includes(tq.trim().toLowerCase()))

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-hair px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.title}</span>
        <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => void openPicker()}>
          {myRole === 'user' ? t.contactAm : `+ ${t.pick}`}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {convs.length === 0 && <p className="p-5 text-center text-sm text-faint">{t.empty}</p>}
        {convs.map(c => (
          <button key={c.id} onClick={() => setSel(c.id)}
            className={`block w-full border-b border-hair px-4 py-3 text-left transition hover:bg-paper ${sel === c.id ? 'bg-paper' : ''}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{c.other_name ?? '—'}</span>
              {c.unread > 0 && (
                <span className="inline-flex min-w-[1.1rem] shrink-0 items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">{c.unread}</span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{roleLabel(c.other_role)}</span>
              <span className="truncate text-xs text-muted">{c.last_body ?? ''}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  const thread = (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-hair px-4 py-3">
        <button className="font-mono text-[11px] uppercase tracking-wider text-faint hover:text-ink md:hidden" onClick={() => setSel(null)}>{t.back}</button>
        {cur && (
          <span className="min-w-0">
            <span className="truncate text-sm font-medium text-ink">{cur.other_name ?? '—'}</span>
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-faint">{roleLabel(cur.other_role)}</span>
          </span>
        )}
      </div>
      {myRole === 'user' && (
        <p className="border-b border-pending-border bg-pending-bg px-4 py-2 text-xs text-pending-text">{t.civil}</p>
      )}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        {msgs.map(m => {
          const mine = m.sender_id === user?.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? 'bg-petrol text-paper' : 'border border-hair bg-white text-ink'}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 font-mono text-[10px] ${mine ? 'text-paper/60' : 'text-faint'}`}>
                  {new Date(m.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {cur && !cur.active ? (
        <p className="border-t border-hair px-4 py-3 text-center font-mono text-[11px] uppercase tracking-wider text-faint">{t.readOnly}</p>
      ) : (
        <div className="flex items-end gap-2.5 border-t border-hair px-4 py-3">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} placeholder={t.placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-y rounded-xl border border-hair bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-petrol" />
          <Button className="px-4 py-2 text-sm" disabled={busy || !draft.trim()} onClick={() => void send()}>
            {busy ? '…' : t.send}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="overflow-hidden p-0">
        <div className="grid h-[68vh] md:grid-cols-[280px_1fr]">
          <div className={`${sel ? 'hidden md:block' : 'block'} border-r border-hair`}>{list}</div>
          <div className={`${sel ? 'block' : 'hidden md:block'}`}>
            {sel ? thread : <p className="p-8 text-center text-sm text-faint">{t.empty}</p>}
          </div>
        </div>
      </Card>

      {picker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={() => setPicker(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-sm" onClick={e => e.stopPropagation()}>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.pickTitle}</p>
            {targets.length === 0 ? (
              <p className="text-sm text-muted">{t.noTargets}</p>
            ) : (
              <>
                <input value={tq} onChange={e => setTq(e.target.value)} placeholder={t.search}
                  className="mb-3 w-full rounded-xl border border-hair bg-white px-3.5 py-2 text-sm outline-none focus:border-petrol" />
                <div className="max-h-72 overflow-y-auto">
                  {filteredTargets.map(x => (
                    <button key={x.id} onClick={() => void startWith(x.id)}
                      className="block w-full border-b border-hair px-2 py-2.5 text-left transition last:border-b-0 hover:bg-paper">
                      <span className="text-sm text-ink">{x.name ?? '—'}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-faint">{roleLabel(x.role)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setPicker(false)}>{t.close}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
