import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usd, dateShort } from '../lib/format'
import { PageHeading, Card, Button, Alert, Field } from '../components/ui'
import { useLang } from '../admin/i18n'
import { Link } from 'react-router-dom'
import { useAm } from './AmLayout'
import { pingWorkline } from '../lib/workline'
import { AM_ONLINE_WINDOW_MINUTES } from '../lib/leads'
import { friendly } from '../lib/errors'

const COPY = {
  zh: { title: '我的资料', sub: '你的身份、数据一览与联系方式。',
        email: '登录邮箱', joined: '入驻', name: '名字', wa: 'WhatsApp(带国家码)', tg: 'Telegram 用户名', x: 'X (Twitter) 用户名',
        save: '保存', saving: '保存中…', saved: '已保存。',
        roster: '名下人才', balance: '钱包余额', pending: '待复核', active: '进行中任务',
        quick: '快捷入口', qFl: '我的 Freelancer', qPool: '人才库', qWallet: '钱包',
        ratesT: '当前费率', ratesGo: '去钱包调整 →', contactT: '联系方式', contactSub: 'freelancer 在任务页看到的就是这里的联系方式。',
        leadsT: '接收新线索', leadsSub: '开启后,/join 页新访客将可能被自动分配给你;在线判定 = 本开关开启 且 工作台在线(心跳)。',
        leadsOn: '接收中', leadsOff: '已暂停', turnOn: '开启接收', turnOff: '暂停接收',
        autoT: '离线自动回复', autoSub: '你离线(心跳超 2 分钟)时,客户来信将自动回复以下内容;每个会话 60 分钟至多一次;自动回复不计入线索首答。',
        autoPh: '例如:我暂时不在,看到消息会尽快回复你。', autoOn: '已开启', autoOff: '已关闭',
        autoSave: '保存设置', autoSaved: '已保存。', autoTurnOn: '开启并保存',
        avatarT: '头像', avatarSub: '将在消息与工作台中展示。JPG/PNG/WebP,单张 ≤2MB。',
        avUpload: '上传头像', avChange: '更换', avRemove: '移除', avBad: '仅支持 JPG/PNG/WebP 且 ≤2MB。',
        chatOpenT: '对话打开方式', chatOpenSub: '从人才库 / 线索 / 我的 Freelancer 点「对话」时的落点。',
        optDock: '小窗消息', optPage: '消息页面' },
  en: { title: 'My profile', sub: 'Your identity, numbers at a glance and contact info.',
        email: 'Login email', joined: 'Joined', name: 'Name', wa: 'WhatsApp (with country code)', tg: 'Telegram username', x: 'X (Twitter) username',
        save: 'Save', saving: 'Saving…', saved: 'Saved.',
        roster: 'Roster', balance: 'Balance', pending: 'In review', active: 'Active tasks',
        quick: 'Shortcuts', qFl: 'My freelancers', qPool: 'Pool', qWallet: 'Wallet',
        ratesT: 'Current rates', ratesGo: 'Adjust in wallet →', contactT: 'Contact', contactSub: 'This contact info is what freelancers see on their task page.',
        leadsT: 'Accept new leads', leadsSub: 'When on, new visitors from /join may be auto-assigned to you; online = this switch on and the workbench alive (heartbeat).',
        leadsOn: 'Accepting', leadsOff: 'Paused', turnOn: 'Start accepting', turnOff: 'Pause',
        autoT: 'Offline auto-reply', autoSub: 'When you are offline (heartbeat older than 2 min), customer messages get this reply — at most once per conversation per 60 minutes; auto-replies never count as a first reply.',
        autoPh: 'e.g. I am away right now — I will get back to you shortly.', autoOn: 'On', autoOff: 'Off',
        autoSave: 'Save', autoSaved: 'Saved.', autoTurnOn: 'Turn on & save',
        avatarT: 'Avatar', avatarSub: 'Shown in messages and the workbench. JPG/PNG/WebP, up to 2 MB.',
        avUpload: 'Upload avatar', avChange: 'Change', avRemove: 'Remove', avBad: 'JPG/PNG/WebP only, up to 2 MB.',
        chatOpenT: 'Chat opens in', chatOpenSub: 'Where the Chat button lands from Pool / Leads / My freelancers.',
        optDock: 'Dock window', optPage: 'Messages page' },
}

