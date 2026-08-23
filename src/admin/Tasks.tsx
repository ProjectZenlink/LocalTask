import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Task, TaskStatus, AccountManager } from '../types/database'
import { taskMoney, dateShort } from '../lib/format'
import { Card, Button, Alert, PageHeading, Input } from '../components/ui'
import { TaskStatusBadge, Th, Td } from './bits'
import { STATUS_LABEL, useLang } from './i18n'
import { friendly } from '../lib/errors'

type Row = Task & { am: { name: string } | null; assigned: { display_name: string | null } | null }

const COPY = {
  zh: {
    title: '任务管理', sub: '建任务、直接派单、审交付、标记放款、打分 —— 全流程都在这里。',
    newTask: '＋ 新建任务', search: '搜标题 / AM / 接单人 / 标签…', all: '全部', tagRow: '标签',
    thTitle: '任务', thClient: 'AM', thAmount: '金额', thAssigned: '接单人', thDeadline: '截止', thStatus: '状态',
    empty: '还没有任务。点右上角「新建任务」开始。', none: '—',
  },
  en: {
    title: 'Tasks', sub: 'Create tasks, send offers, review work, mark payments, rate — the whole flow lives here.',
    newTask: '＋ New task', search: 'Search title / AM / assignee / tag…', all: 'All', tagRow: 'Tags',
    thTitle: 'Task', thClient: 'AM', thAmount: 'Amount', thAssigned: 'Assignee', thDeadline: 'Due', thStatus: 'Status',
    empty: 'No tasks yet. Hit "New task" to start.', none: '—',
  },
}

const FILTERS: (TaskStatus | 'all')[] = ['all', 'unassigned', 'in_progress', 'under_review', 'pending_payment', 'completed', 'cancelled']

export default function AdminTasks({ amScope = null }: { amScope?: AccountManager | null }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [tagSel, setTagSel] = useState<string | null>(null)  // v63:标签筛选(⑤a)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const base = amScope ? '/am/tasks' : '/admin/tasks'

  useEffect(() => {
    let q = supabase
      .from('tasks')
      .select('*, am:account_managers(name), assigned:profiles!tasks_assigned_freelancer_fkey(display_name)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (amScope) q = q.eq('am_id', amScope.id)
    q.then(({ data, error: e }) => {
        if (e) { setError(friendly(e)); setLoaded(true); return }
        setRows((data ?? []) as Row[])
        setLoaded(true)
      })
  }, [amScope])

  const allTags = Array.from(new Set(rows.flatMap(r => r.tags))).sort()
  const s = q.trim().toLowerCase()
  const filtered = rows.filter(r => {
    // 「全部」不含已取消：取消件只在「已取消」标签下可见
    if (filter === 'all' ? r.status === 'cancelled' : r.status !== filter) return false
    if (tagSel && !r.tags.includes(tagSel)) return false
    if (!s) return true
    return r.title.toLowerCase().includes(s)
      || (r.am?.name ?? '').toLowerCase().includes(s)
      || (r.assigned?.display_name ?? '').toLowerCase().includes(s)
      || r.tags.some(tag => tag.toLowerCase().includes(s))
  })

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeading sub={t.sub}>{t.title}</PageHeading>
        <Link to={`${base}/new`}><Button>{t.newTask}</Button></Link>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
              filter === f ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:text-ink'
            }`}
          >
            {f === 'all' ? t.all : (lang === 'zh' ? STATUS_LABEL[f].zh : STATUS_LABEL[f].en)}
            {f !== 'all' && <span className="ml-1">{rows.filter(r => r.status === f).length}</span>}
          </button>
        ))}
        <div className="ml-auto w-56">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="py-1.5 text-sm" />
        </div>
      </div>

      {/* v63 ⑤a:标签筛选行(点选即过滤,再点取消;标签在任务详情编辑模式里维护) */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{t.tagRow}</span>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setTagSel(v => (v === tag ? null : tag))}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] transition ${
                tagSel === tag ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:text-ink'
              }`}>
              {tag}<span className="ml-1 opacity-70">{rows.filter(r => r.tags.includes(tag)).length}</span>
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-x-auto">
        {!loaded ? (
          <p className="p-5 text-sm text-muted">…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr>
                <Th>{t.thTitle}</Th>{!amScope && <Th>{t.thClient}</Th>}<Th>{t.thAmount}</Th>
                <Th>{t.thAssigned}</Th><Th>{t.thDeadline}</Th><Th>{t.thStatus}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                  <Td className="max-w-[26rem]">
                    <Link to={`${base}/${r.id}`} className="block truncate text-ink hover:text-petrol">{r.title}</Link>
                    {r.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map(tag => (
                          <span key={tag} className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">{tag}</span>
                        ))}
                      </div>
                    )}
                  </Td>
                  {!amScope && <Td className="text-muted">{r.am?.name ?? t.none}</Td>}
                  <Td className="whitespace-nowrap font-mono text-xs">{taskMoney(r.amount, r.payout_token)}</Td>
                  <Td className="text-muted">{r.assigned?.display_name ?? t.none}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs text-muted">{r.deadline ? dateShort(r.deadline) : t.none}</Td>
                  <Td>
                    <TaskStatusBadge status={r.status} />
                    {r.status === 'pending_payment' && r.payout_requested_at && (
                      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider text-pending-text">{lang === 'zh' ? '已申请提现' : 'payout requested'}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
