import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Plus, Feather, MoreHorizontal, Pin, BellOff, MailPlus, Undo2, Languages } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { needsTranslation, translateBatch, prewarmTranslate, translateDraft } from '../lib/translate'
import { PageHeading, Card, Button, Alert } from './ui'
import { parseSystemBody, sysText } from '../lib/leads'
import EmojiPicker from './EmojiPicker'
import AttachmentView from './AttachmentView'
import { ATTACH_ACCEPT, classifyFile, humanSize, MAX_ATTACH_BYTES, uploadChatFile } from '../lib/chatFiles'
import { stickerUrl } from '../lib/stickers'
import QuickReplies from './QuickReplies'
import ChatDrawer from './ChatDrawer'
import RolePill from './RolePill'
import { UserRound, Paperclip, X } from 'lucide-react'

/** 站内聊天中心 v2(Dispatch 单据美学):三端共用。
 *  视觉:首字母头像 / 活跃行墨线 / 日期分隔章 / 同发送者分组 / 圆形发送钮。
 *  逻辑与 v1 完全一致:RPC 权限图 + Realtime + 水位未读 + 脏话拦截。
 *  v61:对方消息自动翻译成当前界面语言(函数侧缓存,只翻一次);轻点可看原文。 */

interface ConvRow {
  id: string
  other_id: string
  other_name: string | null
  other_email: string | null
  last_message_id: string | null
  other_avatar: string | null
  other_role: 'user' | 'am' | 'admin' | 'lead'
  last_message_at: string
  last_body: string | null
  unread: number
  active: boolean
  last_recalled: boolean | null
  last_att: boolean | null
  pinned_at: string | null
  muted: boolean
  manual_unread: boolean
}
interface Msg {
  id: string; conversation_id: string; sender_id: string; body: string
  kind?: 'user' | 'system' | 'auto'
  attachment_path?: string | null; attachment_name?: string | null
  attachment_type?: 'image' | 'file' | null; attachment_size?: number | null
  recalled_at?: string | null
  created_at: string
}
interface Target { id: string; name: string; role: string; email?: string | null }

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
    pin: '置顶', unpin: '取消置顶', markUnread: '标记未读', mute: '静音', unmute: '取消静音',
    recall: '撤回', recallAsk: '撤回这条消息?对方将看到"已撤回"占位。',
    recalled: '已撤回一条消息', attPrev: '📎 附件',
    quickTr: '快译', trPh: '开始输入,自动生成英文预览…', trRedo: '重译', trSendEn: '以英文发送', attach: '发送图片/文件', attErrType: '仅支持 图片(jpg/png/webp/gif) 与 PDF。', attErrSize: '文件不能超过 10MB。', attErrUp: '上传失败,请重试。', autoTag: '自动回复',
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
    pin: 'Pin', unpin: 'Unpin', markUnread: 'Mark unread', mute: 'Mute', unmute: 'Unmute',
    recall: 'Recall', recallAsk: 'Recall this message? The other side will see a placeholder.',
    recalled: 'Message recalled', attPrev: '📎 Attachment',
    quickTr: 'Quick translate', trPh: 'Type to preview the English…', trRedo: 'Retranslate', trSendEn: 'Send in English', attach: 'Send image / file', attErrType: 'Images (jpg/png/webp/gif) and PDF only.', attErrSize: 'Max file size is 10MB.', attErrUp: 'Upload failed — please retry.', autoTag: 'Auto-reply',
  },
}

