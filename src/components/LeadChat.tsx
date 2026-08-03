import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { needsTranslation, translateBatch, prewarmTranslate } from '../lib/translate'
import { parseSystemBody, sysText } from '../lib/leads'
import EmojiPicker from './EmojiPicker'
import AttachmentView from './AttachmentView'
import { ATTACH_ACCEPT, classifyFile, humanSize, MAX_ATTACH_BYTES, uploadChatFile } from '../lib/chatFiles'

/** 访客(lead)单线程聊天(v62):/join 引导页内嵌,与站内聊天同一后端 ——
 *  同一条 send_message 权限图、同一套脏话拦截、同一张翻译缓存表、同一路 Realtime。
 *  只砍掉会话列表:lead 只有一条线(归属顾问)。系统通知(kind='system')居中灰章渲染。 */

interface Msg {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  kind?: 'user' | 'system' | 'auto'
  attachment_path?: string | null; attachment_name?: string | null
  attachment_type?: 'image' | 'file' | null; attachment_size?: number | null
  recalled_at?: string | null
  created_at: string
}

const COPY = {
  en: {
    civil: 'Please keep it civil — abusive messages are blocked and logged.',
    placeholder: 'Type a message…', send: 'Send',
    blocked: 'Not sent: please keep the conversation civil.',
    readOnly: 'This conversation is read-only.',
    empty: 'Say hello — your advisor will reply here.',
    attach: 'Send image / file', attErrType: 'Images (jpg/png/webp/gif) and PDF only.',
    attErrSize: 'Max file size is 10MB.', attErrUp: 'Upload failed — please retry.', autoTag: 'Auto-reply',
  },
  zh: {
    civil: '请文明沟通 —— 不当言论将被拦截并记录。',
    placeholder: '输入消息…', send: '发送',
    blocked: '消息未发送:请文明沟通。',
    readOnly: '此会话已只读。',
    empty: '打个招呼吧 —— 顾问会在这里回复你。',
    attach: '发送图片/文件', attErrType: '仅支持 图片(jpg/png/webp/gif) 与 PDF。',
    attErrSize: '文件不能超过 10MB。', attErrUp: '上传失败,请重试。', autoTag: '自动回复',
  },
}

