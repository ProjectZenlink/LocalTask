import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Task, TaskStatus } from '../types/database'
import { taskMoney, dateShort } from '../lib/format'
import { PageHeading, Card, Eyebrow, TaskBadge } from '../components/ui'
import JourneyBar from '../components/JourneyBar'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Your tasks',
    sub: "Everything you've accepted, from first draft to final payment.",
    due: 'due',
    sections: {
      in_progress: ['In progress', 'Your next task lands here.'],
      under_review: ['Under review', 'Nothing waiting on review.'],
      pending_payment: ['Awaiting payment', 'Nothing awaiting payment.'],
    },
  },
  }

function TaskRow({ t, due }: { t: Task; due: string }) {
  return (
    <Link to={`/tasks/${t.id}`} className="block">
      <div className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{t.title}</p>
          <p className="mt-0.5 font-mono text-xs text-faint">
            {taskMoney(t.amount, t.payout_token)}
            {t.deadline && <> · {due} {dateShort(t.deadline)}</>}
          </p>
        </div>
        <TaskBadge status={t.status} lang="en" />
      </div>
    </Link>
  )
}

export default function Tasks() {
  const { user } = useAuth()
  const t = COPY.en
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

  if (!loaded) return <div className="text-muted">{t.loading}</div>

  const by = (s: TaskStatus) => tasks.filter(x => x.status === s)
  const section = (key: keyof typeof t.sections, status: TaskStatus) => (
    <Card className="mb-5 p-5">
      <div className="mb-2"><Eyebrow>{t.sections[key][0]} · {by(status).length}</Eyebrow></div>
      {by(status).length === 0
        ? <p className="py-2 text-sm text-faint">{t.sections[key][1]}</p>
        : by(status).map(x => <TaskRow key={x.id} t={x} due={t.due} />)}
    </Card>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      <JourneyBar />
      {section('in_progress', 'in_progress')}
      {section('under_review', 'under_review')}
      {section('pending_payment', 'pending_payment')}
    </div>
  )
}
