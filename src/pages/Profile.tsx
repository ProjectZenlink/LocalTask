import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { WALLET_OPTIONS, payoutLabel } from '../types/database'
import type { PayoutMethodRow } from '../types/database'
import { ConfirmDialog } from '../components/dialogs'
import { PageHeading, Card, Button, Alert, Field, Label, Input, StatusBadge, SectionTitle } from '../components/ui'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Profile',
    sub: 'Your identity, contact details, and how you get paid.',
    kycBadge: { verified: 'Verified', pending: 'Pending review', rejected: 'Rejected', none: 'Not verified' },
    kycHead: 'Identity verification',
    kycVerified: 'You are verified and can receive tasks.',
     enhGo: 'Complete Enhanced KYC to unlock your signup bonus →',
    enhPending: 'Enhanced KYC under review.', enhDone: 'Enhanced KYC verified — signup bonus unlocked.',
    kycPending: 'Documents under review — usually 1–2 business days. Need it faster? Contact support below.',
    kycNeeded: 'Verification is required before you can receive tasks.',
    kycSupport: 'Need it faster? Please contact customer support.',
    resubmit: 'Resubmit documents', start: 'Start verification',
    saving: 'Saving…',
    suspended: "Your account is paused by the platform and won't receive offers.",
    saved: 'Saved.',
    payHead: 'Payout methods',
    payIntro1: 'Keep several ways to get paid — crypto wallets and PayPal can coexist. The one marked',
    payIntro2: 'is snapshotted into each task the moment it is assigned to you.',
    payEmpty: "No payout method yet — tasks can't be assigned to you until you add one.",
    defaultChip: 'Default', setDefault: 'Set default', remove: 'Remove', crypto: 'Crypto',
    mCrypto: 'Crypto wallet', mCryptoHint: 'USDT · USDC · ETH', mPaypal: 'PayPal', mPaypalHint: 'Personal email',
    netLabel: 'Network & token', addrLabel: 'Wallet address', addrPh: 'Select an option first',
    ppLabel: 'PayPal email',
    ppHint: 'Use a PayPal account in your own legal name — it must match your KYC identity.',
    errPaypal: "That doesn't look like a valid PayPal email.",
    errPick: 'Choose a crypto option.',
    errAddr: (label: string, ph: string) => `That doesn't look like a valid ${label} address (expected ${ph}).`,
    addMethod: 'Add method', cancel: 'Cancel', addBtn: '＋ Add payout method',
    lockNote: 'While a task is active, switching the default is locked — payment details were snapshotted at assignment. Payments always go to the default marked above.',
    regHead: 'Account email',
    contactHead: 'Contact for your account manager',
    whatsapp: 'WhatsApp (with country code) — required', telegram: 'Telegram username (optional)', x: 'X (Twitter) username (optional)',
    errWa: 'WhatsApp is required — your AM reaches you there.',
    saveContact: 'Save contact',
    accountHead: 'Account',
    fullName: 'Legal full name', street: 'Street address',
    city: 'City', state: 'State', zip: 'ZIP',
    saveAccount: 'Save account',
    signOut: 'Sign out', outTitle: 'Sign out?', outConfirm: 'Sign out', outCancel: 'Cancel',
  },
  zh: {
    loading: '加载中…', title: '我的资料',
    sub: '你的身份、联系方式和收款方式。',
    kycBadge: { verified: '已验证', pending: '审核中', rejected: '已驳回', none: '未验证' },
    kycHead: '身份验证',
    kycVerified: '你已通过验证，可以接任务。',
     enhGo: '完成 Enhanced KYC,解锁注册奖励提现 →',
    enhPending: 'Enhanced KYC 审核中。', enhDone: 'Enhanced KYC 已通过——注册奖励已解锁。',
    kycPending: '材料审核中，通常 1–2 个工作日。想加急？用下方链接联系支持。',
    kycNeeded: '需要先完成身份验证才能接任务。',
    kycSupport: '想加急？请联系客服。',
    resubmit: '重新提交材料', start: '开始验证',
    saving: '保存中…',
    suspended: '你的账号已被平台暂停，不会收到邀约。',
    saved: '已保存。',
    payHead: '收款方式',
    payIntro1: '可以同时保存多种收款方式——加密钱包和 PayPal 可并存。标记为',
    payIntro2: '的会在任务指派给你的那一刻被快照进任务。',
    payEmpty: '还没有收款方式。添加一个之前无法给你派任务。',
    defaultChip: '默认', setDefault: '设为默认', remove: '删除', crypto: '加密钱包',
    mCrypto: '加密钱包', mCryptoHint: 'USDT · USDC · ETH', mPaypal: 'PayPal', mPaypalHint: '个人邮箱',
    netLabel: '网络与币种', addrLabel: '钱包地址', addrPh: '先选择上面的选项',
    ppLabel: 'PayPal 邮箱',
    ppHint: '请使用你本人实名的 PayPal 账号，必须与 KYC 身份一致。',
    errPaypal: '这个 PayPal 邮箱看起来不对。',
    errPick: '请选择一种加密收款选项。',
    errAddr: (label: string, ph: string) => `这不像一个有效的 ${label} 地址（应形如 ${ph}）。`,
    addMethod: '添加', cancel: '取消', addBtn: '＋ 添加收款方式',
    lockNote: '有任务进行中时，默认收款方式会锁定——收款信息在任务指派时已快照。付款始终打到上面标记为默认的那个。',
    regHead: '注册邮箱',
    contactHead: '给账户经理的联系方式',
    whatsapp: 'WhatsApp（含国家区号）——必填', telegram: 'Telegram 用户名（选填）', x: 'X（Twitter）用户名（选填）',
    errWa: 'WhatsApp 必填——AM 联系你全靠它。',
    saveContact: '保存联系方式',
    accountHead: '账户资料',
    fullName: '法定全名', street: '街道地址',
    city: '城市', state: '州', zip: '邮编',
    saveAccount: '保存账户资料',
    signOut: '退出登录', outTitle: '退出登录？', outConfirm: '退出', outCancel: '取消',
  },
}

