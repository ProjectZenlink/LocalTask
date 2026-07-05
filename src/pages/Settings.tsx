import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { WALLET_OPTIONS, TRON_ADDRESS_RE, EVM_ADDRESS_RE, type WalletAddress } from '../types/database'
import { PageHeading, Button, Alert, Label, Eyebrow } from '../components/ui'

export default function Settings() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const [addresses, setAddresses] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  const [telegram, setTelegram] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [contactSaved, setContactSaved] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactBusy, setContactBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('wallet_addresses').select('*').eq('user_id', user.id)
      .then(({ data }) => {
        const map: Record<string, string> = {}
        const rows = (data ?? []) as WalletAddress[]
        rows.forEach(w => {
          const opt = WALLET_OPTIONS.find(o => o.network === w.network && o.token === w.token)
          if (opt) map[opt.key] = w.address
        })
        setAddresses(map)
        setLoaded(true)
      })
  }, [user])

  useEffect(() => {
    if (!profile) return
    setTelegram(profile.contact_telegram ?? '')
    setWhatsapp(profile.contact_whatsapp ?? '')
  }, [profile])

  async function saveOne(key: string) {
    const opt = WALLET_OPTIONS.find(o => o.key === key)
    if (!opt || !user) return
    const value = (addresses[key] ?? '').trim()
    setErrors(e => ({ ...e, [key]: '' }))
    setSaved(s => ({ ...s, [key]: false }))
    if (!value) { setErrors(e => ({ ...e, [key]: 'Address is empty.' })); return }
    const re = opt.family === 'tron' ? TRON_ADDRESS_RE : EVM_ADDRESS_RE
    if (!re.test(value)) {
      setErrors(e => ({
        ...e,
        [key]: opt.family === 'tron'
          ? 'Invalid TRON address (starts with T, 34 characters).'
          : 'Invalid EVM address (starts with 0x, 42 characters).',
      }))
      return
    }
    const { error: err } = await supabase.from('wallet_addresses').upsert({
      user_id: user.id, network: opt.network, token: opt.token, address: value,
    }, { onConflict: 'user_id,network,token' })
    if (err) { setErrors(e => ({ ...e, [key]: err.message })); return }
    setSaved(s => ({ ...s, [key]: true }))
  }

  async function saveContact() {
    if (!user) return
    setContactError(null)
    setContactSaved(false)
    setContactBusy(true)
    const tg = telegram.trim().replace(/^@/, '')
    const wa = whatsapp.trim().replace(/[^0-9]/g, '')
    const { error: err } = await supabase.from('profiles')
      .update({ contact_telegram: tg || null, contact_whatsapp: wa || null })
      .eq('id', user.id)
    setContactBusy(false)
    if (err) { setContactError(err.message); return }
    setTelegram(tg)
    setWhatsapp(wa)
    setContactSaved(true)
    await refresh()
  }

  if (!loaded) return <div className="text-muted">Loading…</div>

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading sub="Payout addresses and how the other party can reach you once a task is accepted.">
        Settings
      </PageHeading>

      <Eyebrow>Payout addresses</Eyebrow>

      <Alert tone="warning">
        USDT must be on TRON (TRC20) and USDC must be on Ethereum (ERC20). Transfers sent on the wrong network can be lost — you are responsible for entering the correct address for each.
      </Alert>

      {WALLET_OPTIONS.map(opt => (
        <div key={opt.key} className="mb-5">
          <Label>{opt.label}</Label>
          <div className="flex gap-2">
            <input
              value={addresses[opt.key] ?? ''}
              onChange={e => {
                const v = e.target.value
                setAddresses(a => ({ ...a, [opt.key]: v }))
                setSaved(s => ({ ...s, [opt.key]: false }))
              }}
              placeholder={opt.family === 'tron' ? 'T…' : '0x…'}
              className="flex-1 rounded-lg border border-hair bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
            />
            <Button variant="ghost" onClick={() => saveOne(opt.key)}>Save</Button>
          </div>
          {errors[opt.key] && <p className="mt-1.5 text-sm text-danger-text">{errors[opt.key]}</p>}
          {saved[opt.key] && <p className="mt-1.5 font-mono text-xs uppercase tracking-wider text-verified-text">Saved</p>}
        </div>
      ))}

      <div className="mt-10 border-t border-hair pt-8">
        <Eyebrow>Contact · optional</Eyebrow>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Shared only with the other party after a task is accepted — never shown publicly.
        </p>
        {contactError && <Alert tone="error">{contactError}</Alert>}
        <div className="mb-4">
          <Label>Telegram username (without @)</Label>
          <input
            value={telegram}
            onChange={e => { setTelegram(e.target.value); setContactSaved(false) }}
            placeholder="your_username"
            className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          />
        </div>
        <div className="mb-4">
          <Label>WhatsApp number (with country code, digits only)</Label>
          <input
            value={whatsapp}
            onChange={e => { setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, '')); setContactSaved(false) }}
            inputMode="tel"
            placeholder="15551234567"
            className="w-full rounded-lg border border-hair bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={saveContact} disabled={contactBusy}>{contactBusy ? 'Saving…' : 'Save contact'}</Button>
          {contactSaved && <span className="font-mono text-xs uppercase tracking-wider text-verified-text">Saved</span>}
        </div>
      </div>
    </div>
  )
}
