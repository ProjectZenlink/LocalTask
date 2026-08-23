/** KYC 材料卡(v85.6 自 FreelancerDetail 抽件):自包含加载/懒签名/AM 补传。 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateShort, dateTimeShort, signFiles } from '../lib/format'
import { Card, Button, SectionTitle } from '../components/ui'
import DocGrid, { type Signed } from '../components/DocGrid'
import type { Lang } from '../admin/i18n'
import { friendly } from '../lib/errors'

type KycSub = { id: string; status: string; rejection_reason: string | null; created_at: string; reviewed_at: string | null }

const COPY = {
  zh: { kyc: 'KYC 材料', kycEmpty: '没有提交记录。', submitted: '提交于', reviewed: '审核于', reason: '驳回原因:', viewKyc: '查看材料', hideDocs: '收起', loadingDocs: '加载中…', addDoc: '补传', upOk: '已补传,重新展开可见', dt_id_front: '证件正面', dt_id_back: '证件背面', dt_addr: '地址证明', dt_selfie: '手持自拍', },
  en: { kyc: 'KYC documents', kycEmpty: 'No submissions.', submitted: 'Submitted', reviewed: 'Reviewed', reason: 'Rejection:', viewKyc: 'View documents', hideDocs: 'Hide', loadingDocs: 'Loading…', addDoc: 'Add file', upOk: 'Uploaded — reopen to view', dt_id_front: 'ID front', dt_id_back: 'ID back', dt_addr: 'Address proof', dt_selfie: 'Handheld selfie', },
}

export default function FreelancerKycMaterials({ flId, amScope, lang }: {
  flId: string; amScope: boolean; lang: Lang
}) {
  const t = COPY[lang]
  const [subs, setSubs] = useState<KycSub[]>([])
  const [openSubId, setOpenSubId] = useState<string | null>(null)
  const [subDocs, setSubDocs] = useState<Record<string, Signed[] | 'loading'>>({})
  const [upFor, setUpFor] = useState<string | null>(null)
  const [upType, setUpType] = useState<'id_front' | 'id_back' | 'address_proof' | 'selfie_handheld'>('id_front')
  const [upBusy, setUpBusy] = useState(false)
  const [upMsg, setUpMsg] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('kyc_submissions')
      .select('id, status, rejection_reason, created_at, reviewed_at')
      .eq('user_id', flId).order('created_at', { ascending: false })
      .then(({ data }) => setSubs((data ?? []) as KycSub[]))
  }, [flId])

  async function toggleSub(subId: string) {
    if (openSubId === subId) { setOpenSubId(null); return }
    setOpenSubId(subId)
    if (subDocs[subId]) return
    setSubDocs(prev => ({ ...prev, [subId]: 'loading' }))
    const { data: dd } = await supabase.from('kyc_documents')
      .select('storage_path').eq('submission_id', subId)
    const signed = await signFiles('kyc-documents', (dd ?? []).map(r => r.storage_path))
    setSubDocs(prev => ({ ...prev, [subId]: signed }))
  }

  async function amUpload(subId: string, f: File | null) {
    if (!f) return
    setUpBusy(true); setUpMsg(null)
    try {
      const ext = f.name.split('.').pop() || 'jpg'
      const path = `${flId}/${upType}-am-${Date.now()}.${ext}`
      const { error: se } = await supabase.storage.from('kyc-documents')
        .upload(path, f, { upsert: true })
      if (se) throw new Error(se.message)
      const { error: de } = await supabase.from('kyc_documents')
        .insert({ user_id: flId, submission_id: subId, doc_type: upType, storage_path: path })
      if (de) throw new Error(de.message)
      setSubDocs(prev => { const n = { ...prev }; delete n[subId]; return n })
      setUpMsg(t.upOk); setUpFor(null)
    } catch (err) {
      setUpMsg(friendly(err))
    } finally {
      setUpBusy(false)
    }
  }

  return (
    <Card className="mb-5 p-5">
      <SectionTitle>{t.kyc}</SectionTitle>
      {subs.length === 0 ? (
        <p className="py-1 text-sm text-faint">{t.kycEmpty}</p>
      ) : subs.map(s => (
        <div key={s.id} className="border-b border-hair py-3 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-muted">
              {t.submitted} {dateTimeShort(s.created_at)} · {s.status}
              {s.reviewed_at && <> · {t.reviewed} {dateShort(s.reviewed_at)}</>}
            </p>
            <span className="flex items-center gap-2">
              {amScope && (
                <Button variant="ghost" className="px-3 py-1.5 text-xs"
                  onClick={() => { setUpFor(v => v === s.id ? null : s.id); setUpMsg(null) }}>
                  {t.addDoc}
                </Button>
              )}
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void toggleSub(s.id)}>
                {openSubId === s.id ? t.hideDocs : t.viewKyc}
              </Button>
            </span>
          </div>
          {s.rejection_reason && <p className="mt-1 text-sm text-danger-text">{t.reason} {s.rejection_reason}</p>}
          {upFor === s.id && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-hair bg-surface px-3 py-2">
              <select value={upType} onChange={e => setUpType(e.target.value as typeof upType)}
                className="rounded-lg border border-hair bg-white px-2 py-1.5 text-xs">
                <option value="id_front">{t.dt_id_front}</option>
                <option value="id_back">{t.dt_id_back}</option>
                <option value="address_proof">{t.dt_addr}</option>
                <option value="selfie_handheld">{t.dt_selfie}</option>
              </select>
              <input id={`amup-${s.id}`} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => void amUpload(s.id, e.target.files?.[0] ?? null)} />
              <label htmlFor={`amup-${s.id}`}
                className="inline-flex cursor-pointer items-center rounded-lg border border-hair bg-white px-3 py-1.5 font-display text-xs text-ink transition hover:bg-paper">
                {upBusy ? '…' : t.addDoc}
              </label>
            </div>
          )}
          {upMsg && <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-verified-text">{upMsg}</p>}
          {openSubId === s.id && (
            subDocs[s.id] === 'loading' || !subDocs[s.id]
              ? <p className="mt-3 text-sm text-faint">{t.loadingDocs}</p>
              : <DocGrid files={subDocs[s.id] as Signed[]} />
          )}
        </div>
      ))}
    </Card>
  )
}
