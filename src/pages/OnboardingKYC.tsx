import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { KYC_DOCS, type KycDocType } from '../types/database'
import { PageHeading, Button, Alert, Label, Input } from '../components/ui'

export default function OnboardingKYC() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [files, setFiles] = useState<Partial<Record<KycDocType, File>>>({})
  const [ssn, setSsn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function pick(key: KycDocType, f: File | null) {
    setFiles(prev => ({ ...prev, [key]: f ?? undefined }))
  }

  async function submit() {
    setError(null)
    for (const d of KYC_DOCS) {
      if (!files[d.key]) { setError(`Please upload: ${d.label}.`); return }
    }
    const ssnDigits = ssn.replace(/\D/g, '')
    if (ssnDigits.length !== 9) { setError('SSN must be 9 digits.'); return }
    if (!user) return

    setBusy(true)
    try {
      const uploaded: { doc_type: KycDocType; storage_path: string }[] = []
      for (const d of KYC_DOCS) {
        const file = files[d.key]!
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${d.key}-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('kyc-documents').upload(path, file, { upsert: true })
        if (upErr) throw upErr
        uploaded.push({ doc_type: d.key, storage_path: path })
      }

      const { data: sub, error: subErr } = await supabase
        .from('kyc_submissions').insert({ user_id: user.id, status: 'pending' })
        .select('id').single()
      if (subErr) throw subErr

      const { error: docErr } = await supabase.from('kyc_documents').insert(
        uploaded.map(u => ({
          user_id: user.id, submission_id: sub.id, doc_type: u.doc_type, storage_path: u.storage_path,
        })),
      )
      if (docErr) throw docErr

      const { error: ssnErr } = await supabase.from('kyc_ssn')
        .upsert({ user_id: user.id, ssn_full: ssnDigits, ssn_last4: ssnDigits.slice(-4) })
      if (ssnErr) throw ssnErr

      const { error: pErr } = await supabase.from('profiles')
        .update({ kyc_status: 'pending' }).eq('id', user.id)
      if (pErr) throw pErr

      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading sub="Your documents are private — visible only to our review team. Verification usually takes 1–2 business days.">
        Identity verification
      </PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {KYC_DOCS.map(d => (
        <div key={d.key} className="mb-5">
          <Label>{d.label}</Label>
          <p className="mb-2 text-xs text-faint">{d.hint}</p>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={e => pick(d.key, e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-surface file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper"
          />
          {files[d.key] && <p className="mt-1.5 font-mono text-xs text-verified-text">{files[d.key]!.name}</p>}
        </div>
      ))}

      <div className="mb-5">
        <Label>Social Security Number (9 digits)</Label>
        <Input value={ssn} onChange={e => setSsn(e.target.value)} inputMode="numeric" placeholder="•••••••••" />
        <p className="mt-1.5 text-xs text-faint">Stored securely and never shown again. Used only for verification.</p>
      </div>

      <Button onClick={submit} disabled={busy} className="w-full">
        {busy ? 'Submitting…' : 'Submit for verification'}
      </Button>
    </div>
  )
}
