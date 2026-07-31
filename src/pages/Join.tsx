import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { I18nProvider, useI18n } from '../lib/i18n'
import LogoMark from '../components/LogoMark'
import LeadChat from '../components/LeadChat'
import CaptchaBox, { type TurnstileInstance } from '../components/CaptchaBox'
import { Alert, Button, Input, Label } from '../components/ui'
import { COUNTRY_CODES, normalizeWa, waLooksValid, SUPPORT_NAME } from '../lib/leads'
import type { Lead } from '../types/database'

/** 公开线索引导页 /join(v62):免注册,一张表单直接进站内聊天。
 *  流程:姓名 + WhatsApp(+Telegram 选填) + Turnstile → 匿名会话 → Edge Function
 *  lead-intake 服务端二次验证并落库 → 在线顾问自动分配(负载最少优先)→ 本页聊天;
 *  全员离线则进认领池,页面留守轮询,被认领即自动开聊。英文默认,可切中文。 */

type LeadRow = Lead & { am: { name: string; user_id: string | null } | null }
type Phase = 'probe' | 'member' | 'form' | 'ready'

const COPY = {
  en: {
    title: 'Talk to a local advisor.',
    sub: 'Tell us how to reach you — a LocalTask advisor picks this up in minutes, and the conversation happens right here.',
    name: 'Your name', wa: 'WhatsApp number', tg: 'Telegram (optional)',
    ccLabel: 'Country code',
    privacy: 'We only use this to respond to you.',
    privacyLink: 'Privacy',
    cta: 'Start the conversation', busy: 'Connecting…',
    errName: 'Please enter your name.',
    errWa: 'That WhatsApp number does not look right — check the country code and digits.',
    errCaptcha: 'Please complete the verification first.',
    errGeneric: 'Something went wrong — please try again.',
    advisor: 'Advisor', supportLabel: 'Support',
    convT: 'Your account is ready',
    convB: 'This enquiry has become a full account. Log in to continue with your advisor.',
    convCta: 'Log in',
    memberT: 'You are already signed in',
    memberB: 'This page is for new visitors. Head back to the app to continue.',
    memberCta: 'Go to the app',
  },
  zh: {
    title: '和本地顾问聊聊。',
    sub: '留下联系方式,LocalTask 顾问几分钟内接手,对话就在本页进行。',
    name: '你的名字', wa: 'WhatsApp 号码', tg: 'Telegram(选填)',
    ccLabel: '国家码',
    privacy: '这些信息只用于回复你。',
    privacyLink: '隐私政策',
    cta: '开始对话', busy: '连接中…',
    errName: '请填写名字。',
    errWa: 'WhatsApp 号码看起来不对 —— 请检查国家码和位数。',
    errCaptcha: '请先完成人机验证。',
    errGeneric: '出了点问题,请重试。',
    advisor: '顾问', supportLabel: '官方支持',
    convT: '你的账号已就绪',
    convB: '这条咨询已转为正式账号,请登录后继续与顾问沟通。',
    convCta: '去登录',
    memberT: '你已经登录',
    memberB: '本页面向新访客。回到应用继续使用即可。',
    memberCta: '回到应用',
  },
}

