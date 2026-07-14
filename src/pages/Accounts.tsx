import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountRecord } from '../types/database'
import { dateShort, typeLabel } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'
import SecretText from '../components/SecretText'
import TotpCode from '../components/TotpCode'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Accounts',
    sub: "Every account you've opened through LocalTask, in one place — grouped by platform. Credentials here are maintained together with your account manager.",
    empty: 'No accounts yet.',
    emptyHint: 'When you complete account-opening tasks, the account details land here for safekeeping.',
    stActive: 'Active', stReview: 'In review', stClosed: 'Closed',
    sms: 'SMS inbox', expires: 'expires',
  },
  zh: {
    loading: '加载中…', title: '账号',
    sub: '你通过 LocalTask 开出的所有账号，按平台分组集中在这里。账号凭据由你和账户经理共同维护。',
    empty: '还没有账号。',
    emptyHint: '完成开号任务后，账号信息会存放在这里。',
    stActive: '使用中', stReview: '审核中', stClosed: '已关闭',
    sms: '短信收件箱', expires: '到期',
  },
}

/** 集中账号:freelancer 视角 —— 我通过任务开出的所有账号,按平台分组一处看全。 */
export default function Accounts() {
  const { user } = useAuth()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [rows, setRows] = useState<AccountRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('account_records')
      .select('*').eq('freelancer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as AccountRecord[])
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <div className="text-muted">{t.loading}</div>

  const groups = new Map<string, AccountRecord[]>()
  for (const r of rows) {
    const list = groups.get(r.task_type) ?? []
    list.push(r)
    groups.set(r.task_type, list)
  }

  const stLabel = (s: string) => (s === 'active' ? t.stActive : s === 'review' ? t.stReview : t.stClosed)

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      {rows.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">{t.empty}</p>
          <p className="mt-1 text-xs text-faint">{t.emptyHint}</p>
        </Card>
      ) : (
        [...groups.entries()].map(([type, list]) => (
          <Card key={type} className="mb-4 p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <Eyebrow>{typeLabel(type, lang)}</Eyebrow>
              <span className="font-mono text-[11px] text-faint">{list.length}</span>
            </div>
            {list.map(r => (
              <div key={r.id} className="border-b border-hair py-3 last:border-b-0">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono text-ink">{r.account_login ?? '—'}</span>
                  {r.account_password && <span className="font-mono text-xs"><SecretText value={r.account_password} /></span>}
                  {r.twofa && <span className="font-mono text-xs text-muted">2FA <SecretText value={r.twofa} /> <TotpCode secret={r.twofa} /></span>}
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${(r.status ?? 'active') === 'active' ? 'text-verified-text' : (r.status ?? 'active') === 'review' ? 'text-pending-text' : 'text-danger-text'}`}>
                    {stLabel(r.status ?? 'active')}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-faint">
                  {r.phone_number ?? '—'}
                  {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">{t.sms}</a></>}
                  {r.phone_expires_on && <> · {t.expires} {dateShort(r.phone_expires_on)}</>}
                </p>
                {r.notes && <p className="mt-1 text-xs text-muted">{r.notes}</p>}
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  )
}
