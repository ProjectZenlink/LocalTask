import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { KYC_DOCS, type KycDocType } from '../types/database'
import { PageHeading, Button, Alert, Label, Input, FilePick } from '../components/ui'
import { friendly } from '../lib/errors'

/** ID 默认正/反面,护照仅照片页(沿用 id_front 槽,无需迁移)。
 *  地址证明不限文件格式;两种证件模式共享地址证明与 SSN。 */
const ID_DOCS = KYC_DOCS.filter(d => d.key !== 'selfie_handheld').map(d =>
  d.key === 'id_front' ? { ...d, hint: 'Front of your driver’s license or state ID.' } : d,
)
const PASSPORT_DOCS: { key: KycDocType; label: string; hint: string }[] = [
  { key: 'id_front', label: 'Passport — photo page', hint: 'The page with your photo and personal details.' },
  ...ID_DOCS.filter(d => d.key === 'address_proof'),
]
const MAX_MB = 10
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', pdf: 'application/pdf', gif: 'image/gif', heif: 'image/heif',
  tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp', avif: 'image/avif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// 部分手机不提供 MIME。按扩展名补齐,未知文件不冒充 PDF。
function contentType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.type && file.type !== 'application/octet-stream') return file.type
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

const COPY = {
  en: {
    title: 'Identity verification',
    sub: 'Your documents are private — visible only to our review team. Verification usually takes 1–2 business days.',
    documentType: 'Choose your identity document',
    modeId: 'ID card', modePassport: 'Passport',
    errType: 'Only image or PDF files are allowed.',
    errSize: `File is too large (max ${MAX_MB} MB).`,
    phoneHint: 'On a phone you can take the photo directly.',
    ssnLabel: 'Social Security Number — last 4 digits',
    ssnHint: 'Stored securely and never shown again. Used only for verification.',
    busy: 'Submitting…', cta: 'Submit for verification',
    notReady: 'Upload all documents and enter the last 4 digits of your SSN.',
    addressFormats: `Upload a photo, screenshot, PDF, or another file format. Max ${MAX_MB} MB.`,
    docs: {} as Partial<Record<KycDocType, { label: string; hint: string }>>,
  },
  }

function fail(step: string, e: { message?: string; code?: string } | null): never {
  throw new Error(`[${step}] ${e?.message ?? 'unknown error'}${e?.code ? ` (code ${e.code})` : ''}`)
}

export default function OnboardingKYC() {
  const { user } = useAuth()
  const { refresh } = useProfile()
  const navigate = useNavigate()
  const t = COPY.en
  const [mode, setMode] = useState<'passport' | 'id'>('id')
  const [files, setFiles] = useState<Partial<Record<KycDocType, File>>>({})
  const [ssn, setSsn] = useState('')
  const [fileErrors, setFileErrors] = useState<Partial<Record<KycDocType, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const DOCS = mode === 'passport' ? PASSPORT_DOCS : ID_DOCS
  const ssnDigits = ssn.replace(/\D/g, '')
  const allFilesReady = DOCS.every(d => files[d.key])
  const ready = allFilesReady && ssnDigits.length === 4

  function switchMode(next: 'id' | 'passport') {
    if (busy || next === mode) return
    // 证件槽清空防混装(护照照片不该顶着「证件正面」标签留下);地址证明与 SSN 保留
    setMode(next)
    setFiles(prev => ({ ...prev, id_front: undefined, id_back: undefined }))
    setFileErrors(prev => ({ ...prev, id_front: undefined, id_back: undefined }))
    setError(null)
  }

  function pick(key: KycDocType, f: File | null) {
    setError(null)
    setFileErrors(prev => ({ ...prev, [key]: undefined }))
    if (!f) {
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    if (key !== 'address_proof' && !ACCEPTED.includes(contentType(f))) {
      setFileErrors(prev => ({ ...prev, [key]: t.errType }))
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setFileErrors(prev => ({ ...prev, [key]: t.errSize }))
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    setFiles(prev => ({ ...prev, [key]: f }))
  }

  async function submit() {
    if (!ready || !user || busy) return
    setError(null)
    setBusy(true)
    try {
      const uploaded: { doc_type: KycDocType; storage_path: string }[] = []
      for (const d of DOCS) {
        const file = files[d.key]!
        const ext = file.name.match(/\.([a-z0-9]{1,16})$/i)?.[1]?.toLowerCase()
        const path = `${user.id}/${d.key}-${Date.now()}${ext ? `.${ext}` : ''}`
        let upErr: { message: string } | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: e } = await supabase.storage
            .from('kyc-documents').upload(path, file, { upsert: true, contentType: contentType(file) })
          upErr = e
          if (!e) break
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
        }
        if (upErr) {
          const friendly = /fetch|network|load failed/i.test(upErr.message)
            ? 'Upload failed after retries — check your connection and try again. Large files can time out: a photo (JPG/PNG) or a compressed PDF under 10MB works best.'
            : upErr.message
          fail(`upload ${d.key}`, { message: friendly })
        }
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
        .upsert({ user_id: user.id, ssn_last4: ssnDigits }, { onConflict: 'user_id' })
      if (ssnErr) fail('kyc_ssn', ssnErr)

      // The database flips the profile to "pending review" automatically
      // the moment the submission row lands — no profile update needed here.
      await refresh()
      navigate('/tasks')
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <fieldset disabled={busy} className="min-w-0">
      <legend className="mb-2 text-sm text-muted">{t.documentType}</legend>
      <div className="mb-5 grid grid-cols-2 gap-3" role="group" aria-label={t.documentType}>
        {(['id', 'passport'] as const).map(value => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => switchMode(value)}
            className={`rounded-xl border px-4 py-3 font-display text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 ${mode === value ? 'border-petrol bg-petrol text-paper' : 'border-hair bg-surface text-muted hover:border-petrol'}`}>
            {value === 'id' ? t.modeId : t.modePassport}
          </button>
        ))}
      </div>

      {DOCS.map(d => {
        const doc = t.docs[d.key] ?? { label: d.label, hint: d.hint }
        return (
          <div key={d.key === 'address_proof' ? d.key : `${mode}-${d.key}`} className="mb-5 rounded-xl border border-hair bg-surface p-4">
            <Label>{doc.label}</Label>
            <p className="mb-3 text-xs text-faint">{doc.hint}{d.key !== 'address_proof' && <> {t.phoneHint}</>}</p>
            {d.key === 'address_proof' && <p className="mb-3 text-xs text-faint">{t.addressFormats}</p>}
            <FilePick id={`kyc-file-${d.key}`}
              accept={d.key === 'address_proof' ? undefined : 'image/*,application/pdf'}
              onFiles={fs => pick(d.key, fs[0] ?? null)}
              selectedText={files[d.key]?.name ?? null} />
            {files[d.key] && <p className="mt-2 font-mono text-xs text-verified-text">{files[d.key]!.name}</p>}
            {fileErrors[d.key] && <p className="mt-2 text-sm text-danger-text">{fileErrors[d.key]}</p>}
          </div>
        )
      })}

      <div className="mb-6">
        <Label>{t.ssnLabel}</Label>
        <Input value={ssn} onChange={e => setSsn(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="••••" />
        <p className="mt-1.5 text-xs text-faint">{t.ssnHint}</p>
      </div>

      <Button onClick={submit} disabled={!ready || busy} className="w-full">
        {busy ? t.busy : t.cta}
      </Button>
      {!ready && !busy && (
        <p className="mt-2 text-center text-xs text-faint">{t.notReady}</p>
      )}
      </fieldset>
    </div>
  )
}