export default function LeadChat({
  conversationId, meId, otherId, lang, readOnly,
}: {
  conversationId: string
  meId: string
  otherId: string | null
  lang: 'zh' | 'en'
  readOnly: boolean
}) {
  const t = COPY[lang]
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [roHit, setRoHit] = useState(false)
  const [trs, setTrs] = useState<Record<string, string>>({})
  const [showOrig, setShowOrig] = useState<Record<string, boolean>>({})
  const requestedRef = useRef<Set<string>>(new Set())
  const [, setHoldTick] = useState(0)
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const ro = readOnly || roHit

  const loadMsgs = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', conversationId).order('created_at').limit(500)
    setMsgs((data ?? []) as Msg[])
    await supabase.rpc('mark_read', { p_conversation: conversationId })
  }, [conversationId])

  useEffect(() => { void loadMsgs() }, [loadMsgs])
  useEffect(() => { prewarmTranslate() }, [])

  // v63 ④:对方已读水位(15s + 回焦刷新)
  const loadOtherRead = useCallback(async () => {
    if (!otherId) { setOtherReadAt(null); return }
    const { data } = await supabase.from('message_reads')
      .select('read_at').eq('conversation_id', conversationId).eq('user_id', otherId).maybeSingle()
    setOtherReadAt((data as { read_at: string } | null)?.read_at ?? null)
  }, [conversationId, otherId])
  useEffect(() => {
    void loadOtherRead()
    const timer = window.setInterval(() => void loadOtherRead(), 15_000)
    const onWake = () => { if (document.visibilityState === 'visible') void loadOtherRead() }
    document.addEventListener('visibilitychange', onWake)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onWake) }
  }, [loadOtherRead])
  useEffect(() => { void loadOtherRead() }, [msgs.length, loadOtherRead])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // 语言切换清空重取(缓存表两种语言都在,重取零额度)
  useEffect(() => { requestedRef.current = new Set(); setTrs({}); setShowOrig({}) }, [lang])

  // 对方普通消息与界面语言不同 → 批量取译文;系统通知中英内置,不走翻译
  useEffect(() => {
    const pending = msgs.filter(m => m.sender_id !== meId && m.kind !== 'system'
      && needsTranslation(m.body, lang) && !requestedRef.current.has(m.id))
    if (pending.length === 0) return
    for (const m of pending) requestedRef.current.add(m.id)
    window.setTimeout(() => setHoldTick(v => v + 1), 2600)
    void translateBatch(pending.map(m => m.id), lang).then(got => {
      if (Object.keys(got).length > 0) setTrs(prev => ({ ...prev, ...got }))
      setHoldTick(v => v + 1)
    })
  }, [msgs, lang, meId])

  const holdingTr = (m: Msg) =>
    !trs[m.id] && needsTranslation(m.body, lang)
    && Date.now() - new Date(m.created_at).getTime() < 2500

  useEffect(() => {
    const ch = supabase.channel(`lead-chat-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Msg
        if (m.conversation_id !== conversationId) return
        setMsgs(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
        void supabase.rpc('mark_read', { p_conversation: conversationId })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Msg
        if (m.conversation_id === conversationId) {
          setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, ...m } : x)))
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [conversationId])

  function pickFile(f: File | null) {
    setNote(null)
    if (!f) return
    if (!classifyFile(f)) { setNote(t.attErrType); return }
    if (f.size > MAX_ATTACH_BYTES) { setNote(t.attErrSize); return }
    setPending(f)
  }

  async function send() {
    if (ro || busy) return
    if (!draft.trim() && !pending) return
    setBusy(true); setNote(null)
    let att: { path: string; name: string; type: 'image' | 'file'; size: number } | null = null
    if (pending) {
      try {
        att = await uploadChatFile(conversationId, meId, pending)
      } catch {
        setBusy(false); setNote(t.attErrUp); return
      }
    }
    const { data, error } = await supabase.rpc('send_message', {
      p_conversation: conversationId, p_body: draft.trim(),
      p_att_path: att?.path ?? null, p_att_name: att?.name ?? null,
      p_att_type: att?.type ?? null, p_att_size: att?.size ?? null,
    })
    setBusy(false)
    if (error) {
      if (error.message.toLowerCase().includes('read-only')) setRoHit(true)
      else setNote(error.message)
      return
    }
    const r = data as { ok: boolean }
    if (!r.ok) { setNote(t.blocked); return }
    const sentBody = draft.trim()
    const newId = (data as { ok?: boolean; id?: string } | null)?.id
    const opp: 'zh' | 'en' = lang === 'zh' ? 'en' : 'zh'
    if (newId && sentBody && needsTranslation(sentBody, opp)) {
      void translateBatch([newId], opp)
    }
    setDraft(''); setPending(null)
    if (fileRef.current) fileRef.current.value = ''
    await loadMsgs()
  }

  const lastReadMineId = (() => {
    if (!otherReadAt) return null
    const tRead = new Date(otherReadAt).getTime()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.sender_id === meId && m.kind !== 'system' && new Date(m.created_at).getTime() <= tRead) return m.id
    }
    return null
  })()

  const timeShort = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="flex items-center gap-2 border-b border-hair px-4 py-1.5 font-mono text-[10px] tracking-wide text-pending-text">
        <span className="h-1 w-1 shrink-0 rounded-full bg-pending-text" />{t.civil}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <p className="py-10 text-center text-xs text-faint">{t.empty}</p>
        )}
        {msgs.map((m, idx) => {
          const prev = msgs[idx - 1]
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
          const sep = newDay && (
            <div className="my-4 flex items-center gap-3 first:mt-0">
              <span className="h-px flex-1 bg-hair" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-faint">{dayLabel(m.created_at)}</span>
              <span className="h-px flex-1 bg-hair" />
            </div>
          )
          if (m.kind === 'system') {
            const sys = parseSystemBody(m.body)
            return (
              <div key={m.id}>
                {sep}
                <div className="my-3 flex justify-center">
                  <span className="max-w-[85%] rounded-full border border-hair bg-white px-3.5 py-1.5 text-center font-mono text-[10.5px] leading-relaxed text-faint">
                    {sys ? sysText(sys, lang) : m.body}
                  </span>
                </div>
              </div>
            )
          }
          const mine = m.sender_id === meId
          const tr = mine ? undefined : trs[m.id]
          const showO = !!showOrig[m.id]
          return (
            <div key={m.id}>
              {sep}
              <div className={`mt-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  mine ? 'rounded-br-md bg-petrol text-paper' : 'rounded-bl-md border border-hair bg-white text-ink'
                }`}>
                  {m.attachment_path && m.attachment_name && m.attachment_type && (
                    <div className={m.body ? 'mb-1.5' : ''}>
                      <AttachmentView path={m.attachment_path} name={m.attachment_name}
                        type={m.attachment_type} size={m.attachment_size ?? 0} mine={mine} />
                    </div>
                  )}
                  {m.recalled_at ? (
                    <span className="inline-flex items-center gap-1.5 py-0.5 italic opacity-70">
                      {lang === 'zh' ? '已撤回一条消息' : 'Message recalled'}
                    </span>
                  ) : null}
                  {!m.recalled_at && m.body && (!mine && holdingTr(m) ? (
                    <span className="inline-flex items-center gap-1 py-1" aria-label="translating">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60 motion-reduce:animate-none" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60 [animation-delay:150ms] motion-reduce:animate-none" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60 [animation-delay:300ms] motion-reduce:animate-none" />
                    </span>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{tr && !showO ? tr : m.body}</p>
                  ))}
                  {m.kind === 'auto' && (
                    <p className={`mt-1 font-mono text-[9px] uppercase tracking-[0.14em] ${mine ? 'text-paper/70' : 'text-faint'}`}>· {t.autoTag}</p>
                  )}
                  {tr && (
                    <button
                      onClick={() => setShowOrig(p => ({ ...p, [m.id]: !p[m.id] }))}
                      className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-faint transition hover:text-petrol"
                    >
                      {showO ? (lang === 'zh' ? '看译文' : 'Translation') : (lang === 'zh' ? '看原文' : 'Original')}
                    </button>
                  )}
                </div>
              </div>
              <p className={`mt-1 font-mono text-[9.5px] text-faint ${mine ? 'text-right' : 'text-left'}`}>
                {timeShort(m.created_at)}
                {mine && m.id === lastReadMineId && <span className="text-petrol"> · {lang === 'zh' ? '已读' : 'Read'}</span>}
              </p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {note && (
        <p className="border-t border-hair px-4 py-2 text-center text-xs text-danger-text">{note}</p>
      )}
      {ro ? (
        <p className="border-t border-hair px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.readOnly}</p>
      ) : (
        <>
        {pending && (
          <div className="flex items-center gap-2 border-t border-hair bg-paper/60 px-4 py-1.5">
            <Paperclip size={13} className="shrink-0 text-petrol" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">{pending.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-faint">{humanSize(pending.size)}</span>
            <button onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value = '' }}
              className="shrink-0 text-faint transition hover:text-danger-text"><X size={13} /></button>
          </div>
        )}
        <div className="flex items-end gap-2 border-t border-hair bg-surface px-3.5 py-3">
          <div className="flex shrink-0 gap-1.5 pb-0.5">
            <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="hidden"
              onChange={e => pickFile(e.target.files?.[0] ?? null)} />
            <button type="button" title={t.attach} onClick={() => fileRef.current?.click()}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                pending ? 'border-petrol/50 text-petrol' : 'border-hair text-faint hover:border-petrol/40 hover:text-petrol'
              }`}>
              <Paperclip size={16} strokeWidth={1.8} />
            </button>
            <EmojiPicker onPick={e => setDraft(d => d + e)} />
          </div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} placeholder={t.placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            className="max-h-32 min-h-[2.6rem] flex-1 resize-none rounded-2xl border border-hair bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-petrol/50 focus:ring-2 focus:ring-petrol/10" />
          <button onClick={() => void send()} disabled={busy || (!draft.trim() && !pending)} title={t.send}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petrol text-paper transition hover:bg-petrol-hover disabled:cursor-not-allowed disabled:opacity-30">
            <ArrowUp size={17} strokeWidth={2.25} />
          </button>
        </div>
        </>
      )}
    </div>
  )
}
