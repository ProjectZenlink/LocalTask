import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label className="mb-1 block text-sm text-gray-600">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2" />
    </>
  )
}

export default function BuildProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [address, setAddress] = useState('')
  const [zip, setZip] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles')
      .select('display_name, full_name, date_of_birth, address, address_zip')
      .eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? '')
          setFullName(data.full_name ?? '')
          setDob(data.date_of_birth ?? '')
          setAddress(data.address ?? '')
          setZip(data.address_zip ?? '')
        }
        setLoaded(true)
      })
  }, [user])

  async function save() {
    setError(null)
    if (!displayName || !fullName || !dob || !address || !zip) {
      setError('Please fill in all fields.'); return
    }
    const zip5 = zip.replace(/\D/g, '').slice(0, 5)
    if (zip5.length !== 5) { setError('ZIP must be 5 digits.'); return }
    if (!user) return
    setBusy(true)
    const { error: err } = await supabase.from('profiles').update({
      display_name: displayName,
      full_name: fullName,
      date_of_birth: dob,
      address,
      address_zip: zip5,
    }).eq('id', user.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    navigate('/')
  }

  if (!loaded) return <div className="text-gray-500">Loading…</div>

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-xl font-semibold">Your profile</h1>
      <p className="mb-6 text-sm text-gray-600">Used for identity verification. Not shown publicly.</p>
      {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <Field label="Display name" value={displayName} onChange={setDisplayName} />
      <Field label="Legal full name" value={fullName} onChange={setFullName} />
      <label className="mb-1 block text-sm text-gray-600">Date of birth</label>
      <input type="date" value={dob} onChange={e => setDob(e.target.value)}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2" />
      <Field label="Address" value={address} onChange={setAddress} />
      <Field label="ZIP (5 digits)" value={zip} onChange={setZip} />
      <button onClick={save} disabled={busy}
        className="mt-2 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50">
        {busy ? 'Saving…' : 'Save and continue'}
      </button>
    </div>
  )
}