export default function ChatCenter({ lang, myRole, variant = 'page', onClose, initialWith = null }: {
  lang: 'zh' | 'en'; myRole: 'user' | 'am' | 'admin'; variant?: 'page' | 'dock'
  onClose?: () => void; initialWith?: string | null
}) {
  const dock = variant === 'dock'
  const t = COPY[lang]
  const { user } = useAuth()
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cq, setCq] = useState('')  // v69 ②:会话搜索(名字/邮箱)
  const [stickerBusy, setStickerBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [targets, setTargets] = useState<Target[]>([])
  const [tq, setTq] = useState('')
  const [trs, setTrs] = useState<Record<string, string>>({})
  const requestedRef = useRef<Set<string>>(new Set())
  const ownReqRef = useRef<Set<string>>(new Set())
  const [trsEn, setTrsEn] = useState<Record<string, string>>({})
  const [, setHoldTick] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [trOpen, setTrOpen] = useState(false)
  const [trBusy, setTrBusy] = useState(false)
  const [trText, setTrText] = useState('')
  const trFormRef = useRef<0 | 1 | 2>(0)
  const [msgMenu, setMsgMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
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

  // v70 C3:左栏最后一句批量取译文(与会话内共享同一缓存)
  useEffect(() => {
    const pend = convs.filter(c =>
      c.last_message_id && c.last_body
      && !trs[c.last_message_id]
      && !requestedRef.current.has(c.last_message_id)
      && needsTranslation(c.last_body, lang))
    if (pend.length === 0) return
    for (const c of pend) requestedRef.current.add(c.last_message_id as string)
    void translateBatch(pend.map(c => c.last_message_id as string), lang).then(got => {
      if (Object.keys(got).length > 0) setTrs(prev => ({ ...prev, ...got }))
    })
  }, [convs, lang, trs])
  useEffect(() => { setDrawer(false); setOtherReadAt(null); setPending(null) }, [sel])
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
  useEffect(() => { requestedRef.current = new Set(); setTrs({}) }, [lang])
  useEffect(() => { prewarmTranslate() }, [])

  // v61 自动翻译:对方消息与界面语言不同 → 批量取译文(函数侧缓存,每条只真翻一次)
  useEffect(() => {
    if (!user) return
    const pending = msgs.filter(m => m.sender_id !== user.id && m.kind !== 'system'
      && needsTranslation(m.body, lang) && !requestedRef.current.has(m.id))
    if (pending.length === 0) return
    for (const m of pending) requestedRef.current.add(m.id)
    window.setTimeout(() => setHoldTick(v => v + 1), 2600)  // 兜底揭幕:超时显示原文
    void translateBatch(pending.map(m => m.id), lang).then(got => {
      if (Object.keys(got).length > 0) setTrs(prev => ({ ...prev, ...got }))
      setHoldTick(v => v + 1)
    })
  }, [msgs, lang, user])

  // v79 ③:快译条 —— 草稿 500ms 防抖出英文预览
  useEffect(() => {
    if (!trOpen || myRole === 'user') return
    const d = draft.trim()
    if (!d || !needsTranslation(d, 'en')) { setTrText(''); setTrBusy(false); return }
    setTrBusy(true)
    const h = window.setTimeout(() => {
      const f = (['default', 'more', 'less'] as const)[trFormRef.current]
      void translateDraft(d, 'en', f).then(r => { setTrText(r ?? ''); setTrBusy(false) })
    }, 500)
    return () => window.clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, trOpen])

  async function retranslate() {
    const d = draft.trim()
    if (!d || trBusy) return
    trFormRef.current = ((trFormRef.current + 1) % 3) as 0 | 1 | 2
    setTrBusy(true)
    const f = (['default', 'more', 'less'] as const)[trFormRef.current]
    const r = await translateDraft(d, 'en', f)
    setTrText(r ?? ''); setTrBusy(false)
  }

  // v78 ②:员工自己发出的消息附英文副行(与 FR 所见一致,便于核对)
  useEffect(() => {
    if (!user || myRole === 'user') return
    const own = msgs.filter(m => m.sender_id === user.id && m.kind !== 'system'
      && !m.recalled_at && needsTranslation(m.body, 'en') && !ownReqRef.current.has(m.id))
    if (own.length === 0) return
    for (const m of own) ownReqRef.current.add(m.id)
    void translateBatch(own.map(m => m.id), 'en').then(got => {
      if (Object.keys(got).length > 0) setTrsEn(prev => ({ ...prev, ...got }))
    })
  }, [msgs, user, myRole])

  /** v70 C2:按消息年龄判定 —— 需翻译且落地未满 2.5s 且译文未到 → 占位点;
   *  首帧即命中(不依赖登记时序),从根上消灭"闪原文"。 */
  const holdingTr = (m: Msg) =>
    !trs[m.id] && needsTranslation(m.body, lang)
    && Date.now() - new Date(m.created_at).getTime() < 2500

  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`chat-center-${variant}`)
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
          setMsgs(prev => prev.map(x => (x.id === m.id ? { ...x, ...m } : x)))
        }
        void loadConvs()
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, loadConvs, variant])

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

  // v69 ③:贴纸即发 —— 取签名图→复制为普通图片附件→send_message(路径铁门/活线校验原样生效)
  async function sendSticker(path: string, name: string) {
    if (!sel || !user || stickerBusy) return
    setStickerBusy(true); setError(null)
    try {
      const u = await stickerUrl(path)
      if (!u) throw new Error('sticker unavailable')
      const blob = await (await fetch(u)).blob()
      const file = new File([blob], name, { type: blob.type || 'image/png' })
      const att = await uploadChatFile(sel, user.id, file)
      const { data, error: e } = await supabase.rpc('send_message', {
        p_conversation: sel, p_body: '',
        p_att_path: att.path, p_att_name: att.name,
        p_att_type: att.type, p_att_size: att.size,
      })
      if (e) throw e
      if (!((data as { ok?: boolean } | null)?.ok)) throw new Error('send failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sticker failed')
    }
    setStickerBusy(false)
  }

  // v71 ⑥:会话偏好三件(置顶/静音/标记未读)
  async function setPref(convId: string, patch: { pinned?: boolean; muted?: boolean; unread?: boolean }) {
    if (!user) return
    setRowMenu(null)
    const row: Record<string, unknown> = { user_id: user.id, conversation_id: convId }
    if (patch.pinned !== undefined) row.pinned_at = patch.pinned ? new Date().toISOString() : null
    if (patch.muted !== undefined) row.muted = patch.muted
    if (patch.unread !== undefined) row.manual_unread = patch.unread
    const { error: e } = await supabase.from('conversation_prefs')
      .upsert(row, { onConflict: 'user_id,conversation_id' })
    if (e) { setError(e.message); return }
    await loadConvs()
  }

  // v73.1 ⑦:撤回(仅员工;右键/长按浮层直达,无系统弹窗)
  async function recallMsg(m: Msg) {
    setMsgMenu(null)
    const { error: e } = await supabase.rpc('recall_message', { p_id: m.id })
    if (e) { setError(e.message); return }
    setMsgs(prev => prev.map(x => x.id === m.id
      ? { ...x, body: '', attachment_path: null, attachment_name: null,
          attachment_type: null, attachment_size: null, recalled_at: new Date().toISOString() }
      : x))
    void loadConvs()
  }

  // v69 ①:深链 /messages?with=<profileId> —— 线索页「对话」一步落座(仅整页形态)
  const startWithRef = useRef(startWith)
  startWithRef.current = startWith
  // v75 ③:小窗按需直达某人(lt-open-dock 事件携带)
  useEffect(() => {
    if (!initialWith) return
    void startWithRef.current(initialWith)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWith])

  useEffect(() => {
    if (variant !== 'page') return
    const w = new URLSearchParams(window.location.search).get('with')
    if (!w) return
    void startWithRef.current(w)
    window.history.replaceState(null, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickFile(f: File | null) {
    setError(null)
    if (!f) return
    if (!classifyFile(f)) { setError(t.attErrType); return }
    if (f.size > MAX_ATTACH_BYTES) { setError(t.attErrSize); return }
    setPending(f)
  }

  async function send() { return sendBody(draft) }

  async function sendBody(rawText: string) {
    const text = rawText.trim()
    if (!sel || busy) return
    if (!text && !pending) return
    setBusy(true); setError(null)
    let att: { path: string; name: string; type: 'image' | 'file'; size: number } | null = null
    if (pending && user) {
      try {
        att = await uploadChatFile(sel, user.id, pending)
      } catch {
        setBusy(false); setError(t.attErrUp); return
      }
    }
    const { data, error: e } = await supabase.rpc('send_message', {
      p_conversation: sel, p_body: text,
      p_att_path: att?.path ?? null, p_att_name: att?.name ?? null,
      p_att_type: att?.type ?? null, p_att_size: att?.size ?? null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    const r = data as { ok: boolean; id?: string; error?: string }
    if (!r.ok) { setError(t.blocked); return }
    const sentBody = text
    const newId = (data as { id?: string } | null)?.id
    const opp: 'zh' | 'en' = lang === 'zh' ? 'en' : 'zh'
    if (newId && sentBody && needsTranslation(sentBody, opp)) {
      void translateBatch([newId], opp)  // 预翻收信方语言,写入函数缓存
    }
    setDraft(''); setPending(null)
    if (fileRef.current) fileRef.current.value = ''
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
  const filteredTargets = targets.filter(x => {
    const q = tq.trim().toLowerCase()
    if (!q) return true
    return (x.name ?? '').toLowerCase().includes(q)
        || (x.email ?? '').toLowerCase().includes(q)
  })

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
        <span className="flex items-center gap-1.5">
          {(myRole !== 'user' || convs.length > 0) && (
            <button onClick={() => void openPicker()} title={myRole === 'user' ? t.contactAm : t.pick}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-hair text-faint transition hover:border-petrol/40 hover:text-petrol">
              <Plus size={13} strokeWidth={2} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="×"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-hair text-faint transition hover:text-ink">
              <X size={13} />
            </button>
          )}
        </span>
      </div>
      {convs.length > 0 && (
        <div className="border-b border-hair px-3 py-2">
          <input value={cq} onChange={e => setCq(e.target.value)} placeholder={t.search}
            className="w-full rounded-xl border border-hair bg-white px-3 py-1.5 text-sm outline-none focus:border-petrol" />
        </div>
      )}
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
        {convs.filter(c => {
          const q = cq.trim().toLowerCase()
          if (!q) return true
          return (c.other_name ?? '').toLowerCase().includes(q)
              || (c.other_email ?? '').toLowerCase().includes(q)
        }).map(c => (
          <button key={c.id} onClick={() => setSel(c.id)}
            onContextMenu={e => { e.preventDefault(); setRowMenu({ id: c.id, x: e.clientX, y: e.clientY }) }}
            onTouchStart={e => {
              const t0 = e.touches[0]
              const tgt = e.target as HTMLElement
              const timer = window.setTimeout(() => setRowMenu({ id: c.id, x: t0.clientX, y: t0.clientY }), 500)
              const clear = () => window.clearTimeout(timer)
              tgt.addEventListener('touchend', clear, { once: true })
              tgt.addEventListener('touchmove', clear, { once: true })
            }}
            className={`group relative block w-full px-4 py-3 text-left transition hover:bg-white ${sel === c.id ? 'bg-white' : ''}`}>
            {sel === c.id && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-petrol" />}
            <span onClick={e => { e.stopPropagation(); setRowMenu({ id: c.id, x: e.clientX, y: e.clientY }) }}
              className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full border border-hair bg-white text-faint transition hover:text-ink group-hover:flex">
              <MoreHorizontal size={13} />
            </span>
            <span className="flex items-center gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-[13px] font-medium ${
                c.unread > 0 || c.manual_unread
                  ? (c.other_avatar ? 'ring-2 ring-petrol' : 'bg-petrol text-paper')
                  : 'border border-hair bg-white text-muted'
              }`}>
                {c.other_avatar
                  ? <img src={c.other_avatar} alt="" className="h-full w-full object-cover" />
                  : mono(c.other_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`flex min-w-0 items-center gap-1.5 ${c.unread > 0 || c.manual_unread ? 'font-medium text-ink' : 'text-ink'}`}>
                    <span className="truncate text-sm">{c.other_name ?? '—'}</span>
                    <RolePill role={c.other_role} lang={lang} />
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-faint">
                    {c.pinned_at && <Pin size={10} className="text-petrol" />}
                    {c.muted && <BellOff size={10} />}
                    {listWhen(c.last_message_at)}
                  </span>
                </span>
                {c.other_email && (
                  <span className="block truncate font-mono text-[9.5px] text-faint">{c.other_email}</span>
                )}
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-xs ${c.unread > 0 ? 'text-ink' : 'text-faint'}`}>{c.last_recalled ? <span className="italic">{t.recalled}</span>
                      : ((c.last_message_id ? trs[c.last_message_id] : null)
                         ?? (c.last_body || (c.last_att ? t.attPrev : null))
                         ?? roleLabel(c.other_role))}</span>
                  {c.unread > 0 ? (
                    <span className="inline-flex min-w-[1.05rem] shrink-0 items-center justify-center rounded-full bg-petrol px-1 font-mono text-[9.5px] leading-4 text-paper">{c.unread}</span>
                  ) : c.manual_unread ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-petrol" />
                  ) : null}
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
        <button onClick={() => setSel(null)} title={t.back}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hair text-base leading-none text-muted transition hover:border-petrol/40 hover:text-petrol ${dock ? '' : 'md:hidden'}`}>
          {t.back}
        </button>
        {cur && (
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hair bg-white font-display text-xs font-medium text-muted">
              {cur.other_avatar ? <img src={cur.other_avatar} alt="" className="h-full w-full object-cover" /> : mono(cur.other_name)}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                {cur.other_name ?? '—'} <RolePill role={cur.other_role} lang={lang} />
              </span>
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">{roleLabel(cur.other_role)}{!cur.active && ` · ${t.readOnly}`}</span>
            </span>
          </span>
        )}
        {cur && myRole !== 'user' && (cur.other_role === 'user' || cur.other_role === 'lead') && (
          <button onClick={() => setDrawer(v => !v)} title={t.profileBtn}
            className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
              drawer ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:border-petrol/50 hover:text-petrol'
            }`}>
            <UserRound size={12} strokeWidth={1.8} />{t.profileBtn}
          </button>
        )}
      </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
      {myRole === 'user' && (
        <p className="flex items-center gap-2 border-b border-hair px-4 py-1.5 font-mono text-[10px] tracking-wide text-pending-text">
          <span className="h-1 w-1 shrink-0 rounded-full bg-pending-text" />{t.civil}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {msgs.map((m, idx) => {
          const mine = m.sender_id === user?.id
          const tr = mine ? undefined : trs[m.id]
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
              <div key={m.id} className="group">
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
              <div className={`flex items-center ${mine ? 'justify-end' : 'justify-start'} ${gapPrev && !newDay ? 'mt-3' : 'mt-[3px]'}`}
                {...(mine && myRole !== 'user' && !m.recalled_at ? {
                  onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setMsgMenu({ id: m.id, x: e.clientX, y: e.clientY }) },
                  onTouchStart: (e: React.TouchEvent) => {
                    const t0 = e.touches[0]
                    const tgt = e.target as HTMLElement
                    const timer = window.setTimeout(() => setMsgMenu({ id: m.id, x: t0.clientX, y: t0.clientY }), 500)
                    const clear = () => window.clearTimeout(timer)
                    tgt.addEventListener('touchend', clear, { once: true })
                    tgt.addEventListener('touchmove', clear, { once: true })
                  },
                } : {})}>
                <div className={`max-w-[72%] px-3.5 py-2 text-sm leading-relaxed ${
                  mine
                    ? `bg-petrol text-paper ${groupEnd ? 'rounded-2xl rounded-br-md' : 'rounded-2xl'}`
                    : `border border-hair bg-white text-ink ${groupEnd ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'}`
                }`}>
                  {m.attachment_path && m.attachment_name && m.attachment_type && (
                    <div className={m.body ? 'mb-1.5' : ''}>
                      <AttachmentView path={m.attachment_path} name={m.attachment_name}
                        type={m.attachment_type} size={m.attachment_size ?? 0} mine={mine} />
                    </div>
                  )}
                  {m.recalled_at ? (
                    <span className="inline-flex items-center gap-1.5 py-0.5 italic opacity-70">
                      <Undo2 size={12} /> {t.recalled}
                    </span>
                  ) : null}
                  {!m.recalled_at && m.body && (!mine && holdingTr(m) ? (
                    <span className="inline-flex items-center gap-1 py-1" aria-label="translating">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60 motion-reduce:animate-none" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60 [animation-delay:150ms] motion-reduce:animate-none" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60 [animation-delay:300ms] motion-reduce:animate-none" />
                    </span>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{tr ?? m.body}</p>
                  ))}
                  {mine && myRole !== 'user' && !m.recalled_at && trsEn[m.id] && trsEn[m.id] !== m.body && (
                    <p className="mt-1 whitespace-pre-wrap break-words border-t border-paper/25 pt-1 text-[11.5px] leading-snug opacity-85">
                      {trsEn[m.id]}
                    </p>
                  )}
                  {m.kind === 'auto' && (
                    <p className={`mt-1 font-mono text-[9px] uppercase tracking-[0.14em] ${mine ? 'text-paper/70' : 'text-faint'}`}>· {t.autoTag}</p>
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
            <EmojiPicker lang={lang} onPick={e => setDraft(d => d + e)}
              stickerUid={myRole !== 'user' && user ? user.id : null}
              onSticker={(sp, sn) => void sendSticker(sp, sn)} />
            {myRole !== 'user' && user && (
              <QuickReplies meId={user.id} lang={lang} onPick={b => setDraft(d => (d ? d + '\n' + b : b))} />
            )}
            {myRole !== 'user' && (
              <button type="button" title={t.quickTr} onClick={() => setTrOpen(v => !v)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  trOpen ? 'border-petrol/50 text-petrol' : 'border-hair text-faint hover:border-petrol/40 hover:text-petrol'
                }`}>
                <Languages size={16} strokeWidth={1.8} />
              </button>
            )}
          </div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} placeholder={t.placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            className="max-h-32 min-h-[2.6rem] flex-1 resize-none rounded-2xl border border-hair bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-petrol/50 focus:ring-2 focus:ring-petrol/10" />
          <button onClick={() => void send()} disabled={busy || (!draft.trim() && !pending)} title={t.send}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-petrol text-paper transition hover:bg-petrol-hover disabled:cursor-not-allowed disabled:opacity-30">
            <ArrowUp size={17} strokeWidth={2.25} />
          </button>
        </div>
        {trOpen && myRole !== 'user' && (
          <div className="border-t border-hair bg-paper/60 px-3.5 py-2.5">
            <div className="flex items-start gap-2">
              <p className={`min-h-[1.5rem] flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed ${
                trText ? 'text-ink' : 'text-faint'
              }`}>
                {trBusy ? '…' : (trText || t.trPh)}
              </p>
              <button onClick={() => void retranslate()} disabled={trBusy || !draft.trim()}
                className="shrink-0 rounded-full border border-hair px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:text-ink disabled:opacity-40">
                ↻ {t.trRedo}
              </button>
              <button onClick={() => { const b = trText; setTrText(''); void sendBody(b) }}
                disabled={trBusy || !trText}
                className="shrink-0 rounded-full bg-petrol px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-paper transition hover:bg-petrol-hover disabled:opacity-40">
                {t.trSendEn}
              </button>
            </div>
          </div>
        )}
        </>
      )}
      {drawer && cur && user && (cur.other_role === 'user' || cur.other_role === 'lead') && (
        <ChatDrawer
          otherId={cur.other_id}
          otherRole={cur.other_role}
          otherName={cur.other_name}
          lang={lang}
          isAdmin={myRole === 'admin'}
          meId={user.id}
          down={dock}
          onClose={() => setDrawer(false)}
        />
      )}
      </div>
    </div>
  )

  // v73.1 ⑦:消息浮动菜单(撤回)
  const menuMsg = msgMenu ? msgs.find(x => x.id === msgMenu.id) ?? null : null
  const msgMenuEl = msgMenu && menuMsg && (
    <div className="fixed inset-0 z-40" onClick={() => setMsgMenu(null)}
      onContextMenu={e => { e.preventDefault(); setMsgMenu(null) }}>
      <div className="absolute w-36 rounded-xl border border-hair bg-white py-1 shadow-[0_16px_48px_rgba(26,32,30,0.18)]"
        style={{ left: Math.min(msgMenu.x, window.innerWidth - 156), top: Math.min(msgMenu.y, window.innerHeight - 70) }}
        onClick={e => e.stopPropagation()}>
        <button onClick={() => void recallMsg(menuMsg)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-danger-text transition hover:bg-paper">
          <Undo2 size={14} /> {t.recall}
        </button>
      </div>
    </div>
  )

  // v71 ⑥:会话行浮动菜单
  const menuConv = rowMenu ? convs.find(c => c.id === rowMenu.id) ?? null : null
  const rowMenuEl = rowMenu && menuConv && (
    <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)}
      onContextMenu={e => { e.preventDefault(); setRowMenu(null) }}>
      <div className="absolute w-44 rounded-xl border border-hair bg-white py-1 shadow-[0_16px_48px_rgba(26,32,30,0.18)]"
        style={{ left: Math.min(rowMenu.x, window.innerWidth - 190), top: Math.min(rowMenu.y, window.innerHeight - 150) }}
        onClick={e => e.stopPropagation()}>
        <button onClick={() => void setPref(menuConv.id, { pinned: !menuConv.pinned_at })}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition hover:bg-paper">
          <Pin size={14} className="text-faint" /> {menuConv.pinned_at ? t.unpin : t.pin}
        </button>
        <button onClick={() => void setPref(menuConv.id, { unread: true })}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition hover:bg-paper">
          <MailPlus size={14} className="text-faint" /> {t.markUnread}
        </button>
        <button onClick={() => void setPref(menuConv.id, { muted: !menuConv.muted })}
          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition hover:bg-paper">
          <BellOff size={14} className="text-faint" /> {menuConv.muted ? t.unmute : t.mute}
        </button>
      </div>
    </div>
  )

  // 选人弹窗(页/坞共用;fixed 定位不受外壳影响)
  const pickerModal = (
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
                        <span className="block truncate font-mono text-[9.5px] text-faint">
                          <span className="uppercase tracking-wider">{roleLabel(x.role)}</span>
                          {x.email ? <span> · {x.email}</span> : null}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setPicker(false)}>{t.close}</Button>
          </div>
    </div>
  )

  if (dock) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {error && <p className="border-b border-hair bg-danger-bg px-3 py-1.5 text-xs text-danger-text">{error}</p>}
        <div className="min-h-0 flex-1">
          {sel ? <div className="h-full min-h-0">{thread}</div>
               : <div className="flex h-full min-h-0 flex-col">{list}</div>}
        </div>
        {picker && pickerModal}
        {rowMenuEl}
        {msgMenuEl}
      </div>
    )
  }

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

      {picker && pickerModal}
      {rowMenuEl}
      {msgMenuEl}
    </div>
  )
}