function JoinInner() {
  const { lang, toggle } = useI18n()
  const t = COPY[lang]
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('probe')
  const [lead, setLead] = useState<LeadRow | null>(null)
  const [convId, setConvId] = useState<string | null>(null)
  const [supUid, setSupUid] = useState<string | null>(null)
  const [fastConv, setFastConv] = useState<string | null>(null)

  // v63 ⑪:接待档身份(全员离线时访客直连 LocalTask Support)
  useEffect(() => {
    void supabase.rpc('support_profile_id').then(({ data }) => {
      if (typeof data === 'string') setSupUid(data)
    })
  }, [])

  const [name, setName] = useState('')
  const [cc, setCc] = useState('1')
  const [waNum, setWaNum] = useState('')
  const [tg, setTg] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const captchaRef = useRef<TurnstileInstance>(null)
  const tokenWaiter = useRef<((tok: string) => void) | null>(null)

  const onToken = useCallback((tok: string | null) => {
    setCaptchaToken(tok)
    if (tok && tokenWaiter.current) { tokenWaiter.current(tok); tokenWaiter.current = null }
  }, [])



  const fetchLead = useCallback(async (uid: string): Promise<LeadRow | null> => {
    const { data } = await supabase.from('leads')
      .select('*, am:account_managers!assigned_am(name, user_id)')
      .eq('profile_id', uid).maybeSingle()
    return (data ?? null) as LeadRow | null
  }, [])

  // v67 保险丝:初探 2.5s 未决 → 强制落表单,杜绝白屏
  useEffect(() => {
    if (phase !== 'probe') return
    const id = window.setTimeout(() => setPhase(p => (p === 'probe' ? 'form' : p)), 2500)
    return () => window.clearTimeout(id)
  }, [phase])

  // 首探:有会话 → 找线索;有邮箱账号 → 会员提示;否则表单
  useEffect(() => {
    if (loading) return
    let alive = true
    void (async () => {
      if (!user) { if (alive) setPhase('form'); return }
      const l = await fetchLead(user.id)
      if (!alive) return
      if (l) { setLead(l); setPhase('ready'); return }
      if (user.email) { setPhase('member'); return }
      setPhase('form')
    })()
    return () => { alive = false }
  }, [user, loading, fetchLead])

  // 认领池轮询(12s) + 聊天期状态轮询(30s/回焦):归属变化即换线,转化即只读
  useEffect(() => {
    if (phase !== 'ready' || !user) return
    const interval = lead?.assigned_am ? 30_000 : 10_000
    const tick = async () => { const l = await fetchLead(user.id); if (l) setLead(l) }
    const timer = window.setInterval(() => void tick(), interval)
    const onWake = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [phase, user, lead?.assigned_am, fetchLead])

  // 开线目标 = 归属顾问,离线兜底 = LocalTask Support(m43);
  // 认领后 target 从 Support 切到顾问,消息已在库侧随线搬入,访客零断层
  const chatTarget = lead?.am?.user_id ?? (lead && !lead.assigned_am && lead.status !== 'converted' ? supUid : null)
  useEffect(() => {
    if (phase !== 'ready' || !chatTarget) { setConvId(null); return }
    let alive = true
    void supabase.rpc('open_conversation', { p_other: chatTarget }).then(({ data }) => {
      if (alive && typeof data === 'string') setConvId(data)
    })
    return () => { alive = false }
  }, [phase, chatTarget])

  async function submit() {
    setError(null)
    if (!name.trim()) { setError(t.errName); return }
    if (!waLooksValid(cc, waNum)) { setError(t.errWa); return }
    setBusy(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session) {
        // 一张票流程(v67):Turnstile 票只喂给匿名登录,人机校验由 GoTrue 完成;
        // Edge 不再二次验票(会话本身即人机证明) —— "重置换票"环节从此不存在
        if (!captchaToken) { setError(t.errCaptcha); setBusy(false); return }
        const { error: aerr } = await supabase.auth.signInAnonymously({
          options: { captchaToken },
        })
        if (aerr) {
          captchaRef.current?.reset(); setCaptchaToken(null)
          setError(aerr.message); setBusy(false); return
        }
      }
      const { data, error: ferr } = await supabase.functions.invoke('lead-intake', {
        body: {
          full_name: name.trim(),
          wa_e164: normalizeWa(cc, waNum),
          telegram: tg.trim().replace(/^@/, '') || null,
        },
      })
      const r = data as { ok?: boolean; error?: string; status?: string;
        am?: { name: string } | null; conversation_id?: string | null } | null
      if (ferr || !r?.ok) {
        const code = r?.error ?? ''
        if (code === 'signed_in') { setPhase('member'); setBusy(false); return }
        captchaRef.current?.reset(); setCaptchaToken(null)
        setError(code === 'captcha' ? t.errCaptcha : code || ferr?.message || t.errGeneric)
        setBusy(false)
        return
      }
      // Meta Pixel:Lead 转化事件(像素被拦/未加载时 fbq 不存在,安全空转)
      ;(window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.('track', 'Lead')
      // v67:提交成功即身处聊天 —— 函数返回值直接搭现场,线索详情后台补水
      if (r.conversation_id) setFastConv(r.conversation_id)
      setLead({
        id: '', status: 'new', wa_e164: normalizeWa(cc, waNum), ref_token: '',
        assigned_am: r.status === 'assigned' ? 'pending' : null,
        am: r.am?.name ? { name: r.am.name, user_id: '' } : null,
      } as unknown as LeadRow)
      setPhase('ready')
      const { data: sess2 } = await supabase.auth.getSession()
      if (sess2.session) {
        void fetchLead(sess2.session.user.id).then(l => { if (l) setLead(l) })
      }
    } catch {
      setError(t.errGeneric)
    }
    setBusy(false)
  }

  const liveConv = fastConv ?? convId
  const converted = lead?.status === 'converted'
  const amName = lead?.am?.name ?? null

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8 rounded-lg" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">LocalTask</span>
        </Link>
        <button onClick={toggle} className="font-mono text-xs uppercase tracking-wider text-muted hover:text-ink">
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-8">
        {phase === 'probe' && <p className="pt-16 text-sm text-faint">…</p>}

        {phase === 'member' && (
          <div className="w-full max-w-md rounded-2xl border border-hair bg-white p-8 text-center shadow-sm">
            <p className="font-display text-xl font-medium tracking-tight text-ink">{t.memberT}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.memberB}</p>
            <Button className="mt-5 w-full" onClick={() => navigate('/')}>{t.memberCta}</Button>
          </div>
        )}

        {phase === 'form' && (
          <div className="w-full max-w-md rounded-2xl border border-hair bg-white p-8 shadow-sm sm:p-10">
            <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{t.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.sub}</p>
            {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
            <div className="mt-6">
              <Label>{t.name}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="mt-4">
              <Label>{t.wa}</Label>
              <div className="flex gap-2">
                <select value={cc} onChange={e => setCc(e.target.value)} aria-label={t.ccLabel}
                  className="w-32 shrink-0 rounded-lg border border-hair bg-white px-2 py-2.5 font-mono text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20">
                  {COUNTRY_CODES.map(c => <option key={c.cc} value={c.cc}>{c.label}</option>)}
                </select>
                <Input inputMode="numeric" placeholder="555 000 0000" value={waNum}
                  onChange={e => setWaNum(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <Label>{t.tg}</Label>
              <Input placeholder="@username" value={tg} onChange={e => setTg(e.target.value)} />
            </div>
            <div className="mt-5">
              <CaptchaBox ref={captchaRef} action="join" onToken={onToken} />
            </div>
            <Button onClick={() => void submit()} disabled={busy || (!captchaToken && !user)} className="w-full">
              {busy ? t.busy : t.cta}
            </Button>
            <p className="mt-4 text-center font-mono text-[10.5px] text-faint">
              {t.privacy}{' '}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-muted">{t.privacyLink}</Link>
            </p>
          </div>
        )}

        {phase === 'ready' && lead && (
          <div className="w-full max-w-2xl">
            {converted && (
              <div className="mb-4 rounded-2xl border border-verified-border bg-verified-bg p-6 text-center">
                <p className="font-display text-lg font-medium tracking-tight text-verified-text">{t.convT}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-verified-text/90">{t.convB}</p>
                <Button className="mt-4 px-8" onClick={() => navigate('/login')}>{t.convCta}</Button>
              </div>
            )}

            {(lead.assigned_am || (!converted && supUid)) && (
              <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-hair bg-surface px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-petrol font-display text-sm font-medium text-paper">
                    {((lead.assigned_am ? amName : SUPPORT_NAME) ?? '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{lead.assigned_am ? (amName ?? '—') : SUPPORT_NAME}</span>
                    <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-faint">{lead.assigned_am ? t.advisor : t.supportLabel}</span>
                  </span>
                </div>
                <div className="h-[62vh] min-h-[24rem]">
                  {liveConv && user ? (
                    <LeadChat conversationId={liveConv} meId={user.id} otherId={chatTarget ?? null} lang={lang} readOnly={converted} />
                  ) : (
                    <p className="pt-16 text-center text-sm text-faint">…</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function Join() {
  return (
    <I18nProvider>
      <JoinInner />
    </I18nProvider>
  )
}