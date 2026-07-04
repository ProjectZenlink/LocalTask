import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { WALLET_OPTIONS, TRON_ADDRESS_RE, EVM_ADDRESS_RE, type WalletAddress } from '../types/database'

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

  if (!loaded) return <div className="text-gray-500">Loading…</div>

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-xl font-semibold">Payout addresses</h1>
      <p className="mb-6 text-sm text-gray-600">Clients pay bounties directly to these addresses. Make sure each one is correct.</p>

      <div className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        USDC on Ethereum and USDC on Base share the same address format but run on different networks. If a client pays on the wrong network, the funds can be lost. You are responsible for entering the correct address for each.
      </div>

      {WALLET_OPTIONS.map(opt => (
        <div key={opt.key} className="mb-5">
          <label className="mb-1 block text-sm font-medium text-gray-700">{opt.label}</label>
          <div className="flex gap-2">
            <input
              value={addresses[opt.key] ?? ''}
              onChange={e => {
                const v = e.target.value
                setAddresses(a => ({ ...a, [opt.key]: v }))
                setSaved(s => ({ ...s, [opt.key]: false }))
              }}
              placeholder={opt.family === 'tron' ? 'T…' : '0x…'}
              className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono text-sm" />
            <button onClick={() => saveOne(opt.key)}
              className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">Save</button>
          </div>
          {errors[opt.key] && <p className="mt-1 text-sm text-red-600">{errors[opt.key]}</p>}
          {saved[opt.key] && <p className="mt-1 text-sm text-green-600">Saved.</p>}
        </div>
      ))}
    </div>
  )
}
