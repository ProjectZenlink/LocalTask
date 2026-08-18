/** OnboardingKYC(v86 KYC Pro 批一) —— 三选证件 + Onfido 式采集,全英(FR 锁英军规)。
 *  Step1 证件类型:Passport 置顶推荐;"I don't have a passport" 折叠展开 ID/DL。
 *  Step2 采集:DocCapture(四角引导+透视裁平+四关质检门);护照单面(存 id_front 槽),
 *        ID/DL 正反双面;地址证明维持 PDF 上传;SSN 后 4 位不变。
 *  提交:kyc_submissions 带 doc_kind + quality(各槽指标 jsonb);文档/存储管线原样。 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { KycDocType } from '../types/database'
import { PageHeading, Button, Alert, Label, Input } from '../components/ui'
import DocCapture from '../components/DocCapture'
import type { DocQuality } from '../lib/docScan'

const MAX_MB = 10

type DocKind = 'passport' | 'id' | 'dl'
type CaptureSlot = 'id_front' | 'id_back'

const KIND_META: Record<DocKind, { name: string; sub: string }> = {
  passport: { name: 'Passport', sub: 'Machine-verified · fastest approval' },
  id: { name: 'State ID card', sub: 'Front and back · manual review' },
  dl: { name: "Driver's license", sub: 'Front and back · manual review' },
}

const SLOTS: Record<DocKind, { slot: CaptureSlot; title: string; hint: string }[]> = {
  passport: [{
    slot: 'id_front',
    title: 'Passport — photo page',
    hint: 'The page with your photo and the two code lines at the bottom.',
  }],
  id: [
    { slot: 'id_front', title: 'ID card — front', hint: 'All four corners visible, no glare.' },
    { slot: 'id_back', title: 'ID card — back', hint: 'Same card, back side.' },
  ],
  dl: [
    { slot: 'id_front', title: "Driver's license — front", hint: 'All four corners visible, no glare.' },
    { slot: 'id_back', title: "Driver's license — back", hint: 'Same license, back side.' },
  ],
}

function fail(step: string, e: { message?: string; code?: string } | null): never {
  throw new Error(`[${step}] ${e?.message ?? 'unknown error'}${e?.code ? ` (code ${e.code})` : ''}`)
}

export default function OnboardingKYC() {
  const { user } = useAuth()
  const { refresh } = useProfile()
  const navigate = useNavigate()

  const [docKind, setDocKind] = useState<DocKind | null>(null)
  const [showAlt, setShowAlt] = useState(false)
  const [caps, setCaps] = useState<Partial<Record<CaptureSlot, { file: File; q: DocQuality }>>>({})
  const [addr, setAddr] = useState<File | null>(null)
  const [addrErr, setAddrErr] = useState<string | null>(null)
  const [ssn, setSsn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ssnDigits = ssn.replace(/\D/g, '')
  const slots = docKind ? SLOTS[docKind] : []
  const capsReady = docKind !== null && slots.every(s => caps[s.slot])
  const ready = capsReady && addr !== null && ssnDigits.length === 4

  function pickKind(k: DocKind) {
    setDocKind(k)
    setCaps({})
    setError(null)
  }

  function pickAddr(f: File | null) {
    setAddrErr(null)
    if (!f) { setAddr(null); return }
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setAddrErr('Address proof must be a PDF (bank statement / utility bill export).')
      setAddr(null)
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setAddrErr(`File is too large (max ${MAX_MB} MB).`)
      setAddr(null)
      return
    }
    setAddr(f)
  }

  async function submit() {
    if (!ready || !user || !docKind) return
    setError(null)
    setBusy(true)
    try {
      const uploaded: { doc_type: KycDocType; storage_path: string }[] = []
      const toUpload: { doc_type: KycDocType; file: File; contentType: string }[] = [
        ...slots.map(s => ({ doc_type: s.slot as KycDocType, file: caps[s.slot]!.file, contentType: 'image/jpeg' })),
        { doc_type: 'address_proof' as KycDocType, file: addr!, contentType: 'application/pdf' },
      ]
      for (const u of toUpload) {
        const ext = u.file.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${u.doc_type}-${Date.now()}.${ext}`
        let upErr: { message: string } | null = null
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: e } = await supabase.storage
            .from('kyc-documents').upload(path, u.file, { upsert: true, contentType: u.contentType })
          upErr = e
          if (!e) break
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
        }
        if (upErr) {
          const friendly = /fetch|network|load failed/i.test(upErr.message)
            ? 'Upload failed after retries — check your connection and try again. A photo (JPG/PNG) or compressed PDF under 10MB works best.'
            : upErr.message
          fail(`upload ${u.doc_type}`, { message: friendly })
        }
        uploaded.push({ doc_type: u.doc_type, storage_path: path })
      }

      const quality: Record<string, DocQuality> = {}
      for (const s of slots) quality[s.slot] = caps[s.slot]!.q

      const { data: sub, error: subErr } = await supabase
        .from('kyc_submissions')
        .insert({ user_id: user.id, status: 'pending', doc_kind: docKind, quality })
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
      <PageHeading sub="Your documents are private — visible only to our review team. Passport is machine-checked for the fastest approval.">
        Identity verification
      </PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {/* Step 1 · 证件类型三选(护照置顶推荐) */}
      <div className="mb-5">
        <button type="button" onClick={() => pickKind('passport')}
          className={`block w-full rounded-2xl border p-4 text-left transition ${
            docKind === 'passport' ? 'border-petrol bg-petrol/5' : 'border-petrol/40 bg-white hover:border-petrol'
          }`}>
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink">{KIND_META.passport.name}</span>
            <span className="rounded-full bg-petrol px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-paper">
              Recommended
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-muted">{KIND_META.passport.sub}</span>
        </button>

        {!showAlt && docKind !== 'id' && docKind !== 'dl' && (
          <button type="button" onClick={() => setShowAlt(true)}
            className="mt-2 font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">
            I don't have a passport
          </button>
        )}

        {(showAlt || docKind === 'id' || docKind === 'dl') && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['id', 'dl'] as const).map(k => (
              <button key={k} type="button" onClick={() => pickKind(k)}
                className={`rounded-2xl border p-3 text-left transition ${
                  docKind === k ? 'border-petrol bg-petrol/5' : 'border-hair bg-white hover:border-petrol/50'
                }`}>
                <span className="block text-sm font-medium text-ink">{KIND_META[k].name}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{KIND_META[k].sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 · 扫描采集(四关质检门) */}
      {docKind && (
        <div className="mb-5 space-y-4">
          {slots.map(s => (
            <DocCapture key={`${docKind}-${s.slot}`} title={s.title} hint={s.hint}
              onCaptured={(file, q) => setCaps(prev => ({ ...prev, [s.slot]: { file, q } }))} />
          ))}
        </div>
      )}

      {/* 地址证明(PDF,原管线) */}
      {docKind && (
        <div className="mb-5 rounded-xl border border-hair bg-surface p-4">
          <Label>Address proof</Label>
          <p className="mb-3 text-xs text-faint">
            A bank or utility statement from the last 3 months showing your name. PDF only.
          </p>
          <input type="file" accept="application/pdf"
            onChange={e => pickAddr(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-white file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper" />
          {addr && <p className="mt-2 font-mono text-xs text-verified-text">{addr.name}</p>}
          {addrErr && <p className="mt-2 text-sm text-danger-text">{addrErr}</p>}
        </div>
      )}

      {docKind && (
        <div className="mb-6">
          <Label>Social Security Number — last 4 digits</Label>
          <Input value={ssn} onChange={e => setSsn(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric" maxLength={4} placeholder="••••" />
          <p className="mt-1.5 text-xs text-faint">Stored securely and never shown again. Used only for verification.</p>
        </div>
      )}

      {docKind && (
        <>
          <Button onClick={submit} disabled={!ready || busy} className="w-full">
            {busy ? 'Submitting…' : 'Submit for verification'}
          </Button>
          {!ready && !busy && (
            <p className="mt-2 text-center text-xs text-faint">
              Capture every document, attach the address proof, and enter your SSN last 4.
            </p>
          )}
        </>
      )}
    </div>
  )
}
