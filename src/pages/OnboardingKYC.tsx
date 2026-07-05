import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { KYC_DOCS, type KycDocType } from '../types/database'
import { PageHeading, Button, Alert, Label, Input } from '../components/ui'

const MAX_MB = 10
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

function fail(step: string, e: { message?: string; code?: string } | null): never {
  throw new Error(`[${step}] ${e?.message ?? 'unknown error'}${e?.code ? ` (code ${e.code})` : ''}`)
}

export default function OnboardingKYC() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [files, setFiles] = useState<Partial<Record<KycDocType, File>>>({})
  const [ssn, setSsn] = useState('')
  const [fileErrors, setFileErrors] = useState<Partial<Record<KycDocType, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ssnDigits = ssn.replace(/\D/g, '')
  const allFilesReady = KYC_DOCS.every(d => files[d.key])
  const ready = allFilesReady && ssnDigits.length === 9

  function pick(key: KycDocType, f: File | null) {
    setError(null)
    setFileErrors(prev => ({ ...prev, [key]: undefined }))
    if (!f) {
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    if (!ACCEPTED.includes(f.type)) {
      setFileErrors(prev => ({ ...prev, [key]: 'Only image or PDF files are allowed.' }))
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setFileErrors(prev => ({ ...prev, [key]: `File is too large (max ${MAX_MB} MB).` }))
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    setFiles(prev => ({ ...prev, [key]: f }))
  }

  async function submit() {
    if (!ready || !user) return
    setError(null)
    setBusy(true)
    try {
      const uploaded: { doc_type: KycDocType; storage_path: string }[] = []
      for (const d of KYC_DOCS) {
        const file = files[d.key]!
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${d.key}-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('kyc-documents').upload(path, file, { upsert: true })
        if (upErr) fail(`upload ${d.key}`, upErr)
        uploaded.push({ doc_type: d.key, storage_path: path })
      }

      const { data: sub, error: subErr } = await supabase
        .from('kyc_submissions').insert({ user_id: user.id, status: 'pending' })
        .select('id').single()
      if (subErr) fail('kyc_submissions', subErr)

      const { error: docErr } = await supabase.from('kyc_documents').insert(
        uploaded.map(u => ({
          user_id: user.id, submission_id: sub.id, doc_type: u.doc_type, storage_path: u.storage_path,
        })),
      )
      if (docErr) fail('kyc_documents', docErr)

      const { error: ssnErr } = await supabase.from('kyc_ssn')
        .upsert({ user_id: user.id, ssn_full: ssnDigits, ssn_last4: ssnDigits.slice(-4) }, { onConflict: 'user_id' })
      if (ssnErr) fail('kyc_ssn', ssnErr)

      const { error: pErr } = await supabase.from('profiles')
        .update({ kyc_status: 'pending' }).eq('id', user.id)
      if (pErr) fail('profiles.update', pErr)

      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
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
          {fileErrors[d.key] && <p className="mt-1.5 text-sm text-danger-text">{fileErrors[d.key]}</p>}
        </div>
      ))}

      <div className="mb-6">
        <Label>Social Security Number (9 digits)</Label>
        <Input value={ssn} onChange={e => setSsn(e.target.value)} inputMode="numeric" placeholder="•••••••••" />
        <p className="mt-1.5 text-xs text-faint">Stored securely and never shown again. Used only for verification.</p>
      </div>

      <Button onClick={submit} disabled={!ready || busy} className="w-full">
        {busy ? 'Submitting…' : 'Submit for verification'}
      </Button>
      {!ready && !busy && (
        <p className="mt-2 text-center text-xs text-faint">
          Upload all four documents and enter your 9-digit SSN to continue.
        </p>
      )}
    </div>
  )
}