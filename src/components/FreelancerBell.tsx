import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell as BellIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../lib/i18n'

/** freelancer 站内小铃铛:提醒在站内,沟通照旧在 WhatsApp/Telegram。 */
interface Item { key: string; text: string; to: string }

const COPY = {
  en: {
    assigned: (n: number) => `${n} new task${n > 1 ? 's' : ''} assigned to you — get started`,
    returned: (n: number) => `${n} submission${n > 1 ? 's' : ''} returned — fix and resubmit`,
    pay: (n: number) => `${n} payment${n > 1 ? 's' : ''} sent — confirm you received it`,
    review: (n: number) => `${n} account${n > 1 ? 's' : ''} under review — your account manager will reach out on WhatsApp/Telegram`,
    kyc: 'Your KYC was rejected — resubmit your documents',
    empty: 'All caught up — nothing needs you right now.',
  },
  zh: {
    assigned: (n: number) => `${n} 个新任务已指派给你，去看看`,
    returned: (n: number) => `${n} 份提交被退回，修改后重新提交`,
    pay: (n: number) => `${n} 笔付款已发出，请确认到账`,
    review: (n: number) => `${n} 个账号审核中，账户经理会在 WhatsApp/Telegram 联系你`,
    kyc: '你的身份验证被驳回，请重新提交材料',
    empty: '都处理完了，暂时没有需要你做的事。',
  },
}

export default function FreelancerBell() {
  const { user } = useAuth()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  const load = useCallback(async () => {
    if (!user) return
    const [tk, sub, pay, rec, pf] = await Promise.all([
      supabase.from('tasks').select('id')
        .eq('assigned_freelancer', user.id).eq('status', 'in_progress'),
      supabase.from('task_submissions').select('task_id, status, version')
        .eq('freelancer_id', user.id).order('version', { ascending: false }),
      supabase.from('tasks').select('id')
        .eq('assigned_freelancer', user.id).eq('status', 'pending_payment')
        .not('paid_at', 'is', null),
      supabase.from('account_records').select('id')
        .eq('freelancer_id', user.id).eq('status', 'review'),
      supabase.from('profiles').select('kyc_status').eq('id', user.id).maybeSingle(),
    ])
    const out: Item[] = []
    const latest = new Map<string, string>()
    for (const s of (sub.data ?? []) as { task_id: string; status: string }[]) {
      if (!latest.has(s.task_id)) latest.set(s.task_id, s.status)
    }
    const fresh = ((tk.data ?? []) as { id: string }[]).filter(x => !latest.has(x.id)).length
    if (fresh > 0) out.push({ key: 'assigned', text: t.assigned(fresh), to: '/tasks' })
    const returned = [...latest.values()].filter(v => v === 'returned').length
    if (returned > 0) out.push({ key: 'returned', text: t.returned(returned), to: '/tasks' })
    const pays = (pay.data ?? []).length
    if (pays > 0) out.push({ key: 'pay', text: t.pay(pays), to: '/tasks' })
    const recs = (rec.data ?? []).length
    if (recs > 0) out.push({ key: 'review', text: t.review(recs), to: '/me' })
    if ((pf.data as { kyc_status: string } | null)?.kyc_status === 'rejected') out.push({
      key: 'kyc', text: t.kyc, to: '/onboarding/kyc',
    })
    setItems(out)
  }, [user, t])

  useEffect(() => { void load() }, [load])

  if (!user) return null

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="relative rounded-lg border border-hair p-1.5 text-muted transition hover:text-ink">
        <BellIcon size={16} strokeWidth={1.75} />
        {items.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-text px-1 font-mono text-[10px] text-paper">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-hair bg-surface p-4 shadow-[0_16px_48px_rgba(26,32,30,0.18)]">
          {items.length === 0 ? (
            <p className="py-1 text-xs text-faint">{t.empty}</p>
          ) : items.map(it => (
            <Link key={it.key} to={it.to} onClick={() => setOpen(false)}
              className="block border-b border-hair py-2 text-xs leading-relaxed text-ink transition last:border-b-0 hover:text-petrol">
              {it.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
