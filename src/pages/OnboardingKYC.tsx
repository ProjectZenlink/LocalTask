import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { KYC_DOCS, type KycDocType } from '../types/database'
import { PageHeading, Button, Alert, Label, Input } from '../components/ui'
import { useI18n } from '../lib/i18n'

const REG_DOCS = KYC_DOCS.filter(d => d.key !== 'selfie_handheld')
const MAX_MB = 10
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

const COPY = {
  en: {
    title: 'Identity verification',
    sub: 'Your documents are private — visible only to our review team. Verification usually takes 1–2 business days.',
    errType: 'Only image or PDF files are allowed.',
    errSize: `File is too large (max ${MAX_MB} MB).`,
    phoneHint: 'On a phone you can take the photo directly.',
    ssnLabel: 'Social Security Number — last 4 digits',
    ssnHint: 'Stored securely and never shown again. Used only for verification.',
    busy: 'Submitting…', cta: 'Submit for verification',
    notReady: 'Upload all three documents and enter the last 4 digits of your SSN.',
    pdfOnly: 'Address proof must be a PDF file (bank statement / utility bill export).',
    docs: {} as Partial<Record<KycDocType, { label: string; hint: string }>>,
  },
  zh: {
    title: '身份验证',
    sub: '你的材料只有平台审核团队可见。审核通常需要 1–2 个工作日。',
    errType: '只支持图片或 PDF 文件。',
    errSize: `文件太大（最大 ${MAX_MB} MB）。`,
    phoneHint: '用手机可以直接拍照上传。',
    ssnLabel: '社会安全号 SSN（后 4 位）',
    ssnHint: '加密保存，之后不会再显示。仅用于身份核验。',
    busy: '提交中…', cta: '提交审核',
    notReady: '请上传全部三份材料并填写 SSN 后 4 位。',
    pdfOnly: '地址证明必须是 PDF 文件(银行账单/水电账单导出件)。',
    docs: {
      id_front: { label: '政府证件 — 正面', hint: '护照、驾照或州 ID。' },
      id_back: { label: '政府证件 — 背面', hint: '同一证件的背面。' },
      address_proof: { label: '地址证明', hint: '近 3 个月的银行或水电账单，需显示你的姓名。' },
      selfie_handheld: { label: '手持证件自拍', hint: '手持同一证件、面部清晰的照片。' },
    } as Partial<Record<KycDocType, { label: string; hint: string }>>,
  },
}

function fail(step: string, e: { message?: string; code?: string } | null): never {
  throw new Error(`[${step}] ${e?.message ?? 'unknown error'}${e?.code ? ` (code ${e.code})` : ''}`)
}

export default function OnboardingKYC() {
  const { user } = useAuth()
  const { refresh } = useProfile()
  const navigate = useNavigate()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [files, setFiles] = useState<Partial<Record<KycDocType, File>>>({})
  const [ssn, setSsn] = useState('')
  const [fileErrors, setFileErrors] = useState<Partial<Record<KycDocType, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ssnDigits = ssn.replace(/\D/g, '')
  const allFilesReady = REG_DOCS.every(d => files[d.key])
  const ready = allFilesReady && ssnDigits.length === 4

  function pick(key: KycDocType, f: File | null) {
    if (f && key === 'address_proof' && f.type !== 'application/pdf') {
      setFileErrors(prev => ({ ...prev, [key]: t.pdfOnly }))
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    setError(null)
    setFileErrors(prev => ({ ...prev, [key]: undefined }))
    if (!f) {
      setFiles(prev => ({ ...prev, [key]: undefined }))
      return
    }
    if (!ACCEPTED.includes(f.type)) {
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
    if (!ready || !user) return
    setError(null)
    setBusy(true)
    try {
      const uploaded: { doc_type: KycDocType; storage_path: string }[] = []
      for (const d of REG_DOCS) {
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
        .upsert({ user_id: user.id, ssn_last4: ssnDigits }, { onConflict: 'user_id' })
      if (ssnErr) fail('kyc_ssn', ssnErr)

      // The database flips the profile to "pending review" automatically
      // the moment the submission row lands — no profile update needed here.
      await refresh()
      navigate('/tasks')
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {REG_DOCS.map(d => {
        const doc = t.docs[d.key] ?? { label: d.label, hint: d.hint }
        return (
          <div key={d.key} className="mb-5 rounded-xl border border-hair bg-surface p-4">
            <Label>{doc.label}</Label>
            <p className="mb-3 text-xs text-faint">{doc.hint} {t.phoneHint}</p>
            <input
              type="file"
              accept={d.key === 'address_proof' ? 'application/pdf' : 'image/*,application/pdf'}
              onChange={e => pick(d.key, e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-white file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper"
            />
            {files[d.key] && <p className="mt-2 font-mono text-xs text-verified-text">{files[d.key]!.name}</p>}
            {fileErrors[d.key] && <p className="mt-2 text-sm text-danger-text">{fileErrors[d.key]}</p>}
          </div>
        )
      })}

      <div className="mb-6">
        <Label>{t.ssnLabel}</Label>
        <Input value={ssn} onChange={e => setSsn(e.target.value)} inputMode="numeric" placeholder="••••" />
        <p className="mt-1.5 text-xs text-faint">{t.ssnHint}</p>
      </div>

      <Button onClick={submit} disabled={!ready || busy} className="w-full">
        {busy ? t.busy : t.cta}
      </Button>
      {!ready && !busy && (
        <p className="mt-2 text-center text-xs text-faint">{t.notReady}</p>
      )}
    </div>
  )
}
