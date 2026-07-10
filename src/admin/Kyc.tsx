import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeading, Card, Button, Alert } from '../components/ui'
import { signFiles } from '../lib/format'
import { PromptDialog } from './bits'
import { useLang } from './i18n'

interface PendingSub {
  id: string
  user_id: string
  created_at: string
  full_name: string | null
  display_name: string | null
  date_of_birth: string | null
  address: string | null
  city: string | null
  state: string | null
  address_zip: string | null
  ssn_last4: string | null
}
interface DocLink { doc_type: string; url: string }

const COPY = {
  zh: {
    title: 'KYC 审核', sub: '按提交顺序审核身份材料。通过后 freelancer 才能开启接单。',
    empty: '没有待审核的提交,全部处理完毕。', review: '查看材料', approve: '通过', reject: '驳回',
    saving: '保存中…', loading: '加载材料…', submitted: '提交于', rejectQ: '驳回原因(内部记录):',
    rejectDefault: '材料不清晰', dob: '生日', dlgCancel: '取消',
  },
  en: {
    title: 'KYC review', sub: 'Review identity submissions in order. Freelancers can open to work only after approval.',
    empty: 'No pending submissions. All caught up.', review: 'Review documents', approve: 'Approve', reject: 'Reject',
    saving: 'Saving…', loading: 'Loading documents…', submitted: 'submitted', rejectQ: 'Rejection reason (internal):',
    rejectDefault: 'Documents unclear', dob: 'DOB', dlgCancel: 'Cancel',
  },
}

export default function AdminKyc() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { user } = useAuth()
  const [queue, setQueue] = useState<PendingSub[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocLink[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<PendingSub | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    const { data: subs, error: e1 } = await supabase
      .from('kyc_submissions')
      .select('id, user_id, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (e1) { setError(e1.message); return }
    const rows = subs ?? []
    const ids = [...new Set(rows.map(s => s.user_id))]
    const [profRes, ssnRes] = await Promise.all([
      ids.length ? supabase.from('profiles').select('id, full_name, display_name, date_of_birth, address, city, state, address_zip').in('id', ids) : Promise.resolve({ data: [] as never[] }),
      ids.length ? supabase.from('kyc_ssn').select('user_id, ssn_last4').in('user_id', ids) : Promise.resolve({ data: [] as { user_id: string; ssn_last4: string | null }[] }),
    ])
    const profs = new Map((profRes.data ?? []).map(p => [p.id, p]))
    const ssns = new Map((ssnRes.data ?? []).map(s => [s.user_id, s.ssn_last4]))
    setQueue(rows.map(s => {
      const pr = profs.get(s.user_id) as {
        full_name: string | null; display_name: string | null; date_of_birth: string | null
        address: string | null; city: string | null; state: string | null; address_zip: string | null
      } | undefined
      return {
        id: s.id, user_id: s.user_id, created_at: s.created_at,
        full_name: pr?.full_name ?? null,
        display_name: pr?.display_name ?? null,
        date_of_birth: pr?.date_of_birth ?? null,
        address: pr?.address ?? null,
        city: pr?.city ?? null,
        state: pr?.state ?? null,
        address_zip: pr?.address_zip ?? null,
        ssn_last4: ssns.get(s.user_id) ?? null,
      }
    }))
  }, [])

  useEffect(() => { void loadQueue() }, [loadQueue])

  async function openSub(sub: PendingSub) {
    setOpen(sub.id); setDocs([]); setError(null)
    const { data: dd, error: e } = await supabase
      .from('kyc_documents').select('doc_type, storage_path').eq('submission_id', sub.id)
    if (e) { setError(e.message); return }
    const rows = dd ?? []
    const signed = await signFiles('kyc-documents', rows.map(r => r.storage_path))
    const byPath = new Map(signed.map(x => [x.path, x.url]))
    setDocs(rows.flatMap(r => {
      const url = byPath.get(r.storage_path)
      return url ? [{ doc_type: r.doc_type, url }] : []
    }))
  }

  async function review(sub: PendingSub, approve: boolean, reason: string | null = null) {
    setBusyId(sub.id); setError(null)
    const { error: e1 } = await supabase.from('kyc_submissions').update({
      status: approve ? 'verified' : 'rejected',
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    }).eq('id', sub.id)
    if (e1) { setBusyId(null); setError(e1.message); return }
    const { error: e2 } = await supabase.from('profiles')
      .update({ kyc_status: approve ? 'verified' : 'rejected' })
      .eq('id', sub.user_id)
    setBusyId(null)
    if (e2) { setError(e2.message); return }
    setOpen(null)
    await loadQueue()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {queue.length === 0 ? (
        <Card className="p-6 text-center"><p className="text-sm text-muted">{t.empty}</p></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map(sub => (
            <Card key={sub.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Link to={`/admin/pool/${sub.user_id}`} className="text-sm text-ink transition hover:text-petrol">{sub.full_name ?? sub.display_name ?? sub.user_id.slice(0, 8)}</Link>
                  <p className="mt-0.5 font-mono text-xs text-faint">
                    SSN ••••{sub.ssn_last4 ?? '????'} · {t.dob} {sub.date_of_birth ?? '—'} · {t.submitted} {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-faint">
                    {[sub.address, sub.city, sub.state, sub.address_zip].filter(Boolean).join(', ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {open === sub.id ? (
                    <>
                      <Button variant="ghost" onClick={() => setRejecting(sub)} disabled={busyId === sub.id}>{t.reject}</Button>
                      <Button onClick={() => review(sub, true)} disabled={busyId === sub.id}>{busyId === sub.id ? t.saving : t.approve}</Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => openSub(sub)}>{t.review}</Button>
                  )}
                </div>
              </div>
              {open === sub.id && (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hair pt-4">
                  {docs.length === 0
                    ? <p className="col-span-2 text-sm text-faint">{t.loading}</p>
                    : docs.map(d => (
                      <a key={d.doc_type} href={d.url} target="_blank" rel="noreferrer" className="block">
                        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-faint">{d.doc_type.replace(/_/g, ' ')}</p>
                        <img src={d.url} alt={d.doc_type} className="max-h-48 w-full rounded-lg border border-hair object-cover" />
                      </a>
                    ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <PromptDialog
        open={rejecting !== null}
        title={t.reject}
        hint={t.rejectQ}
        placeholder={t.rejectDefault}
        confirmLabel={t.reject}
        cancelLabel={t.dlgCancel}
        danger
        onConfirm={reason => { const s = rejecting; setRejecting(null); if (s) void review(s, false, reason) }}
        onClose={() => setRejecting(null)}
      />
    </div>
  )
}
