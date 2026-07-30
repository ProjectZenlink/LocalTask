import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, MessageSquare, Plus, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Card, Alert } from './ui'

/** 站内聊天中心 v2(Dispatch 单据美学):三端共用。
 *  视觉:首字母头像 / 活跃行墨线 / 日期分隔章 / 同发送者分组 / 圆形发送钮。
 *  逻辑与 v1 完全一致:RPC 权限图 + Realtime + 水位未读 + 脏话拦截。 */

interface ConvRow {
  id: string
  other_id: string
  other_name: string | null
  other_role: 'user' | 'am' | 'admin'
  other_avatar: string | null
  last_message_at: string
  last_body: string | null
  unread: number
  active: boolean
}
interface Msg { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; recalled_at: string | null }
interface Target { id: string; name: string; role: string; avatar?: string | null }

const COPY = {
  zh: {
    title: '消息', sub: '与团队的站内沟通。',
    civil: '请文明沟通,尊重你的账户经理——不当言论将被拦截并记录。',
    empty: '还没有会话。', emptyThread: '还没有消息,说点什么吧。', pickThread: '选择一个会话开始。',
    pickTitle: '发起新会话', search: '搜索…',
    contactAm: '联系我的账户经理', noTargets: '暂无可联系对象(可能还没有归属 AM)。',
    readOnly: '只读', readOnlyHint: '此会话已只读(归属已变更)。', placeholder: '输入消息…',
    blocked: '消息未发送:请文明沟通,尊重你的账户经理。', back: '←',
    roleAm: '账户经理', roleAdmin: '管理员', roleFl: 'Freelancer', close: '关闭', recall: '撤回', recalled: '已撤回',
  },
  en: {
    title: 'Messages', sub: 'On-platform conversations with your team.',
    civil: 'Please keep it civil and respect your account manager — abusive messages are blocked and logged.',
    empty: 'No conversations yet.', emptyThread: 'No messages yet — say hello.', pickThread: 'Pick a conversation to start.',
    pickTitle: 'Start a conversation', search: 'Search…',
    contactAm: 'Contact my account manager', noTargets: 'No one to contact yet (you may not have an AM assigned).',
    readOnly: 'Read-only', readOnlyHint: 'This conversation is read-only (ownership changed).', placeholder: 'Type a message…',
    blocked: 'Not sent: please keep the conversation civil and respect your AM.', back: '←',
    roleAm: 'Account manager', roleAdmin: 'Admin', roleFl: 'Freelancer', close: 'Close', recall: 'Recall', recalled: 'Message recalled',
  },
}

const AVATAR: Record<string, string> = {
  am: 'bg-petrol text-paper',
  admin: 'bg-ink text-paper',
  user: 'bg-hair text-ink-soft',
}

function initials(name: string | null): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2)).toUpperCase()
}

function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

function AvatarDot({ role, name, path, sizeCls, textCls }: {
  role: string; name: string | null; path?: string | null; sizeCls: string; textCls: string
}) {
  const url = avatarUrl(path)
  if (url) return <img src={url} alt="" className={`${sizeCls} shrink-0 rounded-full object-cover`} />
  return (
    <span className={`flex ${sizeCls} shrink-0 items-center justify-center rounded-full font-display ${textCls} font-medium ${AVATAR[role] ?? AVATAR.user}`}>
      {initials(name)}
    </span>
  )
}

