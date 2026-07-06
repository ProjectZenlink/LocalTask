import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task, TokenSymbol } from '../types/database'
import { money, dateShort, txUrl, shortHash } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'

export default function Earnings() {
  const { user } = useAuth()
  const [done, setDone] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_freelancer', user.id)
      .eq('status', 'completed')
      .order('freelancer_confirmed_at', { ascending: false })
      .then(({ data }) => {
        setDone((data ?? []) as Task[])
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <div className="text-muted">Loading…</div>

  const totals = new Map<TokenSymbol, number>()
  for (const t of done) totals.set(t.payout_token, (totals.get(t.payout_token) ?? 0) + Number(t.amount))

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="Confirmed payments only — a task counts once you've confirmed the money landed.">Earnings</PageHeading>

      <Card className="mb-5 p-5">
        <Eyebrow>Total earned</Eyebrow>
        {done.length === 0 ? (
          <p className="text-sm text-faint">Nothing yet. Completed tasks show up here.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {[...totals.entries()].map(([token, sum]) => (
              <p key={token} className="font-display text-2xl font-medium tracking-tight text-ink">
                {money(sum, token)}
              </p>
            ))}
            <p className="font-mono text-xs text-faint">{done.length} task{done.length === 1 ? '' : 's'}</p>
          </div>
        )}
      </Card>

      {done.length > 0 && (
        <Card className="p-5">
          <div className="mb-2"><Eyebrow>History</Eyebrow></div>
          {done.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <div className="min-w-0">
                <Link to={`/tasks/${t.id}`} className="block truncate text-sm text-ink hover:text-petrol">{t.title}</Link>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {dateShort(t.freelancer_confirmed_at)}
                  {t.tx_hash && (
                    <> · <a href={txUrl(t.payout_network, t.tx_hash)} target="_blank" rel="noreferrer"
                      className="text-petrol underline underline-offset-2">{shortHash(t.tx_hash)}</a></>
                  )}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm text-ink">{money(t.amount, t.payout_token)}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
