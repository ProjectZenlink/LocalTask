import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Card, Button, Alert, Label, SectionTitle } from '../components/ui'
import type { KycStatus } from '../types/database'
import { friendly } from '../lib/errors'

const MAX_MB = 10

const COPY = {
  en: {
    title: 'Enhanced KYC',
    sub: 'Two minutes — unlocks payouts and task assignments.',
    needBase: 'Complete basic identity verification first, then come back here.',
    goBase: 'Go to basic verification',
    pendingT: 'Under review',
    pendingBody: 'Your Enhanced KYC is being reviewed. You will be able to request your bonus once it is approved.',
    verifiedT: 'Enhanced KYC verified',
    verifiedBody: 'You are all set — head to your wallet to request the signup bonus.',
    goWallet: 'Go to wallet',
    rejected: 'Your previous Enhanced KYC was rejected. Please submit again with a clearer photo.',
    selfieLabel: 'Handheld ID selfie',
    selfieHint: 'Hold your ID next to your face. Both your face and the ID text must be clearly visible.',
    choose: 'Choose photo',
    ssnLabel: 'Full Social Security Number (9 digits)',
    ssnHint: (l4: string) => `Must match the last 4 digits you provided at registration (••••${l4}).`,
    ssnHintNo: 'Must match the last 4 digits you provided at registration.',
    submit: 'Submit for review',
    sending: 'Submitting…',
    notReady: 'Upload the handheld selfie and enter your full 9-digit SSN.',
    tooBig: (n: string) => `${n} is over ${MAX_MB}MB — please use a smaller file.`,
    back: '← Wallet',
  },
  }

export default function EnhancedKyc() {
  const { user } = useAuth()
  const t = COPY.en
  const navigate = useNavigate()

  const [baseStatus, setBaseStatus] = useState<KycStatus | null>(null)
  const [enhStatus, setEnhStatus] = useState<KycStatus | null>(null)
  const [last4, setLast4] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [ssn, setSsn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    void (async () => {
      const [pr, sr] = await Promise.all([
        supabase.from('profiles').select('kyc_status, enhanced_kyc_status').eq('id', user.id).maybeSingle(),
        supabase.from('kyc_ssn').select('ssn_last4').eq('user_id', user.id).maybeSingle(),
      ])
      const p = pr.data as { kyc_status: KycStatus; enhanced_kyc_status: KycStatus } | null
      setBaseStatus(p?.kyc_status ?? 'none')
      setEnhStatus(p?.enhanced_kyc_status ?? 'none')
      setLast4((sr.data as { ssn_last4: string | null } | null)?.ssn_last4 ?? null)
    })()
  }, [user])

  const ssnDigits = ssn.replace(/\D/g, '')
  const ready = !!file && ssnDigits.length === 9

  function pick(f: File | null) {
    setError(null)
    if (!f) { setFile(null); return }
    if (f.size > MAX_MB * 1024 * 1024) { setError(t.tooBig(f.name)); return }
    setFile(f)
  }

  async function submit() {
    if (!ready || !user || !file) return
    setBusy(true); setError(null)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/selfie_handheld-enhanced-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('kyc-documents').upload(path, file, { upsert: true })
      if (upErr) throw new Error(`[upload] ${upErr.message}`)

      const { data: subId, error: rpcErr } = await supabase.rpc('submit_enhanced_kyc', { p_ssn_full: ssnDigits })
      if (rpcErr) throw new Error(rpcErr.message)

      const { error: docErr } = await supabase.from('kyc_documents').insert({
        user_id: user.id, submission_id: subId as string,
        doc_type: 'selfie_handheld', storage_path: path,
      })
      if (docErr) throw new Error(`[document] ${docErr.message}`)

      setEnhStatus('pending')
      navigate('/earnings')  // v72 批Ⅳ:提交即跳钱包
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  if (baseStatus === null) return null

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <Link to="/earnings" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      {baseStatus !== 'verified' ? (
        <Card className="p-5">
          <Alert tone="info">{t.needBase}</Alert>
          <Button className="mt-4" onClick={() => navigate('/onboarding/kyc')}>{t.goBase}</Button>
        </Card>
      ) : enhStatus === 'pending' ? (
        <Card className="p-5">
          <SectionTitle>{t.pendingT}</SectionTitle>
          <p className="text-sm leading-relaxed text-muted">{t.pendingBody}</p>
        </Card>
      ) : enhStatus === 'verified' ? (
        <Card className="p-5">
          <SectionTitle>{t.verifiedT}</SectionTitle>
          <p className="mb-4 text-sm leading-relaxed text-muted">{t.verifiedBody}</p>
          <Button onClick={() => navigate('/earnings')}>{t.goWallet}</Button>
        </Card>
      ) : (
        <Card className="p-5">
          {enhStatus === 'rejected' && <div className="mb-4"><Alert tone="warning">{t.rejected}</Alert></div>}

          <div className="mb-5">
            <Label>{t.selfieLabel}</Label>
            <p className="mb-2 text-xs leading-relaxed text-muted">{t.selfieHint}</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => pick(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-hair bg-white px-4 py-6 text-sm text-muted transition hover:border-petrol hover:text-ink">
              {file ? <span className="font-mono text-xs text-ink">{file.name}</span> : t.choose}
            </button>
          </div>

          <div className="mb-5">
            <Label>{t.ssnLabel}</Label>
            <input value={ssn} inputMode="numeric" maxLength={9} placeholder="•••••••••"
              onChange={e => setSsn(e.target.value.replace(/\D/g, '').slice(0, 9))}
              className="w-full rounded-xl border border-hair bg-white px-3 py-2.5 font-mono text-sm tracking-widest text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15" />
            <p className="mt-1 text-xs text-faint">{last4 ? t.ssnHint(last4) : t.ssnHintNo}</p>
          </div>

          {error && <div className="mb-4"><Alert tone="warning">{error}</Alert></div>}
          {!ready && !error && <p className="mb-4 text-xs text-faint">{t.notReady}</p>}

          <Button disabled={!ready || busy} onClick={submit} className="w-full">
            {busy ? t.sending : t.submit}
          </Button>
        </Card>
      )}
    </div>
  )
}
