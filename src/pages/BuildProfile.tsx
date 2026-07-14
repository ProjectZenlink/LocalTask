import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Field, Button, Alert } from '../components/ui'
import { useI18n } from '../lib/i18n'

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

const COPY = {
  en: {
    loading: 'Loading…', title: 'Your profile',
    sub: 'Used for identity verification — must match your ID documents. Not shown publicly.',
    displayName: 'Display name', fullName: 'Legal full name', dob: 'Date of birth',
    street: 'Street address', streetPh: 'Start typing — suggestions appear',
    city: 'City', state: 'State', zip: 'ZIP (5 digits)',
    searching: 'Searching…',
    errAll: 'Fill in all fields.',
    errAge: 'You must be at least 18 years old to use LocalTask. Check your date of birth.',
    errZip: 'ZIP must be 5 digits.',
    errConfirm: 'Please confirm the address matches your proof-of-address document (checkbox below).',
    warn1: 'This address must match your ', warnBold: 'proof-of-address document exactly',
    warn2: '. Moved recently but the document still shows your old address? Enter the address printed on the document — KYC compares them line by line.',
    confirmHead: 'Confirm your address', mapsCheck: 'Check on Google Maps ↗',
    confirmLabel: 'I confirm this address is correct and matches my proof-of-address document exactly.',
    busy: 'Saving…', cta: 'Save and continue',
  },
  zh: {
    loading: '加载中…', title: '你的资料',
    sub: '用于身份验证，必须与证件一致。不会公开显示。',
    displayName: '昵称', fullName: '法定全名', dob: '出生日期',
    street: '街道地址', streetPh: '开始输入，会出现地址建议',
    city: '城市', state: '州', zip: '邮编（5 位）',
    searching: '搜索中…',
    errAll: '请填写所有字段。',
    errAge: '必须年满 18 岁才能使用 LocalTask，请检查出生日期。',
    errZip: '邮编必须是 5 位数字。',
    errConfirm: '请勾选下方确认框，确认地址与地址证明文件完全一致。',
    warn1: '这个地址必须与你的', warnBold: '地址证明文件完全一致',
    warn2: '。刚搬家但文件还是旧地址？就填文件上打印的地址——KYC 会逐行比对。',
    confirmHead: '确认你的地址', mapsCheck: '在 Google Maps 查看 ↗',
    confirmLabel: '我确认这个地址无误，并与我的地址证明文件完全一致。',
    busy: '保存中…', cta: '保存并继续',
  },
}

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
  const { lang } = useI18n()
  const t = COPY[lang]
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
      setError(t.errAll); return
    }
    const a = age(dob)
    if (!(a >= 18 && a < 120)) {
      setError(t.errAge)
      return
    }
    const zip5 = zip.replace(/\D/g, '').slice(0, 5)
    if (zip5.length !== 5) { setError(t.errZip); return }
    if (!confirmed) { setError(t.errConfirm); return }
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

  if (!loaded) return <div className="text-muted">{t.loading}</div>

  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t.displayName} value={displayName} onChange={e => setDisplayName(e.target.value)} />
      <Field label={t.fullName} value={fullName} onChange={e => setFullName(e.target.value)} />
      <Field label={t.dob} type="date" value={dob} onChange={e => setDob(e.target.value)} />
      <div className="relative">
        <Field label={t.street} value={address} onChange={e => setAddress(e.target.value)} placeholder={t.streetPh} />
        {(sugs.length > 0 || searching) && (
          <div className="absolute inset-x-0 top-full z-20 -mt-3 overflow-hidden rounded-xl border border-hair bg-surface shadow-lg">
            {searching && sugs.length === 0 && <p className="px-3 py-2 font-mono text-xs text-faint">{t.searching}</p>}
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
        <Field label={t.city} value={city} onChange={e => setCity(e.target.value)} />
        <Field label={t.state} value={state} onChange={e => setState(e.target.value)} placeholder="TX" />
      </div>
      <Field label={t.zip} value={zip} onChange={e => setZip(e.target.value)} inputMode="numeric" />

      <Alert tone="warning">
        {t.warn1}<span className="font-medium">{t.warnBold}</span>{t.warn2}
      </Alert>

      {address && city && state && zip && (
        <div className="mb-5 rounded-xl border border-petrol/25 bg-petrol/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-petrol">{t.confirmHead}</p>
          <p className="mt-1.5 text-sm text-ink">{address}, {city}, {state} {zip}</p>
          <a href={mapsUrl(`${address}, ${city}, ${state} ${zip}`)} target="_blank" rel="noreferrer"
            className="mt-1 inline-block font-mono text-[11px] uppercase tracking-wider text-petrol underline underline-offset-2">
            {t.mapsCheck}
          </a>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-[#244B4D]" />
            {t.confirmLabel}
          </label>
        </div>
      )}
      <Button onClick={save} disabled={busy} className="mt-2 w-full">
        {busy ? t.busy : t.cta}
      </Button>
    </div>
  )
}
