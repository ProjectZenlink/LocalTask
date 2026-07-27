import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, TaskStatus } from '../types/database'
import { taskMoney, dateShort } from '../lib/format'
import { PageHeading, Card, Eyebrow, TaskBadge } from '../components/ui'
import { useI18n, type Lang } from '../lib/i18n'
import JourneyStrip from '../components/JourneyStrip'
import { Stagger, Item } from '../components/motionKit'
import { SkeletonPage } from '../components/Skeleton'

const COPY = {
  en: {
    title: 'Your tasks',
    sub: 'From assignment to payout, all in one place.',
    due: 'due',
    matching: 'Your AM is matching you with tasks — new ones land here.',
    sections: {
      in_progress: 'In progress',
      under_review: 'Under review',
      pending_payment: 'Awaiting payment',
    } as Record<string, string>,
  },
  zh: {
    title: '我的任务',
    sub: '从派单到收款，都在这里。',
    due: '截止',
    matching: '你的 AM 正在为你匹配任务，新任务会出现在这里。',
    sections: {
      in_progress: '进行中',
      under_review: '审核中',
      pending_payment: '待付款',
    } as Record<string, string>,
  },
}

function TaskRow({ t, lang, due }: { t: Task; lang: Lang; due: string }) {
  return (
    <Link to={`/tasks/${t.id}`} className="press block">
      <div className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{t.title}</p>
          <p className="mt-0.5 font-mono text-xs text-faint">
            {taskMoney(t.amount, t.payout_token)}
            {t.deadline && <> · {due} {dateShort(t.deadline)}</>}
          </p>
        </div>
        <TaskBadge status={t.status} lang={lang} />
      </div>
    </Link>
  )
}

/**
 * 任务页(v49):自适应首页。
 * 旅程未完成 → 旅程进度条当主角;有任务 → 只渲染非空分组,空态一句话。
 */
export default function Tasks() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
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

  if (!loaded || !profile) return <SkeletonPage />

  const by = (s: TaskStatus) => tasks.filter(x => x.status === s)
  const groups = (['in_progress', 'under_review', 'pending_payment'] as TaskStatus[])
    .map(s => ({ s, list: by(s) }))
    .filter(g => g.list.length > 0)

  const readyForTasks = profile.kyc_status === 'verified' && profile.enhanced_kyc_status === 'verified'

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      <JourneyStrip />

      <Stagger>
        {groups.map(g => (
          <Item key={g.s}>
            <Card className="mb-5 p-5">
              <div className="mb-2"><Eyebrow>{t.sections[g.s]} · {g.list.length}</Eyebrow></div>
              {g.list.map(x => <TaskRow key={x.id} t={x} lang={lang} due={t.due} />)}
            </Card>
          </Item>
        ))}

        {groups.length === 0 && readyForTasks && (
          <Item>
            <Card className="p-6 text-center">
              <p className="text-sm leading-relaxed text-muted">{t.matching}</p>
            </Card>
          </Item>
        )}
      </Stagger>
    </div>
  )
}