export default function ChatCenter({ lang, myRole }: { lang: 'zh' | 'en'; myRole: 'user' | 'am' | 'admin' }) {
  const t = COPY[lang]
  const loc = lang === 'zh' ? 'zh-CN' : 'en-US'
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

  const relTime = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' })
  }
  const dayChip = (ts: string) =>
    new Date(ts).toLocaleDateString(loc, { month: 'short', day: 'numeric' }).toUpperCase()
  const bubbleTime = (ts: string) =>
    new Date(ts).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Msg
        if (m.conversation_id === selRef.current) {
          setMsgs(prev => prev.map(x => (x.id === m.id ? m : x)))
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

  async function recall(id: string) {
    setError(null)
    const { error: e } = await supabase.rpc('recall_message', { p_id: id })
    if (e) { setError(e.message); return }
    if (selRef.current) await loadMsgs(selRef.current)
  }

  const cur = convs.find(c => c.id === sel) ?? null
  const filteredTargets = targets.filter(x =>
    !tq.trim() || (x.name ?? '').toLowerCase().includes(tq.trim().toLowerCase()))
  // freelancer 只有一个对象:与 AM 的活跃线已存在时,主按钮就是冗余,隐藏
  const showContactBtn = myRole === 'user' && !convs.some(c => c.other_role === 'am' && c.active)

  /* ── 会话列表 ── */
  const list = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-hair px-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.title}</span>
        {myRole !== 'user' && (
          <button onClick={() => void openPicker()} title={t.pickTitle}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-hair text-muted transition hover:border-petrol/40 hover:text-petrol">
            <Plus size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {convs.length === 0 && !showContactBtn && (
          <p className="p-6 text-center font-mono text-[11px] uppercase tracking-wider text-faint">{t.empty}</p>
        )}
        {convs.map(c => (
          <button key={c.id} onClick={() => setSel(c.id)}
            className={`relative block w-full border-b border-hair px-4 py-3 text-left transition hover:bg-paper ${sel === c.id ? 'bg-paper' : ''}`}>
            {sel === c.id && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-petrol" />}
            <span className="flex items-center gap-3">
              <AvatarDot role={c.other_role} name={c.other_name} path={c.other_avatar} sizeCls="h-9 w-9" textCls="text-[11px]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{c.other_name ?? '—'}</span>
                  <span className="shrink-0 font-mono text-[10px] text-faint">{relTime(c.last_message_at)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">{c.last_body ?? roleLabel(c.other_role)}</span>
                  {c.unread > 0 && (
                    <span className="inline-flex min-w-[1.1rem] shrink-0 items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">{c.unread}</span>
                  )}
                </span>
              </span>
            </span>
          </button>
        ))}
        {showContactBtn && (
          <div className="px-4 py-6">
            <button onClick={() => void openPicker()}
              className="w-full rounded-xl border border-petrol/30 bg-petrol/[0.06] px-4 py-3 text-center font-display text-sm font-medium text-petrol transition hover:bg-petrol/10">
              {t.contactAm}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  /* ── 对话面板:日期分隔 + 同发送者分组 ── */
  const items: ({ kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: Msg; mine: boolean; groupEnd: boolean })[] = []
  msgs.forEach((m, i) => {
    const prev = msgs[i - 1]
    const next = msgs[i + 1]
    if (!prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()) {
      items.push({ kind: 'day', key: `d-${m.id}`, label: dayChip(m.created_at) })
    }
    const groupEnd = !next || next.sender_id !== m.sender_id
      || new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000
      || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString()
    items.push({ kind: 'msg', key: m.id, m, mine: m.sender_id === user?.id, groupEnd })
  })

  const thread = (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hair px-4">
        <button className="font-mono text-sm text-faint transition hover:text-ink md:hidden" onClick={() => setSel(null)}>{t.back}</button>
        {cur && (
          <>
            <AvatarDot role={cur.other_role} name={cur.other_name} path={cur.other_avatar} sizeCls="h-8 w-8" textCls="text-[10px]" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-sm font-medium text-ink">{cur.other_name ?? '—'}</span>
              <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{roleLabel(cur.other_role)}</span>
            </span>
            {!cur.active && (
              <span className="shrink-0 rounded border border-hair px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-faint">{t.readOnly}</span>
            )}
          </>
        )}
      </div>
      {myRole === 'user' && (
        <p className="flex shrink-0 items-start gap-2 border-b border-hair bg-pending-bg/60 px-4 py-2 text-[11px] leading-relaxed text-pending-text">
          <ShieldCheck size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          {t.civil}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <p className="pt-16 text-center font-mono text-[11px] uppercase tracking-wider text-faint">{t.emptyThread}</p>
        )}
        {items.map(it =>
          it.kind === 'day' ? (
            <div key={it.key} className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-hair" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-faint">{it.label}</span>
              <span className="h-px flex-1 bg-hair" />
            </div>
          ) : (
            <div key={it.key} className={`ld-fade group flex items-end gap-2 ${it.mine ? 'justify-end' : 'justify-start'} ${it.groupEnd ? 'mb-3' : 'mb-1'}`}>
              {!it.mine && (
                it.groupEnd && cur
                  ? <AvatarDot role={cur.other_role} name={cur.other_name} path={cur.other_avatar} sizeCls="h-6 w-6" textCls="text-[9px]" />
                  : <span className="w-6 shrink-0" />
              )}
              <div className="max-w-[74%]">
                {it.m.recalled_at ? (
                  <div className="rounded-2xl border border-dashed border-hair px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-faint">
                    {t.recalled}
                  </div>
                ) : (
                  <div className={`px-3.5 py-2 text-sm leading-relaxed ${
                    it.mine
                      ? `bg-petrol text-paper ${it.groupEnd ? 'rounded-2xl rounded-br-md' : 'rounded-2xl'}`
                      : `border border-hair bg-white text-ink ${it.groupEnd ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'}`
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{it.m.body}</p>
                  </div>
                )}
                {it.groupEnd && (
                  <p className={`mt-1 flex items-center gap-2 font-mono text-[9.5px] text-faint ${it.mine ? 'justify-end' : 'justify-start'}`}>
                    {it.mine && !it.m.recalled_at && Date.now() - new Date(it.m.created_at).getTime() < 5 * 60 * 1000 && (
                      <button onClick={() => void recall(it.m.id)}
                        className="opacity-0 transition hover:text-petrol group-hover:opacity-100">
                        {t.recall}
                      </button>
                    )}
                    <span>{bubbleTime(it.m.created_at)}</span>
                  </p>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      {cur && !cur.active ? (
        <p className="shrink-0 border-t border-hair px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.readOnlyHint}</p>
      ) : (
        <div className="flex shrink-0 items-end gap-2.5 border-t border-hair px-4 py-3">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} placeholder={t.placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            className="max-h-32 min-h-[2.6rem] flex-1 resize-none rounded-2xl border border-hair bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-petrol focus:ring-2 focus:ring-petrol/15" />
          <button onClick={() => void send()} disabled={busy || !draft.trim()} title="Send"
            className="flex h-[2.6rem] w-[2.6rem] shrink-0 items-center justify-center rounded-full bg-petrol text-paper shadow-[0_6px_18px_rgba(36,75,77,0.28)] transition hover:bg-petrol-hover disabled:opacity-35 disabled:shadow-none">
            <ArrowUp size={17} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="overflow-hidden p-0">
        <div className="grid h-[68vh] md:grid-cols-[300px_1fr]">
          <div className={`${sel ? 'hidden md:block' : 'block'} border-r border-hair`}>{list}</div>
          <div className={`${sel ? 'block' : 'hidden md:block'}`}>
            {sel ? thread : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-faint">
                <MessageSquare size={28} strokeWidth={1.25} />
                <p className="font-mono text-[11px] uppercase tracking-[0.2em]">{t.pickThread}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {picker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={() => setPicker(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-sm" onClick={e => e.stopPropagation()}>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{t.pickTitle}</p>
            {targets.length === 0 ? (
              <p className="text-sm text-muted">{t.noTargets}</p>
            ) : (
              <>
                <input value={tq} onChange={e => setTq(e.target.value)} placeholder={t.search}
                  className="mb-3 w-full rounded-xl border border-hair bg-white px-3.5 py-2 text-sm outline-none transition focus:border-petrol focus:ring-2 focus:ring-petrol/15" />
                <div className="max-h-72 overflow-y-auto">
                  {filteredTargets.map(x => (
                    <button key={x.id} onClick={() => void startWith(x.id)}
                      className="flex w-full items-center gap-3 border-b border-hair px-2 py-2.5 text-left transition last:border-b-0 hover:bg-paper">
                      <AvatarDot role={x.role === 'freelancer' ? 'user' : x.role} name={x.name} path={x.avatar} sizeCls="h-8 w-8" textCls="text-[10px]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{x.name ?? '—'}</span>
                        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">{roleLabel(x.role)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setPicker(false)}
              className="mt-3 w-full rounded-xl border border-hair py-2 text-sm text-muted transition hover:text-ink">{t.close}</button>
          </div>
        </div>
      )}
    </div>
  )
}
