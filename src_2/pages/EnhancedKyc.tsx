import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'
import { PageHeading, Card, Button, Alert, Label, SectionTitle } from '../components/ui'
import { motion } from 'motion/react'
import { Rise } from '../components/motionKit'
import type { KycStatus } from '../types/database'

const MAX_MB = 10

const COPY = {
  en: {
    title: 'Enhanced KYC',
    sub: 'Two minutes — unlocks payouts and task assignments.',
    needBase: 'Complete basic identity verification first, then come back here.',
    goBase: 'Go to basic verification',
    pendingT: 'Under review',
    pendingBody: 'Our turn · payouts and task assignments unlock on approval.',
    verifiedT: 'Enhanced KYC verified',
    verifiedBody: 'All set — your bonus is waiting in the wallet.',
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
  zh: {
    title: 'Enhanced KYC',
    sub: '两分钟，解锁提现与接单资格。',
    needBase: '需要先完成基础身份验证，再回来做这一步。',
    goBase: '去完成基础验证',
    pendingT: '审核中',
    pendingBody: '轮到我们 · 通过后即可提现与接单。',
    verifiedT: 'Enhanced KYC 已通过',
    verifiedBody: '一切就绪——注册奖励在钱包等你。',
    goWallet: '去钱包',
    rejected: '上次的 Enhanced KYC 被驳回。请用更清晰的照片重新提交。',
    selfieLabel: '手持证件自拍',
    selfieHint: '把证件举在脸旁拍摄，脸和证件上的文字都要清晰可见。',
    choose: '选择照片',
    ssnLabel: '完整社会安全号 SSN（9 位数字）',
    ssnHint: (l4: string) => `必须与注册时填写的后四位吻合（••••${l4}）。`,
    ssnHintNo: '必须与注册时填写的后四位吻合。',
    submit: '提交审核',
    sending: '提交中…',
    notReady: '请上传手持自拍并填写完整 9 位 SSN。',
    tooBig: (n: string) => `${n} 超过 ${MAX_MB}MB，请换小一点的文件。`,
    back: '← 钱包',
  },
}

export default function EnhancedKyc() {
  const { user } = useAuth()
  const { lang } = useI18n()
  const t = COPY[lang]
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
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setBusy(false)
    }
  }

  if (baseStatus === null) return null

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <Rise>
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
              {file ? (
                <span className="inline-flex items-center gap-2 font-mono text-xs text-ink">
                  <motion.svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                    initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
                    <circle cx="7" cy="7" r="6.2" stroke="#3E7A57" strokeWidth="1.4" />
                    <path d="M4.2 7.3 L6.2 9.2 L9.9 4.9" stroke="#3E7A57" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                  {file.name}
                </span>
              ) : t.choose}
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
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-paper/30 border-t-paper"
                  animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} />
                {t.sending}
              </span>
            ) : t.submit}
          </Button>
        </Card>
      )}
      </Rise>
    </div>
  )
}
