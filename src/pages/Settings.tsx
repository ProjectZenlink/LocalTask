import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { WALLET_OPTIONS, TRON_ADDRESS_RE, EVM_ADDRESS_RE, type WalletAddress } from '../types/database'
import { PageHeading, Button, Alert, Label } from '../components/ui'

export default function Settings() {
  const { user } = useAuth()
  const [addresses, setAddresses] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

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

  if (!loaded) return <div className="text-muted">Loading…</div>

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading sub="Clients pay bounties directly to these addresses. Make sure each one is correct.">
        Payout addresses
      </PageHeading>

      <Alert tone="warning">
        USDC on Ethereum and USDC on Base share the same address format but run on different networks. If a client pays on the wrong network, the funds can be lost — you are responsible for entering the correct address for each.
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
    </div>
  )
}
