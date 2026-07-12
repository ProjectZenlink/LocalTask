import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Field, Button, Alert } from '../components/ui'

interface Sug {
  display_name: string
  address?: {
    house_number?: string; road?: string
    city?: string; town?: string; village?: string; hamlet?: string
    state?: string; postcode?: string
    ['ISO3166-2-lvl4']?: string
  }
}

const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

function age(dobIso: string): number {
  const dob = new Date(dobIso)
  const now = new Date()
  let a = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--
  return a
}

export default function BuildProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [sugs, setSugs] = useState<Sug[]>([])
  const [searching, setSearching] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles')
      .select('display_name, full_name, date_of_birth, address, city, state, address_zip')
      .eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? '')
          setFullName(data.full_name ?? '')
          setDob(data.date_of_birth ?? '')
          setAddress(data.address ?? '')
          setCity(data.city ?? '')
          setState(data.state ?? '')
          setZip(data.address_zip ?? '')
        }
        setLoaded(true)
      })
  }, [user])

  useEffect(() => {
    setConfirmed(false)
    const q = address.trim()
    if (q.length < 5) { setSugs([]); return }
    const id = setTimeout(() => {
      setSearching(true)
      fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=5&q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then((data: Sug[]) => setSugs(Array.isArray(data) ? data : []))
        .catch(() => setSugs([]))
        .finally(() => setSearching(false))
    }, 450)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  function pickSug(sg: Sug) {
    const a = sg.address ?? {}
    const line1 = [a.house_number, a.road].filter(Boolean).join(' ') || sg.display_name.split(',')[0]
    setAddress(line1)
    setCity(a.city ?? a.town ?? a.village ?? a.hamlet ?? '')
    const isoState = (a['ISO3166-2-lvl4'] ?? '').split('-')[1] ?? ''
    setState(isoState || a.state || '')
    setZip((a.postcode ?? '').replace(/\D/g, '').slice(0, 5))
    setSugs([])
    setConfirmed(false)
  }

  async function save() {
    setError(null)
    if (!displayName || !fullName || !dob || !address || !city || !state || !zip) {
      setError('Fill in all fields.'); return
    }
    const a = age(dob)
    if (!(a >= 18 && a < 120)) {
      setError('You must be at least 18 years old to use LocalTask. Check your date of birth.')
      return
    }
    const zip5 = zip.replace(/\D/g, '').slice(0, 5)
    if (zip5.length !== 5) { setError('ZIP must be 5 digits.'); return }
    if (!confirmed) { setError('Please confirm the address matches your proof-of-address document (checkbox below).'); return }
    if (!user) return
    setBusy(true)
    const { error: err } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      full_name: fullName.trim(),
      date_of_birth: dob,
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      address_zip: zip5,
    }).eq('id', user.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    navigate('/onboarding/kyc')
  }

  if (!loaded) return <div className="text-muted">Loading…</div>

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub="Used for identity verification — must match your ID documents. Not shown publicly.">Your profile</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
      <Field label="Legal full name" value={fullName} onChange={e => setFullName(e.target.value)} />
      <Field label="Date of birth" type="date" value={dob} onChange={e => setDob(e.target.value)} />
      <div className="relative">
        <Field label="Street address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Start typing — suggestions appear" />
        {(sugs.length > 0 || searching) && (
          <div className="absolute inset-x-0 top-full z-20 -mt-3 overflow-hidden rounded-xl border border-hair bg-surface shadow-lg">
            {searching && sugs.length === 0 && <p className="px-3 py-2 font-mono text-xs text-faint">Searching…</p>}
            {sugs.map((sg, i) => (
              <button key={i} type="button" onClick={() => pickSug(sg)}
                className="flex w-full items-start justify-between gap-2 border-b border-hair px-3 py-2 text-left text-xs leading-relaxed text-ink transition last:border-b-0 hover:bg-paper">
                <span className="min-w-0">{sg.display_name}</span>
                <a href={mapsUrl(sg.display_name)} target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-petrol underline underline-offset-2">
                  Maps ↗
                </a>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="City" value={city} onChange={e => setCity(e.target.value)} />
        <Field label="State" value={state} onChange={e => setState(e.target.value)} placeholder="TX" />
      </div>
      <Field label="ZIP (5 digits)" value={zip} onChange={e => setZip(e.target.value)} inputMode="numeric" />

      <Alert tone="warning">
        This address must match your <span className="font-medium">proof-of-address document exactly</span>.
        Moved recently but the document still shows your old address? Enter the address printed on the document —
        KYC compares them line by line.
      </Alert>

      {address && city && state && zip && (
        <div className="mb-5 rounded-xl border border-petrol/25 bg-petrol/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-petrol">Confirm your address</p>
          <p className="mt-1.5 text-sm text-ink">{address}, {city}, {state} {zip}</p>
          <a href={mapsUrl(`${address}, ${city}, ${state} ${zip}`)} target="_blank" rel="noreferrer"
            className="mt-1 inline-block font-mono text-[11px] uppercase tracking-wider text-petrol underline underline-offset-2">
            Check on Google Maps ↗
          </a>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-[#244B4D]" />
            I confirm this address is correct and matches my proof-of-address document exactly.
          </label>
        </div>
      )}
      <Button onClick={save} disabled={busy} className="mt-2 w-full">
        {busy ? 'Saving…' : 'Save and continue'}
      </Button>
    </div>
  )
}
