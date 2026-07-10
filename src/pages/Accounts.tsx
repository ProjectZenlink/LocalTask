import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AccountRecord } from '../types/database'
import { dateShort, typeLabel } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'
import SecretText from '../components/SecretText'
import TotpCode from '../components/TotpCode'

/** 集中账号:freelancer 视角 —— 我通过任务开出的所有账号,按平台分组一处看全。 */
export default function Accounts() {
  const { user } = useAuth()
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

  if (!loaded) return <div className="text-muted">Loading…</div>

  const groups = new Map<string, AccountRecord[]>()
  for (const r of rows) {
    const list = groups.get(r.task_type) ?? []
    list.push(r)
    groups.set(r.task_type, list)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="Every account you've opened through LocalTask, in one place — grouped by platform. Credentials here are maintained together with your account manager.">
        Accounts
      </PageHeading>

      {rows.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">No accounts yet.</p>
          <p className="mt-1 text-xs text-faint">When you complete account-opening tasks, the account details land here for safekeeping.</p>
        </Card>
      ) : (
        [...groups.entries()].map(([type, list]) => (
          <Card key={type} className="mb-4 p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <Eyebrow>{typeLabel(type, 'en')}</Eyebrow>
              <span className="font-mono text-[11px] text-faint">{list.length}</span>
            </div>
            {list.map(r => (
              <div key={r.id} className="border-b border-hair py-3 last:border-b-0">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono text-ink">{r.account_login ?? '—'}</span>
                  {r.account_password && <span className="font-mono text-xs"><SecretText value={r.account_password} /></span>}
                  {r.twofa && <span className="font-mono text-xs text-muted">2FA <SecretText value={r.twofa} /> <TotpCode secret={r.twofa} /></span>}
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${(r.status ?? 'active') === 'active' ? 'text-verified-text' : (r.status ?? 'active') === 'review' ? 'text-pending-text' : 'text-danger-text'}`}>
                    {(r.status ?? 'active') === 'active' ? 'Active' : (r.status ?? 'active') === 'review' ? 'In review' : 'Closed'}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-faint">
                  {r.phone_number ?? '—'}
                  {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">SMS inbox</a></>}
                  {r.phone_expires_on && <> · expires {dateShort(r.phone_expires_on)}</>}
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
