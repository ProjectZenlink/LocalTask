import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, TaskOffer } from '../types/database'
import { money, dateShort, timeLeft } from '../lib/format'
import { PageHeading, Card, Button, Alert, Eyebrow } from '../components/ui'
import KycBanner from '../components/KycBanner'

type OfferRow = TaskOffer & { task: Task | null }

export default function Offers() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error: e } = await supabase
      .from('task_offers')
      .select('*, task:tasks(*)')
      .eq('freelancer_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoaded(true); return }
    setOffers((data ?? []) as OfferRow[])
    setLoaded(true)
  }, [user])

  useEffect(() => { void load() }, [load])

  async function respond(offerId: string, accept: boolean) {
    setError(null)
    setBusyId(offerId)
    const { error: e } = await supabase.rpc('respond_to_offer', { p_offer_id: offerId, p_accept: accept })
    setBusyId(null)
    if (e) { setError(e.message); await load(); return }
    await load()
  }

  if (!loaded) return <div className="text-muted">Loading…</div>

  const verified = profile?.kyc_status === 'verified'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="Tasks your account manager has offered you. Accepting is a commitment — declining is always free.">
        Offers
      </PageHeading>

      <KycBanner />
      {verified && profile?.is_suspended && (
        <Alert tone="warning">Your account is paused and won't receive new offers. Contact your account manager.</Alert>
      )}
      {verified && !profile?.is_suspended && !profile?.open_to_work && (
        <Alert tone="info">
          You're currently not open to work, so new offers are off.{' '}
          <Link to="/me" className="underline underline-offset-2">Turn it on in your profile</Link>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {offers.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">No pending offers right now.</p>
          <p className="mt-1 text-xs text-faint">Your account manager will ping you on WhatsApp or Telegram when a task matches you.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {offers.map(o => {
            const t = o.task
            if (!t) return null
            const left = timeLeft(o.expires_at)
            return (
              <Card key={o.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/tasks/${t.id}`} className="block truncate font-display text-base font-medium text-ink hover:text-petrol">
                      {t.title}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-faint">
                      {money(t.amount, t.payout_token)}
                      {t.deadline && <> · due {dateShort(t.deadline)}</>}
                    </p>
                  </div>
                  <span className={`shrink-0 font-mono text-[11px] uppercase tracking-wider ${left ? 'text-pending-text' : 'text-danger-text'}`}>
                    {left ?? 'Expired'}
                  </span>
                </div>

                {o.note && <p className="mt-3 text-sm leading-relaxed text-muted">{o.note}</p>}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/tasks/${t.id}`} className="sm:mr-auto">
                    <Button variant="ghost" className="w-full sm:w-auto">View details</Button>
                  </Link>
                  {left && (
                    <>
                      <Button variant="ghost" disabled={busyId === o.id} onClick={() => respond(o.id, false)} className="w-full sm:w-auto">
                        Decline
                      </Button>
                      <Button disabled={busyId === o.id} onClick={() => respond(o.id, true)} className="w-full sm:w-auto">
                        {busyId === o.id ? 'Working…' : 'Accept task'}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-8">
        <Eyebrow>How offers work</Eyebrow>
        <p className="text-sm leading-relaxed text-muted">
          Offers expire if not answered in time — an expired or declined offer simply goes back to the pool with no penalty.
          Once you accept, the task moves to your Tasks tab and delivery is expected.
        </p>
      </div>
    </div>
  )
}
