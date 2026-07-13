import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { WALLET_OPTIONS, payoutLabel } from '../types/database'
import type { PayoutMethodRow } from '../types/database'
import { tgLink } from '../lib/format'
import { SUPPORT_TELEGRAM } from '../lib/support'
import { ConfirmDialog } from '../components/dialogs'
import { PageHeading, Card, Button, Alert, Field, Label, Input, StatusBadge, SectionTitle } from '../components/ui'

const KYC_BADGE = {
  verified: { s: 'verified' as const, label: 'Verified' },
  pending: { s: 'pending' as const, label: 'Pending review' },
  rejected: { s: 'unverified' as const, label: 'Rejected' },
  none: { s: 'unverified' as const, label: 'Not verified' },
}

export default function Profile() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
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
    setDisplayName(profile.display_name ?? '')
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

  if (!profile || !user) return <div className="text-muted">Loading…</div>

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
        setError("That doesn't look like a valid PayPal email.")
        return
      }
      payload = { user_id: user.id, method: 'paypal', paypal_email: em }
    } else {
      const opt = WALLET_OPTIONS.find(o => o.key === walletKey)
      if (!opt) { setError('Choose a crypto option.'); return }
      const addr = walletAddr.trim()
      if (!opt.pattern.test(addr)) {
        setError(`That doesn't look like a valid ${opt.label} address (expected ${opt.placeholder}).`)
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

  async function toggleOpen() {
    await save('availability', { open_to_work: !profile!.open_to_work })
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const kb = KYC_BADGE[profile.kyc_status]
  const verified = profile.kyc_status === 'verified'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="Your identity, contact details, and how you get paid.">Profile</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {/* Verification */}
      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SectionTitle>Identity verification</SectionTitle>
            <p className="text-sm text-muted">
              {verified
                ? 'You are verified and can receive offers.'
                : profile.kyc_status === 'pending'
                  ? 'Documents under review — usually 1–2 business days. Need it faster? Contact support below.'
                  : 'Verification is required before you can receive offers.'}
            </p>
          </div>
          <StatusBadge status={kb.s} label={kb.label} />
        </div>
        {profile.kyc_status === 'pending' && (
          <a href={tgLink(SUPPORT_TELEGRAM)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-petrol underline underline-offset-2">
            Contact support on Telegram
          </a>
        )}
        {(profile.kyc_status === 'none' || profile.kyc_status === 'rejected') && (
          <Link to="/onboarding/kyc" className="mt-4 block">
            <Button className="w-full">{profile.kyc_status === 'rejected' ? 'Resubmit documents' : 'Start verification'}</Button>
          </Link>
        )}
      </Card>

      {/* Availability */}
      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SectionTitle>Open to work</SectionTitle>
            <p className="text-sm text-muted">
              {profile.open_to_work
                ? 'Account managers can send you task offers.'
                : verified
                  ? 'Turn this on to start receiving offers.'
                  : 'Unlocks after your identity is verified.'}
            </p>
          </div>
          <Button
            variant={profile.open_to_work ? 'ghost' : 'primary'}
            disabled={busy === 'availability' || (!verified && !profile.open_to_work)}
            onClick={toggleOpen}
          >
            {busy === 'availability' ? 'Saving…' : profile.open_to_work ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
        {profile.is_suspended && (
          <p className="mt-3 text-sm text-danger-text">Your account is paused by the platform and won't receive offers.</p>
        )}
        {saved === 'availability' && <p className="mt-3 text-sm text-verified-text">Saved.</p>}
      </Card>

      {/* Payout methods:多方式并存,标一个默认 */}
      <Card className="mb-5 p-5">
        <SectionTitle>Payout methods</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Keep several ways to get paid — crypto wallets and PayPal can coexist. The one marked
          <span className="font-mono text-xs"> DEFAULT </span>
          is snapshotted into each task the moment you accept it.
        </p>

        {methods.length === 0 ? (
          <p className="mb-3 rounded-lg border border-pending-border bg-pending-bg px-3 py-2 text-xs text-pending-text">
            No payout method yet — you can't accept offers until you add one.
          </p>
        ) : (
          <div className="mb-3 flex flex-col gap-2">
            {methods.map(m => (
              <div key={m.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${m.is_default ? 'border-petrol bg-petrol/5' : 'border-hair'}`}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    {m.method === 'paypal' ? 'PayPal' : (m.network && m.token ? payoutLabel(m.network, m.token) : 'Crypto')}
                    {m.is_default && <span className="rounded-full bg-petrol px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-paper">Default</span>}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{m.method === 'paypal' ? m.paypal_email : m.address}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!m.is_default && (
                    <>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === 'wallet'} onClick={() => void setDefault(m.id)}>
                        Set default
                      </Button>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy === 'wallet'} onClick={() => void delMethod(m)}>
                        Remove
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
                { key: 'crypto' as const, label: 'Crypto wallet', hint: 'USDT · USDC · ETH' },
                { key: 'paypal' as const, label: 'PayPal', hint: 'Personal email' },
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
                  <Label>Network & token</Label>
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
                  <Label>Wallet address</Label>
                  <Input value={walletAddr} onChange={e => setWalletAddr(e.target.value)}
                    placeholder={WALLET_OPTIONS.find(o => o.key === walletKey)?.placeholder ?? 'Select an option first'}
                    className="font-mono text-sm" />
                </div>
              </>
            ) : (
              <div className="mb-4">
                <Label>PayPal email</Label>
                <Input type="email" value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)}
                  placeholder="you@example.com" className="font-mono text-sm" />
                <p className="mt-1.5 text-xs leading-relaxed text-faint">
                  Use a PayPal account in your own legal name — it must match your KYC identity.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => void addMethod()} disabled={busy === 'wallet'} className="flex-1">
                {busy === 'wallet' ? 'Saving…' : 'Add method'}
              </Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => { setError(null); setShowAdd(true) }}>
            ＋ Add payout method
          </Button>
        )}

        {saved === 'wallet' && <p className="mt-3 text-sm text-verified-text">Saved.</p>}
        <p className="mt-3 text-xs text-faint">
          While a task is active, switching the default is locked — payment details were snapshotted when you accepted.
          Payments always go to the default marked above.
        </p>
      </Card>

      {/* Contact */}
      <Card className="mb-5 p-5">
        <SectionTitle>Contact for your account manager</SectionTitle>
        <p className="mb-4 text-sm text-muted">Offers and coordination happen over WhatsApp or Telegram — add at least one.</p>
        <Field label="WhatsApp (with country code)" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+1 555 000 0000" />
        <Field label="Telegram username" value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="@username" />
        <Field label="X (Twitter) username" value={xHandle} onChange={e => setXHandle(e.target.value)} placeholder="@username" />
        <Button onClick={() => save('contact', { contact_whatsapp: whatsapp.trim() || null, contact_telegram: telegram.trim() || null, contact_x: xHandle.trim() || null })}
          disabled={busy === 'contact'} className="w-full">
          {busy === 'contact' ? 'Saving…' : 'Save contact'}
        </Button>
        {saved === 'contact' && <p className="mt-3 text-sm text-verified-text">Saved.</p>}
      </Card>

      {/* Account */}
      <Card className="mb-5 p-5">
        <SectionTitle>Account</SectionTitle>
        <Field label="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        <Field label="Legal full name" value={fullName} onChange={e => setFullName(e.target.value)} />
        <Field label="Street address" value={address} onChange={e => setAddress(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="City" value={city} onChange={e => setCity(e.target.value)} />
          <Field label="State" value={stateV} onChange={e => setStateV(e.target.value)} />
        </div>
        <Field label="ZIP" value={zip} onChange={e => setZip(e.target.value)} inputMode="numeric" />
        <Button variant="ghost" onClick={() => save('account', { display_name: displayName.trim(), full_name: fullName.trim(), address: address.trim() || null, city: city.trim() || null, state: stateV.trim() || null, address_zip: zip.trim() || null })}
          disabled={busy === 'account'} className="w-full">
          {busy === 'account' ? 'Saving…' : 'Save account'}
        </Button>
        {saved === 'account' && <p className="mt-3 text-sm text-verified-text">Saved.</p>}
      </Card>

      <Button variant="ghost" onClick={() => setAskOut(true)} className="w-full">Sign out</Button>

      <ConfirmDialog
        open={askOut}
        title="Sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        danger={false}
        onConfirm={() => { setAskOut(false); void signOut() }}
        onClose={() => setAskOut(false)}
      />
    </div>
  )
}
