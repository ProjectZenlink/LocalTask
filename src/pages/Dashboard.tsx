import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { type Task } from '../types/database'
import { PageHeading, Card, Eyebrow, StatusBadge } from '../components/ui'

const BADGE: Record<string, { s: 'verified' | 'pending' | 'unverified'; label: string }> = {
  open: { s: 'verified', label: 'Open' },
  in_progress: { s: 'pending', label: 'In progress' },
  submitted: { s: 'pending', label: 'Submitted' },
  confirmed: { s: 'verified', label: 'Confirmed' },
  settled: { s: 'verified', label: 'Settled' },
  closed: { s: 'unverified', label: 'Closed' },
  cancelled: { s: 'unverified', label: 'Cancelled' },
  disputed: { s: 'pending', label: 'Disputed' },
}

function TaskRow({ t }: { t: Task }) {
  const b = BADGE[t.status] ?? { s: 'unverified' as const, label: t.status }
  return (
    <Link to={`/tasks/${t.id}`} className="block">
      <div className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{t.title}</p>
          <p className="mt-0.5 font-mono text-xs text-faint">${t.bounty_total}</p>
        </div>
        <StatusBadge status={b.s} label={b.label} />
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [posted, setPosted] = useState<Task[]>([])
  const [working, setWorking] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('tasks').select('*').eq('client_id', user.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('accepted_by', user.id).order('created_at', { ascending: false }),
    ]).then(([p, w]) => {
      setPosted((p.data ?? []) as Task[])
      setWorking((w.data ?? []) as Task[])
      setLoaded(true)
    })
  }, [user])

  if (!loaded) return <div className="text-muted">Loading…</div>

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="Everything you've posted and everything you're working on, in one place.">Dashboard</PageHeading>

      <Card className="mb-5 p-5">
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>Posted by me · {posted.length}</Eyebrow>
          <Link to="/post" className="font-mono text-xs uppercase tracking-wider text-petrol hover:text-petrol-hover">+ New task</Link>
        </div>
        {posted.length === 0
          ? <p className="py-2 text-sm text-faint">You haven't posted any tasks yet.</p>
          : posted.map(t => <TaskRow key={t.id} t={t} />)}
      </Card>

      <Card className="p-5">
        <div className="mb-2"><Eyebrow>My work · {working.length}</Eyebrow></div>
        {working.length === 0
          ? <p className="py-2 text-sm text-faint">You haven't accepted any tasks yet. <Link to="/tasks" className="text-petrol underline underline-offset-2">Browse the board</Link>.</p>
          : working.map(t => <TaskRow key={t.id} t={t} />)}
      </Card>
    </div>
  )
}
