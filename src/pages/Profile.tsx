import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { WALLET_OPTIONS, walletOptionFor } from '../types/database'
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
  const [walletKey, setWalletKey] = useState('')
  const [walletAddr, setWalletAddr] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
    setWalletKey(walletOptionFor(profile.payout_network, profile.payout_token)?.key ?? '')
    setWalletAddr(profile.payout_address ?? '')
  }, [profile])

  if (!profile || !user) return <div className="text-muted">Loading…</div>

  async function save(section: string, patch: Record<string, unknown>) {
    setError(null); setSaved(null); setBusy(section)
    const { error: e } = await supabase.from('profiles').update(patch).eq('id', user!.id)
    setBusy(null)
    if (e) { setError(e.message); return }
    setSaved(section)
    await refresh()
  }

  async function saveWallet() {
    const opt = WALLET_OPTIONS.find(o => o.key === walletKey)
    if (!opt) { setError('Choose a payout method.'); return }
    const addr = walletAddr.trim()
    if (!opt.pattern.test(addr)) {
      setError(`That doesn't look like a valid ${opt.label} address (expected ${opt.placeholder}).`)
      return
    }
    await save('wallet', { payout_network: opt.network, payout_token: opt.token, payout_address: addr })
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

      {/* Payout wallet */}
      <Card className="mb-5 p-5">
        <SectionTitle>Payout wallet</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Clients pay this wallet directly. One method per account — pick the one you actually control.
        </p>
        <div className="mb-4">
          <Label>Method</Label>
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
            placeholder={WALLET_OPTIONS.find(o => o.key === walletKey)?.placeholder ?? 'Select a method first'}
            className="font-mono text-sm" />
        </div>
        <Button onClick={saveWallet} disabled={busy === 'wallet'} className="w-full">
          {busy === 'wallet' ? 'Saving…' : 'Save wallet'}
        </Button>
        {saved === 'wallet' && <p className="mt-3 text-sm text-verified-text">Saved.</p>}
        <p className="mt-3 text-xs text-faint">While a task is active, the wallet is locked — the payment address was snapshotted when you accepted.</p>
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
