import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task } from '../types/database'
import { lt, taskMoney, dateShort, txUrl, shortHash } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'

export default function Coins() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_freelancer', user.id)
      .in('status', ['in_progress', 'under_review', 'pending_payment', 'completed'])
      .order('assigned_at', { ascending: false })
      .then(({ data }) => {
        setTasks((data ?? []) as Task[])
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <div className="text-muted">Loading…</div>

  const sum = (list: Task[]) => list.reduce((a, t) => a + Number(t.amount), 0)
  const locked = tasks.filter(t => t.status === 'in_progress' || t.status === 'under_review')
  const unlocked = tasks.filter(t => t.status === 'pending_payment')
  const settled = tasks.filter(t => t.status === 'completed')

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="LocalTask Coins (LT) track what you're owed — 1 LT = $1.">Coins</PageHeading>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-medium tracking-tight text-pending-text">{lt(sum(locked)).replace(' LT', '')}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">Locked LT</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-medium tracking-tight text-petrol">{lt(sum(unlocked)).replace(' LT', '')}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">Unlocked LT</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-medium tracking-tight text-verified-text">{lt(sum(settled)).replace(' LT', '')}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">Settled LT</p>
        </Card>
      </div>

      <Card className="mb-5 p-5">
        <Eyebrow>How LT works</Eyebrow>
        <p className="text-sm leading-relaxed text-muted">
          Accept a task → its LT <span className="text-pending-text">lock</span> into your balance.
          Work approved → they <span className="text-petrol">unlock</span>, and the client is asked to pay
          your wallet directly. You confirm the money arrived → those LT <span className="text-verified-text">settle</span> (burn).
          Settled LT = cash that reached your wallet.
        </p>
      </Card>

      {unlocked.length > 0 && (
        <Card className="mb-5 p-5">
          <div className="mb-2"><Eyebrow>Unlocked · payment on the way</Eyebrow></div>
          {unlocked.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <Link to={`/tasks/${t.id}`} className="min-w-0 truncate text-sm text-ink hover:text-petrol">{t.title}</Link>
              <p className="shrink-0 font-mono text-sm text-petrol">+{lt(t.amount)}</p>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-2"><Eyebrow>Settled history</Eyebrow></div>
        {settled.length === 0 ? (
          <p className="py-2 text-sm text-faint">Nothing settled yet. Completed tasks land here.</p>
        ) : settled.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
            <div className="min-w-0">
              <Link to={`/tasks/${t.id}`} className="block truncate text-sm text-ink hover:text-petrol">{t.title}</Link>
              <p className="mt-0.5 font-mono text-xs text-faint">
                {dateShort(t.freelancer_confirmed_at)} · {taskMoney(t.amount, t.payout_token)}
                {t.tx_hash && t.payout_network && (
                  <> · <a href={txUrl(t.payout_network, t.tx_hash)} target="_blank" rel="noreferrer"
                    className="text-petrol underline underline-offset-2">{shortHash(t.tx_hash)}</a></>
                )}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm text-verified-text">{lt(t.amount)}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
