import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { payoutLabel, type Task } from '../types/database'
import { PageHeading, Card, Eyebrow, StatusBadge } from '../components/ui'

function fmtDate(iso: string | null): string {
  if (!iso) return 'no deadline'
  return 'due ' + new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('tasks')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTasks((data ?? []) as Task[])
        setLoaded(true)
      })
  }, [])

  if (!loaded) return <div className="text-muted">Loading…</div>

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <PageHeading sub="Open tasks from verified clients. Accept one to get started.">Task board</PageHeading>
        <Link to="/post" className="shrink-0 rounded-lg bg-petrol px-4 py-2 font-display text-sm font-medium text-paper transition hover:bg-petrol-hover">
          Post a task
        </Link>
      </div>

      {tasks.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">No open tasks yet. Be the first to post one.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map(t => (
            <Link key={t.id} to={`/tasks/${t.id}`} className="block">
              <Card className="flex overflow-hidden transition hover:border-petrol/40">
                <div className="w-1 shrink-0 bg-petrol" />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-base font-medium text-ink">{t.title}</h2>
                    <StatusBadge status="verified" label="Open" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hair pt-3 font-mono text-xs text-ink-soft">
                    <span>{t.bounty_total} {t.payout_token}</span>
                    <span className="text-faint">·</span>
                    <span>{payoutLabel(t.payout_network, t.payout_token)}</span>
                    <span className="text-faint">/</span>
                    <span>{fmtDate(t.deadline)}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-6"><Eyebrow>Single tasks · packs coming soon</Eyebrow></div>
    </div>
  )
}
