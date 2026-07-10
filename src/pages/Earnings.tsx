import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task } from '../types/database'
import { payoutLabel } from '../types/database'
import { lt, usd, taskMoney, dateShort, txUrl, shortHash } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'

/** Wallet(原 Coins):LT 是记账展示层,真钱由客户直付你的钱包/PayPal。 */
export default function Wallet() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('tasks')
      .select('*')
      .eq('assigned_freelancer', user.id)
      .in('status', ['in_progress', 'under_review', 'pending_payment', 'completed'])
      .order('assigned_at', { ascending: false })
      .then(({ data }) => {
        setTasks((data ?? []) as Task[])
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <div className="text-muted">Loading…</div>

  const sum = (list: Task[]) => list.reduce((a, t) => a + Number(t.amount), 0)
  const locked = tasks.filter(t => t.status === 'in_progress' || t.status === 'under_review')
  const unlocked = tasks.filter(t => t.status === 'pending_payment')
  const settled = tasks.filter(t => t.status === 'completed')

  const isPaypal = profile?.payout_method === 'paypal'
  const payoutSet = isPaypal ? !!profile?.payout_paypal_email : !!profile?.payout_address

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub="LocalTask Coins (LT) track what you're owed — 1 LT = $1. Real money goes straight from the client to you.">
        Wallet
      </PageHeading>

      {/* 余额主卡:待收(unlocked)是主角 */}
      <div className="mb-3 overflow-hidden rounded-2xl bg-petrol p-6 text-paper shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">Unlocked · payment on the way</p>
        <p className="mt-1 font-display text-4xl font-medium tracking-tight">{lt(sum(unlocked))}</p>
        <p className="mt-2 font-mono text-xs text-paper/60">≈ {usd(sum(unlocked))} · locked {lt(sum(locked))} · settled {lt(sum(settled))}</p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Locked', v: sum(locked), cls: 'text-pending-text' },
          { label: 'Unlocked', v: sum(unlocked), cls: 'text-petrol' },
          { label: 'Settled', v: sum(settled), cls: 'text-verified-text' },
        ].map(x => (
          <Card key={x.label} className="p-4 text-center">
            <p className={`font-display text-xl font-medium tracking-tight ${x.cls}`}>{lt(x.v).replace(' LT', '')}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x.label} LT</p>
          </Card>
        ))}
      </div>

      {/* 收款去向卡 */}
      <Card className="mb-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Payments go to</Eyebrow>
            {payoutSet ? (
              isPaypal ? (
                <>
                  <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink">PayPal</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{profile?.payout_paypal_email}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink">
                    {profile?.payout_network && profile?.payout_token ? payoutLabel(profile.payout_network, profile.payout_token) : 'Crypto wallet'}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{profile?.payout_address}</p>
                </>
              )
            ) : (
              <p className="mt-1 text-sm text-muted">No payout method yet — you can't accept offers until this is set.</p>
            )}
          </div>
          <Link to="/me" className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
            Edit
          </Link>
        </div>
      </Card>

      {/* How LT works */}
      <Card className="mb-5 p-5">
        <Eyebrow>How LT works</Eyebrow>
        <div className="mt-3 space-y-2.5">
          {[
            { k: 'Lock', cls: 'text-pending-text', d: 'Accept a task → its LT lock into your balance. That\u2019s the platform\u2019s written record of what you\u2019re owed.' },
            { k: 'Unlock', cls: 'text-petrol', d: 'Work approved → LT unlock and the client is asked to pay your wallet or PayPal directly.' },
            { k: 'Settle', cls: 'text-verified-text', d: 'You confirm the money arrived → those LT settle (burn). Settled LT = cash that actually reached you.' },
          ].map(x => (
            <div key={x.k} className="flex gap-3">
              <span className={`w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider ${x.cls}`}>{x.k}</span>
              <p className="text-xs leading-relaxed text-muted">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-hair pt-3 text-xs leading-relaxed text-faint">
          LT is a display ledger, not a token or an in-app balance you withdraw. LocalTask never holds your funds —
          every payment travels client → you, and the task only closes after you confirm receipt.
        </p>
      </Card>

      {unlocked.length > 0 && (
        <Card className="mb-5 p-5">
          <div className="mb-2"><Eyebrow>Unlocked · payment on the way</Eyebrow></div>
          {unlocked.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <Link to={`/tasks/${t.id}`} className="min-w-0 truncate text-sm text-ink hover:text-petrol">{t.title}</Link>
              <p className="shrink-0 font-mono text-sm text-petrol">+{lt(t.amount)}</p>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-2"><Eyebrow>Settled history</Eyebrow></div>
        {settled.length === 0 ? (
          <p className="py-2 text-sm text-faint">Nothing settled yet. Completed tasks land here.</p>
        ) : settled.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
            <div className="min-w-0">
              <Link to={`/tasks/${t.id}`} className="block truncate text-sm text-ink hover:text-petrol">{t.title}</Link>
              <p className="mt-0.5 font-mono text-xs text-faint">
                {dateShort(t.freelancer_confirmed_at)} · {t.payout_method === 'paypal' ? `PayPal · ${usd(t.amount)}` : taskMoney(t.amount, t.payout_token)}
                {t.tx_hash && (t.payout_method === 'paypal' || !t.payout_network ? (
                  <> · ref {shortHash(t.tx_hash)}</>
                ) : (
                  <> · <a href={txUrl(t.payout_network, t.tx_hash)} target="_blank" rel="noreferrer"
                    className="text-petrol underline underline-offset-2">{shortHash(t.tx_hash)}</a></>
                ))}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm text-verified-text">{lt(t.amount)}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