export default function Profile() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const navigate = useNavigate()
  const { lang } = useI18n()
  const t = COPY[lang]

  const [fullName, setFullName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateV, setStateV] = useState('')
  const [zip, setZip] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [telegram, setTelegram] = useState('')
  const [xHandle, setXHandle] = useState('')
  const [askOut, setAskOut] = useState(false)
  const [methods, setMethods] = useState<PayoutMethodRow[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [payMethod, setPayMethod] = useState<'crypto' | 'paypal'>('crypto')
  const [paypalEmail, setPaypalEmail] = useState('')
  const [walletKey, setWalletKey] = useState('')
  const [walletAddr, setWalletAddr] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadMethods = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('payout_methods')
      .select('*').eq('user_id', user.id).order('created_at')
    setMethods((data ?? []) as PayoutMethodRow[])
  }, [user])

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setAddress(profile.address ?? '')
    setCity(profile.city ?? '')
    setStateV(profile.state ?? '')
    setZip(profile.address_zip ?? '')
    setWhatsapp(profile.contact_whatsapp ?? '')
    setTelegram(profile.contact_telegram ?? '')
    setXHandle(profile.contact_x ?? '')
    void loadMethods()
  }, [profile, loadMethods])

  if (!profile || !user) return <div className="text-muted">{t.loading}</div>

  async function save(section: string, patch: Record<string, unknown>) {
    setError(null); setSaved(null); setBusy(section)
    const { error: e } = await supabase.from('profiles').update(patch).eq('id', user!.id)
    setBusy(null)
    if (e) { setError(e.message); return }
    setSaved(section)
    await refresh()
  }


  async function addMethod() {
    if (!user) return
    setError(null)
    let payload: Record<string, unknown>
    if (payMethod === 'paypal') {
      const em = paypalEmail.trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
        setError(t.errPaypal)
        return
      }
      payload = { user_id: user.id, method: 'paypal', paypal_email: em }
    } else {
      const opt = WALLET_OPTIONS.find(o => o.key === walletKey)
      if (!opt) { setError(t.errPick); return }
      const addr = walletAddr.trim()
      if (!opt.pattern.test(addr)) {
        setError(t.errAddr(opt.label, opt.placeholder))
        return
      }
      payload = { user_id: user.id, method: 'crypto', network: opt.network, token: opt.token, address: addr }
    }
    setBusy('wallet')
    const wasEmpty = methods.length === 0
    const { data, error: e } = await supabase.from('payout_methods').insert(payload).select('id').single()
    if (e) { setBusy(null); setError(e.message); return }
    if (wasEmpty && data) {
      const { error: e2 } = await supabase.rpc('set_default_payout', { p_id: data.id })
      if (e2) { setBusy(null); setError(e2.message); await loadMethods(); return }
      await refresh()
    }
    setBusy(null)
    setSaved('wallet')
    setShowAdd(false)
    setPaypalEmail(''); setWalletAddr(''); setWalletKey('')
    await loadMethods()
  }

  async function setDefault(id: string) {
    setError(null); setBusy('wallet')
    const { error: e } = await supabase.rpc('set_default_payout', { p_id: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    setSaved('wallet')
    await Promise.all([loadMethods(), refresh()])
  }

  async function delMethod(m: PayoutMethodRow) {
    setError(null); setBusy('wallet')
    const { error: e } = await supabase.from('payout_methods').delete().eq('id', m.id)
    setBusy(null)
    if (e) { setError(e.message); return }
    await loadMethods()
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const kb = { s: ({ verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified' } as const)[profile.kyc_status], label: t.kycBadge[profile.kyc_status] }
  const verified = profile.kyc_status === 'verified'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {/* Verification */}
      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SectionTitle>{t.kycHead}</SectionTitle>
            <p className="text-sm text-muted">
              {verified
                ? t.kycVerified
                : profile.kyc_status === 'pending'
                  ? t.kycPending
                  : t.kycNeeded}
            </p>
          </div>
          <StatusBadge status={kb.s} label={kb.label} />
        </div>
        {verified && (
          <p className="mt-3 text-sm">
            {profile.enhanced_kyc_status === 'verified'
              ? <span className="text-muted">{t.enhDone}</span>
              : profile.enhanced_kyc_status === 'pending'
                ? <span className="text-muted">{t.enhPending}</span>
                : <Link to="/enhanced-kyc" className="text-petrol underline underline-offset-2">{t.enhGo}</Link>}
          </p>
        )}
        {profile.kyc_status === 'pending' && (
          <p className="mt-3 text-sm text-muted">{t.kycSupport}</p>
        )}
        {(profile.kyc_status === 'none' || profile.kyc_status === 'rejected') && (
          <Link to="/onboarding/kyc" className="mt-4 block">
            <Button className="w-full">{profile.kyc_status === 'rejected' ? t.resubmit : t.start}</Button>
          </Link>
        )}
      </Card>

      {profile.is_suspended && (
        <Alert tone="warning">{t.suspended}</Alert>
      )}

      {/* Payout methods:多方式并存,标一个默认 */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.payHead}</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          {t.payIntro1}
          <span className="font-mono text-xs"> DEFAULT </span>
          {t.payIntro2}
        </p>

        {methods.length === 0 ? (
          <p className="mb-3 rounded-lg border border-pending-border bg-pending-bg px-3 py-2 text-xs text-pending-text">
            {t.payEmpty}
          </p>
        ) : (
          <div className="mb-3 flex flex-col gap-2">
            {methods.map(m => (
              <div key={m.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${m.is_default ? 'border-petrol bg-petrol/5' : 'border-hair'}`}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    {m.method === 'paypal' ? 'PayPal' : (m.network && m.token ? payoutLabel(m.network, m.token) : t.crypto)}
                    {m.is_default && <span className="rounded-full bg-petrol px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-paper">{t.defaultChip}</span>}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{m.method === 'paypal' ? m.paypal_email : m.address}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!m.is_default && (
                    <>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === 'wallet'} onClick={() => void setDefault(m.id)}>
                        {t.setDefault}
                      </Button>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === 'wallet'} onClick={() => void delMethod(m)}>
                        {t.remove}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAdd ? (
          <div className="rounded-xl border border-petrol/25 bg-paper p-4">
            <div className="mb-4 grid grid-cols-2 gap-2">
              {([
                { key: 'crypto' as const, label: t.mCrypto, hint: t.mCryptoHint },
                { key: 'paypal' as const, label: t.mPaypal, hint: t.mPaypalHint },
              ]).map(mm => (
                <button key={mm.key} type="button" onClick={() => setPayMethod(mm.key)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${payMethod === mm.key ? 'border-petrol bg-petrol/5' : 'border-hair hover:border-petrol/40'}`}>
                  <p className={`font-display text-sm font-medium ${payMethod === mm.key ? 'text-petrol' : 'text-ink'}`}>{mm.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">{mm.hint}</p>
                </button>
              ))}
            </div>
            {payMethod === 'crypto' ? (
              <>
                <div className="mb-4">
                  <Label>{t.netLabel}</Label>
                  <div className="flex flex-col gap-2">
                    {WALLET_OPTIONS.map(o => (
                      <label key={o.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${walletKey === o.key ? 'border-petrol bg-petrol/5 text-ink' : 'border-hair text-muted'}`}>
                        <input type="radio" name="wallet" checked={walletKey === o.key} onChange={() => setWalletKey(o.key)} className="accent-[#244B4D]" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <Label>{t.addrLabel}</Label>
                  <Input value={walletAddr} onChange={e => setWalletAddr(e.target.value)}
                    placeholder={WALLET_OPTIONS.find(o => o.key === walletKey)?.placeholder ?? t.addrPh}
                    className="font-mono text-sm" />
                </div>
              </>
            ) : (
              <div className="mb-4">
                <Label>{t.ppLabel}</Label>
                <Input type="email" value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)}
                  placeholder="you@example.com" className="font-mono text-sm" />
                <p className="mt-1.5 text-xs leading-relaxed text-faint">
                  {t.ppHint}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void addMethod()} disabled={busy === 'wallet'} className="flex-1">
                {busy === 'wallet' ? t.saving : t.addMethod}
              </Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>{t.cancel}</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => { setError(null); setShowAdd(true) }}>
            {t.addBtn}
          </Button>
        )}

        {saved === 'wallet' && <p className="mt-3 text-sm text-verified-text">{t.saved}</p>}
        <p className="mt-3 text-xs text-faint">
          {t.lockNote}
        </p>
      </Card>

      {/* 注册邮箱(m22) */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.regHead}</SectionTitle>
        <p className="break-all font-mono text-sm text-ink">{user?.email ?? '—'}</p>
      </Card>

      {/* Contact */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.contactHead}</SectionTitle>
        <Field label={t.whatsapp} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+1 555 000 0000" />
        <Field label={t.telegram} value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="@username" />
        <Field label={t.x} value={xHandle} onChange={e => setXHandle(e.target.value)} placeholder="@username" />
        <Button onClick={() => { if (!whatsapp.trim()) { setError(t.errWa); return } void save('contact', { contact_whatsapp: whatsapp.trim(), contact_telegram: telegram.trim() || null, contact_x: xHandle.trim() || null }) }}
          disabled={busy === 'contact'} className="w-full">
          {busy === 'contact' ? t.saving : t.saveContact}
        </Button>
        {saved === 'contact' && <p className="mt-3 text-sm text-verified-text">{t.saved}</p>}
      </Card>

      {/* Account */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.accountHead}</SectionTitle>
        <Field label={t.fullName} value={fullName} onChange={e => setFullName(e.target.value)} />
        <Field label={t.street} value={address} onChange={e => setAddress(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.city} value={city} onChange={e => setCity(e.target.value)} />
          <Field label={t.state} value={stateV} onChange={e => setStateV(e.target.value)} />
        </div>
        <Field label={t.zip} value={zip} onChange={e => setZip(e.target.value)} inputMode="numeric" />
        <Button variant="ghost" onClick={() => save('account', { display_name: fullName.trim(), full_name: fullName.trim(), address: address.trim() || null, city: city.trim() || null, state: stateV.trim() || null, address_zip: zip.trim() || null })}
          disabled={busy === 'account'} className="w-full">
          {busy === 'account' ? t.saving : t.saveAccount}
        </Button>
        {saved === 'account' && <p className="mt-3 text-sm text-verified-text">{t.saved}</p>}
      </Card>

      <Button variant="ghost" onClick={() => setAskOut(true)} className="w-full">{t.signOut}</Button>

      <ConfirmDialog
        open={askOut}
        title={t.outTitle}
        confirmLabel={t.outConfirm}
        cancelLabel={t.outCancel}
        danger={false}
        onConfirm={() => { setAskOut(false); void signOut() }}
        onClose={() => setAskOut(false)}
      />
    </div>
  )
}