export default function AmMe() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am, refresh } = useAm()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [wa, setWa] = useState('')
  const [tg, setTg] = useState('')
  const [x, setX] = useState('')
  const [stats, setStats] = useState({ roster: 0, balance: 0, pending: 0, active: 0 })
  const [rates, setRates] = useState<{ label: string; amount: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [accepting, setAccepting] = useState<boolean | null>(null)
  const [acceptBusy, setAcceptBusy] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avBusy, setAvBusy] = useState(false)
  const [avErr, setAvErr] = useState<string | null>(null)
  const avFileRef = useRef<HTMLInputElement>(null)
  const [chatMode, setChatMode] = useState<'page' | 'dock'>(
    () => (localStorage.getItem('lt_chat_open') === 'dock' ? 'dock' : 'page'))

  useEffect(() => {
    if (!user) return
    const uid = user.id
    void supabase.from('profiles').select('avatar_url').eq('id', uid).maybeSingle()
      .then(({ data }) => setAvatarUrl((data as { avatar_url: string | null } | null)?.avatar_url ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (avFileRef.current) avFileRef.current.value = ''
    if (!f || !user || avBusy) return
    setAvErr(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 2 * 1024 * 1024) {
      setAvErr(t.avBad); return
    }
    setAvBusy(true)
    const path = `${user.id}/avatar`
    const { error: ue } = await supabase.storage.from('avatars')
      .upload(path, f, { upsert: true, contentType: f.type })
    if (ue) { setAvErr(friendly(ue)); setAvBusy(false); return }
    const pub = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    const url = `${pub}?v=${Date.now()}`
    const { error: pe } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
    if (pe) { setAvErr(friendly(pe)); setAvBusy(false); return }
    setAvatarUrl(url); setAvBusy(false)
  }

  async function removeAvatar() {
    if (!user || avBusy) return
    setAvBusy(true); setAvErr(null)
    await supabase.storage.from('avatars').remove([`${user.id}/avatar`])
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
    setAvatarUrl(null); setAvBusy(false)
  }
  const [autoOn, setAutoOn] = useState(false)
  const [autoText, setAutoText] = useState('')
  const [autoBusy, setAutoBusy] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)

  useEffect(() => {
    if (!am) return
    setName(am.name); setWa(am.whatsapp ?? ''); setTg(am.telegram ?? ''); setX(am.x ?? '')
  }, [am])

  const loadStats = useCallback(async () => {
    if (!am) return
    const [ro, led, pa, at, rt] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('managed_by', am.id).eq('role', 'user'),
      supabase.from('am_wallet_ledger').select('kind, amount').eq('am_id', am.id),
      supabase.from('platform_acceptances').select('amount').eq('am_id', am.id).eq('status', 'pending_admin'),
      supabase.from('tasks').select('id', { count: 'exact', head: true })
        .eq('created_by', am.user_id).in('status', ['in_progress', 'under_review', 'pending_payment']),
      supabase.from('custom_rate_items').select('label, amount').order('label'),
    ])
    const ledger = (led.data ?? []) as { kind: string; amount: number }[]
    const bal = ledger.reduce((a, r) => a + (r.kind === 'commission' ? 1 : -1) * Number(r.amount), 0)
    const pend = ((pa.data ?? []) as { amount: number }[]).reduce((a, r) => a + Number(r.amount), 0)
    setStats({ roster: ro.count ?? 0, balance: bal, pending: pend, active: at.count ?? 0 })
    setRates((rt.data ?? []) as { label: string; amount: number }[])
  }, [am])

  useEffect(() => { void loadStats() }, [loadStats])

  // 接收开关现状(v62)
  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('accepting_leads, auto_reply_enabled, auto_reply_text')
      .eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        const d = data as { accepting_leads: boolean; auto_reply_enabled: boolean; auto_reply_text: string | null } | null
        setAccepting(d?.accepting_leads ?? false)
        setAutoOn(d?.auto_reply_enabled ?? false)
        setAutoText(d?.auto_reply_text ?? '')
      })
  }, [user])

  if (!am) return <p className="text-muted">…</p>

  async function save() {
    setError(null); setSaved(false); setBusy(true)
    const { error: e } = await supabase.from('account_managers').update({
      name: name.trim() || am!.name,
      whatsapp: wa.trim() || null,
      telegram: tg.trim() || null,
      x: x.trim() || null,
    }).eq('id', am!.id)
    setBusy(false)
    if (e) { setError(friendly(e)); return }
    setSaved(true)
    await refresh()
  }

  const initial = (am.name || '?').trim().charAt(0).toUpperCase()

  async function toggleAccepting() {
    if (accepting === null || acceptBusy) return
    setAcceptBusy(true); setError(null)
    const { error: e } = await supabase.rpc('am_set_accepting', { p_on: !accepting })
    setAcceptBusy(false)
    if (e) { setError(friendly(e)); return }
    setAccepting(v => !v)
    pingWorkline()
  }

  async function saveAutoReply(nextOn: boolean) {
    if (autoBusy) return
    setAutoBusy(true); setError(null); setAutoSaved(false)
    const { error: e } = await supabase.rpc('am_set_auto_reply', { p_on: nextOn, p_text: autoText })
    setAutoBusy(false)
    if (e) { setError(friendly(e)); return }
    setAutoOn(nextOn)
    setAutoSaved(true)
    window.setTimeout(() => setAutoSaved(false), 1800)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      {error && <Alert tone="error">{error}</Alert>}

      {/* 报头式身份卡 */}
      <Card className="mb-4 p-6">
        <div className="flex items-center gap-4">
          <span className="group/av relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-petrol font-display text-xl font-medium text-paper">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
            <button onClick={() => avFileRef.current?.click()} disabled={avBusy}
              className="absolute inset-0 hidden items-center justify-center bg-ink/45 font-mono text-[10px] uppercase tracking-wider text-paper group-hover/av:flex">
              {avBusy ? '…' : avatarUrl ? t.avChange : (lang === 'zh' ? '上传' : 'Upload')}
            </button>
            <input ref={avFileRef} type="file" accept="image/jpeg,image/png,image/webp"
              className="hidden" onChange={e => void onAvatarFile(e)} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-display text-xl font-medium tracking-tight text-ink">
              {am.name}
              <span className="rounded border border-hair px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">AM</span>
            </p>
            <p className="mt-1 truncate font-mono text-xs text-faint">
              {t.email} {user?.email} · {t.joined} {dateShort(am.created_at)}
              {avatarUrl && (
                <button onClick={() => void removeAvatar()} disabled={avBusy}
                  className="ml-2 text-danger-text/70 underline-offset-2 transition hover:text-danger-text hover:underline">
                  {t.avRemove}
                </button>
              )}
            </p>
            {avErr && <p className="mt-1 text-xs text-danger-text">{avErr}</p>}
          </div>
        </div>
      </Card>

      {/* v75 ②:对话打开方式 */}
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="block font-mono text-[11px] uppercase tracking-wider text-faint">{t.chatOpenT}</span>
          <span className="mt-0.5 block text-xs text-muted">{t.chatOpenSub}</span>
        </span>
        <span className="flex gap-1.5">
          {(['dock', 'page'] as const).map(k => (
            <button key={k}
              onClick={() => { setChatMode(k); localStorage.setItem('lt_chat_open', k) }}
              className={`rounded-full border px-3 py-1.5 font-mono text-[11px] tracking-wide transition ${
                chatMode === k ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:text-ink'
              }`}>
              {k === 'dock' ? t.optDock : t.optPage}
            </button>
          ))}
        </span>
      </Card>

      {/* 四枚数据瓦片:等宽大数字 = 单据感 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t.roster, v: String(stats.roster) },
          { label: t.active, v: String(stats.active) },
          { label: t.pending, v: usd(stats.pending) },
          { label: t.balance, v: usd(stats.balance) },
        ].map(x2 => (
          <Card key={x2.label} className="p-4">
            <p className="font-mono text-xl font-medium tracking-tight text-ink">{x2.v}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x2.label}</p>
          </Card>
        ))}
      </div>

      {/* 快捷入口 */}
      <Card className="mb-4 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.quick}</p>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/am/my"><Button variant="ghost" className="px-3.5 py-2 text-sm">{t.qFl}</Button></Link>
          <Link to="/am/pool"><Button variant="ghost" className="px-3.5 py-2 text-sm">{t.qPool}</Button></Link>
          <Link to="/am/wallet"><Button variant="ghost" className="px-3.5 py-2 text-sm">{t.qWallet}</Button></Link>
        </div>
      </Card>

      {/* 费率速览(只读;调整在钱包) */}
      {rates.length > 0 && (
        <Card className="mb-4 p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.ratesT}</p>
            <Link to="/am/wallet" className="text-xs text-petrol underline underline-offset-2">{t.ratesGo}</Link>
          </div>
          {rates.map(r => (
            <div key={r.label} className="flex items-center justify-between border-b border-hair py-2 last:border-b-0">
              <span className="text-sm text-ink">{r.label}</span>
              <span className="font-mono text-sm text-ink">{usd(r.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* 接收新线索开关(v62) */}
      <Card className="mb-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-faint">
              {t.leadsT}
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                accepting ? 'border-verified-border text-verified-text' : 'border-inactive-border text-inactive-text'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${accepting ? 'bg-verified' : 'bg-inactive'}`} />
                {accepting ? t.leadsOn : t.leadsOff}
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.leadsSub.replace('2', String(AM_ONLINE_WINDOW_MINUTES))}</p>
          </div>
          <Button variant={accepting ? 'ghost' : 'primary'} className="shrink-0 px-4 py-2 text-sm"
            disabled={accepting === null || acceptBusy} onClick={() => void toggleAccepting()}>
            {accepting ? t.turnOff : t.turnOn}
          </Button>
        </div>
      </Card>

      {/* 离线自动回复(v64 ⑧) */}
      <Card className="mb-4 p-5">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-faint">
          {t.autoT}
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            autoOn ? 'border-verified-border text-verified-text' : 'border-inactive-border text-inactive-text'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${autoOn ? 'bg-verified' : 'bg-inactive'}`} />
            {autoOn ? t.autoOn : t.autoOff}
          </span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.autoSub}</p>
        <textarea value={autoText} onChange={e => setAutoText(e.target.value)} rows={3} placeholder={t.autoPh}
          className="mt-3 w-full resize-none rounded-xl border border-hair bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-petrol" />
        <div className="mt-2 flex gap-2">
          <Button className="flex-1" disabled={autoBusy} onClick={() => void saveAutoReply(true)}>
            {autoSaved && autoOn ? t.autoSaved : autoOn ? t.autoSave : t.autoTurnOn}
          </Button>
          {autoOn && (
            <Button variant="ghost" disabled={autoBusy} onClick={() => void saveAutoReply(false)}>{t.autoOff}</Button>
          )}
        </div>
      </Card>

      {/* 联系方式编辑 */}
      <Card className="p-5">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-faint">{t.contactT}</p>
        <p className="mb-4 text-xs text-muted">{t.contactSub}</p>
        <Field label={t.name} value={name} onChange={e => setName(e.target.value)} />
        <Field label={t.wa} value={wa} onChange={e => setWa(e.target.value)} placeholder="+1 555 000 0000" />
        <Field label={t.tg} value={tg} onChange={e => setTg(e.target.value)} placeholder="@username" />
        <Field label={t.x} value={x} onChange={e => setX(e.target.value)} placeholder="@username" />
        <Button onClick={() => void save()} disabled={busy} className="w-full">{busy ? t.saving : t.save}</Button>
        {saved && <p className="mt-3 text-sm text-verified-text">{t.saved}</p>}
      </Card>
    </div>
  )
}
