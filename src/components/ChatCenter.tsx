import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Plus, Feather } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { needsTranslation, translateBatch } from '../lib/translate'
import { PageHeading, Card, Button, Alert } from './ui'
import { parseSystemBody, sysText } from '../lib/leads'
import EmojiPicker from './EmojiPicker'
import QuickReplies from './QuickReplies'
import ChatDrawer from './ChatDrawer'
import { UserRound } from 'lucide-react'

/** 站内聊天中心 v2(Dispatch 单据美学):三端共用。
 *  视觉:首字母头像 / 活跃行墨线 / 日期分隔章 / 同发送者分组 / 圆形发送钮。
 *  逻辑与 v1 完全一致:RPC 权限图 + Realtime + 水位未读 + 脏话拦截。
 *  v61:对方消息自动翻译成当前界面语言(函数侧缓存,只翻一次);轻点可看原文。 */

interface ConvRow {
  id: string
  other_id: string
  other_name: string | null
  other_role: 'user' | 'am' | 'admin' | 'lead'
  last_message_at: string
  last_body: string | null
  unread: number
  active: boolean
}
interface Msg { id: string; conversation_id: string; sender_id: string; body: string; kind?: 'user' | 'system'; created_at: string }
interface Target { id: string; name: string; role: string }

const COPY = {
  zh: {
    title: '消息', sub: '与团队的站内沟通。', pick: '新会话', send: '发送',
    civil: '请文明沟通,尊重你的账户经理——不当言论将被拦截并记录。',
    empty: '还没有会话。', emptyThread: '还没有消息,说点什么吧。', pickThread: '选择一个会话开始。',
    pickTitle: '发起新会话', search: '搜索…',
    contactAm: '联系我的账户经理', noTargets: '暂无可联系对象(可能还没有归属 AM)。',
    readOnly: '只读', readOnlyHint: '此会话已只读(归属已变更)。', placeholder: '输入消息…',
    blocked: '消息未发送:请文明沟通,尊重你的账户经理。', back: '←',
    roleAm: '账户经理', roleAdmin: '管理员', roleFl: 'Freelancer', roleLead: '访客', close: '关闭',
    orig: '看原文', trBack: '看译文', read: '已读', profileBtn: '客户资料',
  },
  en: {
    title: 'Messages', sub: 'On-platform conversations with your team.', pick: 'New', send: 'Send',
    civil: 'Please keep it civil and respect your account manager — abusive messages are blocked and logged.',
    empty: 'No conversations yet.', emptyThread: 'No messages yet — say hello.', pickThread: 'Pick a conversation to start.',
    pickTitle: 'Start a conversation', search: 'Search…',
    contactAm: 'Contact my account manager', noTargets: 'No one to contact yet (you may not have an AM assigned).',
    readOnly: 'Read-only', readOnlyHint: 'This conversation is read-only (ownership changed).', placeholder: 'Type a message…',
    blocked: 'Not sent: please keep the conversation civil and respect your AM.', back: '←',
    roleAm: 'Account manager', roleAdmin: 'Admin', roleFl: 'Freelancer', roleLead: 'Guest', close: 'Close',
    orig: 'Original', trBack: 'Translation', read: 'Read', profileBtn: 'Customer info',
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
  const [trs, setTrs] = useState<Record<string, string>>({})
  const [showOrig, setShowOrig] = useState<Record<string, boolean>>({})
  const requestedRef = useRef<Set<string>>(new Set())
  const [drawer, setDrawer] = useState(false)
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = sel

  const roleLabel = (r: string) => (r === 'am' ? t.roleAm : r === 'admin' ? t.roleAdmin : r === 'lead' ? t.roleLead : t.roleFl)

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
  useEffect(() => { setDrawer(false); setOtherReadAt(null) }, [sel])
  useEffect(() => { if (sel) void loadMsgs(sel) }, [sel, loadMsgs])

  // v63 ④ 对称已读回执:拉取对方在本会话的已读水位(m43 放宽为双方互见)
  const curOtherId = convs.find(c => c.id === sel)?.other_id ?? null
  const loadOtherRead = useCallback(async () => {
    if (!sel || !curOtherId) { setOtherReadAt(null); return }
    const { data } = await supabase.from('message_reads')
      .select('read_at').eq('conversation_id', sel).eq('user_id', curOtherId).maybeSingle()
    setOtherReadAt((data as { read_at: string } | null)?.read_at ?? null)
  }, [sel, curOtherId])
  useEffect(() => {
    void loadOtherRead()
    if (!sel) return
    const timer = window.setInterval(() => void loadOtherRead(), 15_000)
    const onWake = () => { if (document.visibilityState === 'visible') void loadOtherRead() }
    document.addEventListener('visibilitychange', onWake)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onWake) }
  }, [sel, loadOtherRead])
  useEffect(() => { void loadOtherRead() }, [msgs.length, loadOtherRead])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // v61 自动翻译:界面语言切换时清空重来(缓存表里两种语言都有,重取零额度)
  useEffect(() => { requestedRef.current = new Set(); setTrs({}); setShowOrig({}) }, [lang])

  // v61 自动翻译:对方消息与界面语言不同 → 批量取译文(函数侧缓存,每条只真翻一次)
  useEffect(() => {
    if (!user) return
    const pending = msgs.filter(m => m.sender_id !== user.id && m.kind !== 'system'
      && needsTranslation(m.body, lang) && !requestedRef.current.has(m.id))
    if (pending.length === 0) return
    for (const m of pending) requestedRef.current.add(m.id)
    void translateBatch(pending.map(m => m.id), lang).then(got => {
      if (Object.keys(got).length > 0) setTrs(prev => ({ ...prev, ...got }))
    })
  }, [msgs, lang, user])

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
  // 我方"最后一条已被对方读到"的消息(仅这一条挂「已读」,IM 惯例)
  const lastReadMineId = (() => {
    if (!user || !otherReadAt) return null
    const tRead = new Date(otherReadAt).getTime()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.sender_id === user.id && m.kind !== 'system' && new Date(m.created_at).getTime() <= tRead) return m.id
    }
    return null
  })()
  const filteredTargets = targets.filter(x =>
    !tq.trim() || (x.name ?? '').toLowerCase().includes(tq.trim().toLowerCase()))

  const mono = (n: string | null) => (n ?? '?').trim().charAt(0).toUpperCase() || '?'
  const timeShort = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
  const listWhen = (iso: string) => {
    const d = new Date(iso); const now = new Date()
    return d.toDateString() === now.toDateString() ? timeShort(iso) : dayLabel(iso)
  }

  const list = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-hair px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.title}</span>
        {(myRole !== 'user' || convs.length > 0) && (
          <button onClick={() => void openPicker()} title={myRole === 'user' ? t.contactAm : t.pick}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-hair text-faint transition hover:border-petrol/40 hover:text-petrol">
            <Plus size={13} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {convs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-hair text-faint"><Feather size={16} strokeWidth={1.5} /></span>
            <p className="text-xs leading-relaxed text-faint">{t.empty}</p>
            {myRole === 'user' && (
              <Button variant="ghost" className="px-3.5 py-1.5 text-xs" onClick={() => void openPicker()}>{t.contactAm}</Button>
            )}
          </div>
        )}
        {convs.map(c => (
          <button key={c.id} onClick={() => setSel(c.id)}
            className={`relative block w-full px-4 py-3 text-left transition hover:bg-white ${sel === c.id ? 'bg-white' : ''}`}>
            {sel === c.id && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-petrol" />}
            <span className="flex items-center gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-medium ${c.unread > 0 ? 'bg-petrol text-paper' : 'border border-hair bg-white text-muted'}`}>
                {mono(c.other_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread > 0 ? 'font-medium text-ink' : 'text-ink'}`}>{c.other_name ?? '—'}</span>
                  <span className="shrink-0 font-mono text-[10px] text-faint">{listWhen(c.last_message_at)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-xs ${c.unread > 0 ? 'text-ink' : 'text-faint'}`}>{c.last_body ?? roleLabel(c.other_role)}</span>
                  {c.unread > 0 && (
                    <span className="inline-flex min-w-[1.05rem] shrink-0 items-center justify-center rounded-full bg-petrol px-1 font-mono text-[9.5px] leading-4 text-paper">{c.unread}</span>
                  )}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  const thread = (
    <div className="relative flex h-full min-w-0 flex-col bg-white/40">
      <div className="flex items-center gap-3 border-b border-hair bg-surface px-4 py-2.5">
        <button className="font-mono text-[10px] uppercase tracking-wider text-faint transition hover:text-ink md:hidden" onClick={() => setSel(null)}>{t.back}</button>
        {cur && (
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hair bg-white font-display text-xs font-medium text-muted">{mono(cur.other_name)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{cur.other_name ?? '—'}</span>
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">{roleLabel(cur.other_role)}{!cur.active && ` · ${t.readOnly}`}</span>
            </span>
          </span>
        )}
        {cur && myRole !== 'user' && (cur.other_role === 'user' || cur.other_role === 'lead') && (
          <button onClick={() => setDrawer(v => !v)} title={t.profileBtn}
            className={`ml-auto flex h-7 w-7 items-center justify-center rounded-full border transition ${
              drawer ? 'border-petrol/50 text-petrol' : 'border-hair text-faint hover:text-petrol'
            }`}>
            <UserRound size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {myRole === 'user' && (
        <p className="flex items-center gap-2 border-b border-hair px-4 py-1.5 font-mono text-[10px] tracking-wide text-pending-text">
          <span className="h-1 w-1 shrink-0 rounded-full bg-pending-text" />{t.civil}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {msgs.map((m, idx) => {
          const mine = m.sender_id === user?.id
          const tr = mine ? undefined : trs[m.id]
          const showO = !!showOrig[m.id]
          const prev = msgs[idx - 1]
          const next = msgs[idx + 1]
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
          const gapPrev = !prev || m.sender_id !== prev.sender_id || newDay
            || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000
          const groupEnd = !next || next.sender_id !== m.sender_id
            || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString()
            || new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000
          const daySep = newDay && (
            <div className="my-4 flex items-center gap-3 first:mt-0">
              <span className="h-px flex-1 bg-hair" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-faint">{dayLabel(m.created_at)}</span>
              <span className="h-px flex-1 bg-hair" />
            </div>
          )
          // 系统通知(v62):kind='system' 居中灰章,中英内置模板,不走翻译
          if (m.kind === 'system') {
            const sys = parseSystemBody(m.body)
            return (
              <div key={m.id}>
                {daySep}
                <div className="my-3 flex justify-center">
                  <span className="max-w-[85%] rounded-full border border-hair bg-white px-3.5 py-1.5 text-center font-mono text-[10.5px] leading-relaxed text-faint">
                    {sys ? sysText(sys, lang) : m.body}
                  </span>
                </div>
              </div>
            )
          }
          return (
            <div key={m.id}>
              {daySep}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${gapPrev && !newDay ? 'mt-3' : 'mt-[3px]'}`}>
                <div className={`max-w-[72%] px-3.5 py-2 text-sm leading-relaxed ${
                  mine
                    ? `bg-petrol text-paper ${groupEnd ? 'rounded-2xl rounded-br-md' : 'rounded-2xl'}`
                    : `border border-hair bg-white text-ink ${groupEnd ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'}`
                }`}>
                  <p className="whitespace-pre-wrap break-words">{tr && !showO ? tr : m.body}</p>
                  {tr && (
                    <button
                      onClick={() => setShowOrig(p => ({ ...p, [m.id]: !p[m.id] }))}
                      className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-faint transition hover:text-petrol"
                    >
                      {showO ? t.trBack : t.orig}
                    </button>
                  )}
                </div>
              </div>
              {groupEnd && (
                <p className={`mt-1 font-mono text-[9.5px] text-faint ${mine ? 'text-right' : 'text-left'}`}>
                  {timeShort(m.created_at)}
                  {mine && m.id === lastReadMineId && <span className="text-petrol"> · {t.read}</span>}
                </p>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {cur && !cur.active ? (
        <p className="border-t border-hair px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.readOnly}</p>
      ) : (
        <div className="flex items-end gap-2 border-t border-hair bg-surface px-3.5 py-3">
          <div className="flex shrink-0 gap-1.5 pb-0.5">
            <EmojiPicker onPick={e => setDraft(d => d + e)} />
            {myRole !== 'user' && user && (
              <QuickReplies meId={user.id} lang={lang} onPick={b => setDraft(d => (d ? d + '\n' + b : b))} />
            )}
          </div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} placeholder={t.placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            className="max-h-32 min-h-[2.6rem] flex-1 resize-none rounded-2xl border border-hair bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-petrol/50 focus:ring-2 focus:ring-petrol/10" />
          <button onClick={() => void send()} disabled={busy || !draft.trim()} title={t.send}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petrol text-paper transition hover:bg-petrol-hover disabled:cursor-not-allowed disabled:opacity-30">
            <ArrowUp size={17} strokeWidth={2.25} />
          </button>
        </div>
      )}
      {drawer && cur && user && (cur.other_role === 'user' || cur.other_role === 'lead') && (
        <ChatDrawer
          otherId={cur.other_id}
          otherRole={cur.other_role}
          otherName={cur.other_name}
          lang={lang}
          isAdmin={myRole === 'admin'}
          meId={user.id}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  )

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="overflow-hidden p-0">
        <div className="grid h-[68dvh] min-h-[24rem] md:grid-cols-[300px_1fr]">
          <div className={`${sel ? 'hidden md:flex' : 'flex'} h-full min-h-0 flex-col border-r border-hair`}>{list}</div>
          <div className={`${sel ? 'block' : 'hidden md:block'} h-full min-h-0`}>
            {sel ? thread : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-hair text-faint"><Feather size={17} strokeWidth={1.5} /></span>
                <p className="text-xs text-faint">{t.empty}</p>
              </div>
            )}
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
                      className="flex w-full items-center gap-2.5 border-b border-hair px-2 py-2.5 text-left transition last:border-b-0 hover:bg-paper">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hair bg-white font-display text-xs font-medium text-muted">{mono(x.name)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{x.name ?? '—'}</span>
                        <span className="font-mono text-[9.5px] uppercase tracking-wider text-faint">{roleLabel(x.role)}</span>
                      </span>
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
