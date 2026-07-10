import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, TaskOffer } from '../types/database'
import { usd, lt, dateShort, timeLeft } from '../lib/format'
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
  const payoutReady = profile?.payout_method === 'paypal'
    ? !!profile?.payout_paypal_email
    : !!profile?.payout_address

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
      {verified && !profile?.is_suspended && !payoutReady && (
        <Alert tone="warning">
          Set your payout method (crypto wallet or PayPal) to accept offers.{' '}
          <Link to="/me" className="underline underline-offset-2">Add it in your profile</Link>
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
                      {usd(t.amount)} · +{lt(t.amount)}
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
                      <Button disabled={busyId === o.id || !payoutReady} onClick={() => respond(o.id, true)} className="w-full sm:w-auto">
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

      <div className="mt-10">
        <Eyebrow>How offers work</Eyebrow>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { n: '1', h: 'An offer lands here', d: 'Your account manager matches a task to your profile and sends it with a clear scope, payout and deadline. You\u2019ll usually get a heads-up on WhatsApp or Telegram too.' },
            { n: '2', h: 'You decide — freely', d: 'Read the acceptance criteria first. Declining is always free and never counts against you; unanswered offers simply expire back to the pool.' },
            { n: '3', h: 'Accept = commitment', d: 'On accept, the task moves to your Tasks tab and its LT lock into your Wallet (1 LT = $1). Your payout details are snapshotted at this moment for your protection.' },
            { n: '4', h: 'Deliver → get paid', d: 'Submit proof, your manager reviews it, the client pays your wallet or PayPal directly, and you confirm the money arrived. Only you can close the loop.' },
          ].map(x => (
            <Card key={x.n} className="p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">Step {x.n}</p>
              <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink">{x.h}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{x.d}</p>
            </Card>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-petrol/20 bg-petrol/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-petrol">Why this is safe</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>· <span className="text-ink">Payment goes straight to you.</span> Clients pay your own wallet or PayPal — LocalTask never holds or routes your money.</li>
            <li>· <span className="text-ink">Snapshot protection.</span> The payout details on file when you accept are the ones attached to the task, in writing, until it closes.</li>
            <li>· <span className="text-ink">You confirm receipt.</span> A task only completes after you press \u201cI received the money\u201d — nobody can mark it done for you.</li>
          </ul>
        </div>

        <div className="mt-4">
          {[
            { q: 'What if I miss the expiry window?', a: 'Nothing bad happens. The offer expires, the task returns to the pool, and your standing is untouched.' },
            { q: 'Can I negotiate the amount?', a: 'Message your account manager before accepting — amounts are fixed once a task is accepted.' },
            { q: 'What happens if my work is rejected?', a: 'You get the reviewer\u2019s notes and can resubmit a new version. LT stay locked until a version is approved.' },
          ].map(f => (
            <details key={f.q} className="group border-b border-hair py-3 last:border-b-0">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink transition group-open:text-petrol">{f.q}</summary>
              <p className="mt-2 text-xs leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
