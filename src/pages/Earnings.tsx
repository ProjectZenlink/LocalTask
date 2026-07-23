import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task } from '../types/database'
import { payoutLabel } from '../types/database'
import { lt, usd, taskMoney, dateShort, txUrl, shortHash } from '../lib/format'
import { PageHeading, Card, Eyebrow } from '../components/ui'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Wallet',
    sub: "LT Coins track what you're owed — 1 LT Coin = $1. Real money goes straight from the client to you.",
    unlockedHead: 'Unlocked · payment on the way',
    approx: (u: string, l: string, s: string) => `≈ ${u} · locked ${l} · settled ${s}`,
    gLocked: 'Locked', gUnlocked: 'Unlocked', gSettled: 'Settled',
    bonusHead: 'Signup bonus', bonusLocked: 'Locked · complete Enhanced KYC to withdraw',
    payTo: 'Payments go to', crypto: 'Crypto wallet',
    noPayout: "No payout method yet — you can't accept offers until this is set.",
    edit: 'Edit',
    how: 'How LT Coins work',
    steps: [
      { k: 'Lock', cls: 'text-pending-text', d: 'Get assigned a task → its LT Coins lock into your balance. That’s the platform’s written record of what you’re owed.' },
      { k: 'Unlock', cls: 'text-petrol', d: 'Work approved → LT Coins unlock and the client is asked to pay your wallet or PayPal directly.' },
      { k: 'Settle', cls: 'text-verified-text', d: 'You confirm the money arrived → those LT Coins settle (burn). Settled LT Coins = cash that actually reached you.' },
    ],
    ledgerNote: 'LT Coins are a display ledger, not a token or an in-app balance you withdraw. LocalTask never holds your funds — every payment travels client → you, and the task only closes after you confirm receipt.',
    settledHead: 'Settled history',
    settledEmpty: 'Nothing settled yet. Completed tasks land here.',
    ref: 'ref',
  },
  zh: {
    loading: '加载中…', title: '钱包',
    sub: 'LT Coins 记录平台欠你的钱，1 LT Coin = 1 美元。真钱由客户直接打到你的钱包或 PayPal。',
    unlockedHead: '已解锁 · 付款在路上',
    approx: (u: string, l: string, s: string) => `≈ ${u} · 锁定 ${l} · 已结清 ${s}`,
    gLocked: '锁定', gUnlocked: '已解锁', gSettled: '已结清',
    bonusHead: '注册奖励', bonusLocked: '待解锁 · 完成 Enhanced KYC 后可提现',
    payTo: '收款去向', crypto: '加密钱包',
    noPayout: '还没设置收款方式。设置好之前无法接受邀约。',
    edit: '修改',
    how: 'LT Coins 是怎么运作的',
    steps: [
      { k: '锁定', cls: 'text-pending-text', d: '接到任务后，对应 LT Coins 锁进你的余额，这是平台对你应收款的书面记录。' },
      { k: '解锁', cls: 'text-petrol', d: '任务审核通过后 LT Coins 解锁，客户会被要求直接付款到你的钱包或 PayPal。' },
      { k: '结清', cls: 'text-verified-text', d: '你确认到账后，这些 LT Coins 结清（销毁）。已结清的 LT Coins = 真正到手的钱。' },
    ],
    ledgerNote: 'LT Coins 只是记账展示，不是代币，也不是可提现的应用内余额。LocalTask 从不经手你的钱——每笔付款都是客户直接付给你，任务也只有在你确认收到后才会关闭。',
    settledHead: '结清记录',
    settledEmpty: '还没有结清记录。完成的任务会出现在这里。',
    ref: '编号',
  },
}

