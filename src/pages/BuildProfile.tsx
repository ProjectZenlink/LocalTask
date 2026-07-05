import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Field, Button, Alert } from '../components/ui'

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
      setError('Fill in all fields.'); return
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
    navigate('/onboarding/phone')
  }

  if (!loaded) return <div className="text-muted">Loading…</div>

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub="Used for identity verification. Not shown publicly.">Your profile</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
      <Field label="Legal full name" value={fullName} onChange={e => setFullName(e.target.value)} />
      <Field label="Date of birth" type="date" value={dob} onChange={e => setDob(e.target.value)} />
      <Field label="Address" value={address} onChange={e => setAddress(e.target.value)} />
      <Field label="ZIP (5 digits)" value={zip} onChange={e => setZip(e.target.value)} />
      <Button onClick={save} disabled={busy} className="mt-2 w-full">
        {busy ? 'Saving…' : 'Save and continue'}
      </Button>
    </div>
  )
}
