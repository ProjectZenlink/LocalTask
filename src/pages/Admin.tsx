import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { KycStatus } from '../types/database'
import { PageHeading, Card, StatusBadge, Button, Alert } from '../components/ui'

interface PendingSub {
  id: string
  user_id: string
  created_at: string
  full_name: string | null
  display_name: string | null
  ssn_last4: string | null
}
interface DocLink { doc_type: string; url: string }
interface UserRow {
  id: string
  display_name: string | null
  full_name: string | null
  role: string
  kyc_status: KycStatus
  is_banned: boolean
  rating_avg: number
  completed_count: number
  created_at: string
}

const KYC_BADGE: Record<string, { s: 'verified' | 'pending' | 'unverified'; label: string }> = {
  verified: { s: 'verified', label: 'Verified' },
  pending: { s: 'pending', label: 'Pending' },
  rejected: { s: 'unverified', label: 'Rejected' },
  none: { s: 'unverified', label: 'None' },
}

export default function Admin() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'kyc' | 'users'>('kyc')
  const [error, setError] = useState<string | null>(null)

  // --- KYC queue ---
  const [queue, setQueue] = useState<PendingSub[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocLink[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

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
      ids.length ? supabase.from('profiles').select('id, full_name, display_name').in('id', ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null; display_name: string | null }[] }),
      ids.length ? supabase.from('kyc_ssn').select('user_id, ssn_last4').in('user_id', ids) : Promise.resolve({ data: [] as { user_id: string; ssn_last4: string | null }[] }),
    ])
    const profs = new Map((profRes.data ?? []).map(p => [p.id, p]))
    const ssns = new Map((ssnRes.data ?? []).map(s => [s.user_id, s.ssn_last4]))
    setQueue(rows.map(s => ({
      id: s.id, user_id: s.user_id, created_at: s.created_at,
      full_name: profs.get(s.user_id)?.full_name ?? null,
      display_name: profs.get(s.user_id)?.display_name ?? null,
      ssn_last4: ssns.get(s.user_id) ?? null,
    })))
  }, [])

  async function openSub(sub: PendingSub) {
    setOpen(sub.id); setDocs([]); setError(null)
    const { data: dd, error: e } = await supabase
      .from('kyc_documents').select('doc_type, storage_path').eq('submission_id', sub.id)
    if (e) { setError(e.message); return }
    const links: DocLink[] = []
    for (const d of dd ?? []) {
      const { data: signed } = await supabase.storage.from('kyc-documents').createSignedUrl(d.storage_path, 3600)
      if (signed?.signedUrl) links.push({ doc_type: d.doc_type, url: signed.signedUrl })
    }
    setDocs(links)
  }

  async function review(subId: string, approve: boolean) {
    setBusyId(subId); setError(null)
    const reason = approve ? null : (window.prompt('Rejection reason (shown internally):') ?? 'Documents unclear')
    const { error: e } = await supabase.rpc('review_kyc', { p_submission_id: subId, p_approve: approve, p_reason: reason })
    setBusyId(null)
    if (e) { setError(e.message); return }
    setOpen(null)
    await Promise.all([loadQueue(), loadUsers()])
  }

  // --- Users ---
  const [users, setUsers] = useState<UserRow[]>([])
  const [q, setQ] = useState('')

  const loadUsers = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('profiles')
      .select('id, display_name, full_name, role, kyc_status, is_banned, rating_avg, completed_count, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (e) { setError(e.message); return }
    setUsers((data ?? []) as UserRow[])
  }, [])

  async function quickKyc(u: UserRow, status: KycStatus) {
    setError(null)
    const { error: e } = await supabase.rpc('set_user_kyc', { p_user_id: u.id, p_status: status })
    if (e) { setError(e.message); return }
    await loadUsers()
  }

  async function toggleBan(u: UserRow) {
    setError(null)
    if (!u.is_banned && !window.confirm(`Block ${u.display_name ?? u.id.slice(0, 8)}? They will lose access immediately.`)) return
    const { error: e } = await supabase.rpc('set_user_banned', { p_user_id: u.id, p_banned: !u.is_banned })
    if (e) { setError(e.message); return }
    await loadUsers()
  }

  useEffect(() => { void loadQueue(); void loadUsers() }, [loadQueue, loadUsers])

  const filtered = users.filter(u => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return (u.display_name ?? '').toLowerCase().includes(s)
      || (u.full_name ?? '').toLowerCase().includes(s)
      || u.id.toLowerCase().startsWith(s)
  })

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading sub="Review identity submissions, manage users. Every action here takes effect immediately.">Admin</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="mb-5 flex gap-2">
        <button onClick={() => setTab('kyc')}
          className={`rounded-lg px-4 py-2 font-display text-sm ${tab === 'kyc' ? 'bg-petrol text-paper' : 'border border-hair text-muted hover:text-ink'}`}>
          KYC queue {queue.length > 0 && <span className="ml-1 font-mono text-xs">({queue.length})</span>}
        </button>
        <button onClick={() => setTab('users')}
          className={`rounded-lg px-4 py-2 font-display text-sm ${tab === 'users' ? 'bg-petrol text-paper' : 'border border-hair text-muted hover:text-ink'}`}>
          Users
        </button>
      </div>

      {tab === 'kyc' && (
        queue.length === 0 ? (
          <Card className="p-6 text-center"><p className="text-sm text-muted">No pending submissions. All caught up.</p></Card>
        ) : (
          <div className="flex flex-col gap-3">
            {queue.map(sub => (
              <Card key={sub.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink">{sub.full_name ?? sub.display_name ?? sub.user_id.slice(0, 8)}</p>
                    <p className="mt-0.5 font-mono text-xs text-faint">
                      SSN ••••{sub.ssn_last4 ?? '????'} · submitted {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {open === sub.id ? (
                      <>
                        <Button variant="ghost" onClick={() => review(sub.id, false)} disabled={busyId === sub.id}>Reject</Button>
                        <Button onClick={() => review(sub.id, true)} disabled={busyId === sub.id}>{busyId === sub.id ? 'Saving…' : 'Approve'}</Button>
                      </>
                    ) : (
                      <Button variant="ghost" onClick={() => openSub(sub)}>Review documents</Button>
                    )}
                  </div>
                </div>
                {open === sub.id && (
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hair pt-4">
                    {docs.length === 0
                      ? <p className="col-span-2 text-sm text-faint">Loading documents…</p>
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
        )
      )}

      {tab === 'users' && (
        <Card className="p-5">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name or ID prefix…"
            className="mb-4 w-full rounded-lg border border-hair bg-white px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
          />
          {filtered.map(u => {
            const b = KYC_BADGE[u.kyc_status] ?? KYC_BADGE.none
            const isSelf = u.id === user?.id
            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {u.display_name ?? u.id.slice(0, 8)}
                    {u.role === 'admin' && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-petrol">admin</span>}
                    {u.is_banned && <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">blocked</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-faint">
                    ★ {Number(u.rating_avg).toFixed(2)} · {u.completed_count} done · joined {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={b.s} label={b.label} />
                  {!isSelf && (
                    <>
                      {u.kyc_status === 'verified'
                        ? <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => quickKyc(u, 'none')}>Unverify</Button>
                        : <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => quickKyc(u, 'verified')}>Verify</Button>}
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => toggleBan(u)}>
                        {u.is_banned ? 'Unblock' : 'Block'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
