import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell as BellIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/** freelancer 站内小铃铛:提醒在站内,沟通照旧在 WhatsApp/Telegram。 */
interface Item { key: string; text: string; to: string }

export default function FreelancerBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  const load = useCallback(async () => {
    if (!user) return
    const [of, sub, pay, rec, pf] = await Promise.all([
      supabase.from('task_offers').select('id, expires_at')
        .eq('freelancer_id', user.id).eq('status', 'pending')
        .order('expires_at', { ascending: true }),
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
    const offers = of.data ?? []
    if (offers.length > 0) {
      const soonest = new Date(offers[0].expires_at as string)
      const hrs = Math.max(0, Math.round((soonest.getTime() - Date.now()) / 3600000))
      out.push({
        key: 'offers',
        text: `${offers.length} pending offer${offers.length > 1 ? 's' : ''} — soonest expires in ~${hrs}h`,
        to: '/offers',
      })
    }
    const latest = new Map<string, string>()
    for (const s of (sub.data ?? []) as { task_id: string; status: string }[]) {
      if (!latest.has(s.task_id)) latest.set(s.task_id, s.status)
    }
    const returned = [...latest.values()].filter(v => v === 'returned').length
    if (returned > 0) out.push({
      key: 'returned',
      text: `${returned} submission${returned > 1 ? 's' : ''} returned — fix and resubmit`,
      to: '/tasks',
    })
    const pays = (pay.data ?? []).length
    if (pays > 0) out.push({
      key: 'pay',
      text: `${pays} payment${pays > 1 ? 's' : ''} sent — confirm you received it`,
      to: '/tasks',
    })
    const recs = (rec.data ?? []).length
    if (recs > 0) out.push({
      key: 'review',
      text: `${recs} account${recs > 1 ? 's' : ''} under review — your account manager will reach out on WhatsApp/Telegram`,
      to: '/accounts',
    })
    if ((pf.data as { kyc_status: string } | null)?.kyc_status === 'rejected') out.push({
      key: 'kyc',
      text: 'Your KYC was rejected — resubmit your documents',
      to: '/onboarding/kyc',
    })
    setItems(out)
  }, [user])

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
            <p className="py-1 text-xs text-faint">All caught up — nothing needs you right now.</p>
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