/** Wallet(原 Coins):LT 是记账展示层,真钱由客户直付你的钱包/PayPal。 */
export default function Wallet() {
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
      .in('status', ['in_progress', 'under_review', 'pending_payment', 'completed'])
      .order('assigned_at', { ascending: false })
      .then(({ data }) => {
        setTasks((data ?? []) as Task[])
        setLoaded(true)
      })
  }, [user])

  if (!loaded) return <div className="text-muted">{t.loading}</div>

  const sum = (list: Task[]) => list.reduce((a, x) => a + Number(x.amount), 0)
  const locked = tasks.filter(x => x.status === 'in_progress' || x.status === 'under_review')
  const unlocked = tasks.filter(x => x.status === 'pending_payment')
  const settled = tasks.filter(x => x.status === 'completed')

  const isPaypal = profile?.payout_method === 'paypal'
  const payoutSet = isPaypal ? !!profile?.payout_paypal_email : !!profile?.payout_address

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      {/* 余额主卡:待收(unlocked)是主角 */}
      <div className="mb-3 overflow-hidden rounded-2xl bg-petrol p-6 text-paper shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">{t.unlockedHead}</p>
        <p className="mt-1 font-display text-4xl font-medium tracking-tight">{lt(sum(unlocked))}</p>
        <p className="mt-2 font-mono text-xs text-paper/60">{t.approx(usd(sum(unlocked)), lt(sum(locked)), lt(sum(settled)))}</p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: t.gLocked, v: sum(locked), cls: 'text-pending-text' },
          { label: t.gUnlocked, v: sum(unlocked), cls: 'text-petrol' },
          { label: t.gSettled, v: sum(settled), cls: 'text-verified-text' },
        ].map(x => (
          <Card key={x.label} className="p-4 text-center">
            <p className={`font-display text-xl font-medium tracking-tight ${x.cls}`}>{lt(x.v).replace(' LT Coins', '')}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x.label} LT Coins</p>
          </Card>
        ))}
      </div>

      {/* 注册奖励卡(F5,提现闸门待 Enhanced KYC) */}
      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Eyebrow>{t.bonusHead}</Eyebrow>
            <p className="mt-1 font-display text-xl font-medium tracking-tight text-ink">{usd(profile?.signup_bonus_usd ?? 2.99)}</p>
          </div>
          <span className="rounded-full border border-pending-border bg-pending-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-pending-text">{t.bonusLocked}</span>
        </div>
      </Card>

      {/* 收款去向卡 */}
      <Card className="mb-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>{t.payTo}</Eyebrow>
            {payoutSet ? (
              isPaypal ? (
                <>
                  <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink">PayPal</p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{profile?.payout_paypal_email}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink">
                    {profile?.payout_network && profile?.payout_token ? payoutLabel(profile.payout_network, profile.payout_token) : t.crypto}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{profile?.payout_address}</p>
                </>
              )
            ) : (
              <p className="mt-1 text-sm text-muted">{t.noPayout}</p>
            )}
          </div>
          <Link to="/me" className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
            {t.edit}
          </Link>
        </div>
      </Card>

      {/* How LT works */}
      <Card className="mb-5 p-5">
        <Eyebrow>{t.how}</Eyebrow>
        <div className="mt-3 space-y-2.5">
          {t.steps.map(x => (
            <div key={x.k} className="flex gap-3">
              <span className={`w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider ${x.cls}`}>{x.k}</span>
              <p className="text-xs leading-relaxed text-muted">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-hair pt-3 text-xs leading-relaxed text-faint">
          {t.ledgerNote}
        </p>
      </Card>

      {unlocked.length > 0 && (
        <Card className="mb-5 p-5">
          <div className="mb-2"><Eyebrow>{t.unlockedHead}</Eyebrow></div>
          {unlocked.map(x => (
            <div key={x.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <Link to={`/tasks/${x.id}`} className="min-w-0 truncate text-sm text-ink hover:text-petrol">{x.title}</Link>
              <p className="shrink-0 font-mono text-sm text-petrol">+{lt(x.amount)}</p>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-2"><Eyebrow>{t.settledHead}</Eyebrow></div>
        {settled.length === 0 ? (
          <p className="py-2 text-sm text-faint">{t.settledEmpty}</p>
        ) : settled.map(x => (
          <div key={x.id} className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
            <div className="min-w-0">
              <Link to={`/tasks/${x.id}`} className="block truncate text-sm text-ink hover:text-petrol">{x.title}</Link>
              <p className="mt-0.5 font-mono text-xs text-faint">
                {dateShort(x.freelancer_confirmed_at)} · {x.payout_method === 'paypal' ? `PayPal · ${usd(x.amount)}` : taskMoney(x.amount, x.payout_token)}
                {x.tx_hash && (x.payout_method === 'paypal' || !x.payout_network ? (
                  <> · {t.ref} {shortHash(x.tx_hash)}</>
                ) : (
                  <> · <a href={txUrl(x.payout_network, x.tx_hash)} target="_blank" rel="noreferrer"
                    className="text-petrol underline underline-offset-2">{shortHash(x.tx_hash)}</a></>
                ))}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm text-verified-text">{lt(x.amount)}</p>
          </div>
        ))}
      </Card>
    </div>
  )
}
