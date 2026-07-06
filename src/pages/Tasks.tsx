import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task, TaskStatus } from '../types/database'
import { money, dateShort } from '../lib/format'
import { PageHeading, Card, Eyebrow, TaskBadge } from '../components/ui'

function TaskRow({ t }: { t: Task }) {
  return (
    <Link to={`/tasks/${t.id}`} className="block">
      <div className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{t.title}</p>
          <p className="mt-0.5 font-mono text-xs text-faint">
            {money(t.amount, t.payout_token)}
            {t.deadline && <> · due {dateShort(t.deadline)}</>}
          </p>
        </div>
        <TaskBadge status={t.status} />
      </div>
    </Link>
  )
}

function Section({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
  return (
    <Card className="mb-5 p-5">
      <div className="mb-2"><Eyebrow>{title} · {tasks.length}</Eyebrow></div>
      {tasks.length === 0
        ? <p className="py-2 text-sm text-faint">{empty}</p>
        : tasks.map(t => <TaskRow key={t.id} t={t} />)}
    </Card>
  )
}

export default function Tasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_freelancer', user.id)
      .in('status', ['in_progress', 'under_review', 'pending_payment'])
      .order('assigned_at', { ascending: false })
      .then(({ data }) => {
        setTasks((data ?? []) as Task[])
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <div className="text-muted">Loading…</div>

  const by = (s: TaskStatus) => tasks.filter(t => t.status === s)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="Everything you've accepted, from first draft to final payment.">Your tasks</PageHeading>
      <Section title="In progress" tasks={by('in_progress')} empty="Nothing in progress. Accepted offers land here." />
      <Section title="Under review" tasks={by('under_review')} empty="No submissions waiting on review." />
      <Section title="Awaiting payment" tasks={by('pending_payment')} empty="No approved tasks awaiting payment." />
    </div>
  )
}
