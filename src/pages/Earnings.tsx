import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, BonusGrant } from '../types/database'
import { payoutLabel } from '../types/database'
import { lt, usd, taskMoney, dateShort, txUrl, shortHash, bjDay } from '../lib/format'
import { PageHeading, Card, Eyebrow, Button } from '../components/ui'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Wallet',
    sub: "LT Coins track what you're owed — 1 LT Coin = $1. Real money goes straight from the client to you.",
    unlockedHead: 'Unlocked · payment on the way',
    approx: (u: string, l: string, s: string) => `≈ ${u} · locked ${l} · settled ${s}`,
    gLocked: 'Locked', gUnlocked: 'Unlocked', gSettled: 'Settled',
    ciTitle: 'Daily check-in', ciBtn: 'Check in', ciDone: (n: number) => `Confirmed ✓ · ${n} day streak`,
    ciPending: (n: number) => `Checked in · pending AM review · ${n} day streak`,
    ciStreak: (n: number) => `${n} day streak`, ciNext: (have: number, need: number, amt: string) => `${have}/${need} days to unlock ${amt}`,
    ciAll: 'All streak rewards unlocked 🎉',
    taskReq: 'Request payout', taskReqDone: 'Processing', taskConfirm: 'Confirm received',
    grantHead: 'Streak rewards', grantLockedGate: 'Complete Enhanced KYC to withdraw →',
    grantReq: 'Request payout', grantProcessing: 'Processing — your AM will send it shortly.', grantPaid: 'Paid',
    gk7: '7-day streak', gk15: '15-day streak', gk30: '30-day streak',
    bonusHead: 'Signup bonus',
    bonusLocked: 'Locked · complete Enhanced KYC to withdraw', bonusGo: 'Unlock',
    bonusPending: 'Enhanced KYC under review',
    bonusReady: 'Withdrawable', bonusReq: 'Request payout',
    bonusRequested: 'Payout requested — your AM will send it shortly.',
    bonusPaid: 'Paid',
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
    ciTitle: '每日签到', ciBtn: '签到', ciDone: (n: number) => `已复核 ✓ · 连续 ${n} 天`,
    ciPending: (n: number) => `已签到 · 待 AM 复核 · 连续 ${n} 天`,
    ciStreak: (n: number) => `连续 ${n} 天`, ciNext: (have: number, need: number, amt: string) => `再签 ${need - have} 天解锁 ${amt}(${have}/${need})`,
    ciAll: '签到奖励已全部解锁 🎉',
    taskReq: '申请提现', taskReqDone: '处理中', taskConfirm: '确认收款',
    grantHead: '签到奖励', grantLockedGate: '完成 Enhanced KYC 后可提现 →',
    grantReq: '申请提现', grantProcessing: '提现处理中,AM 会尽快打款。', grantPaid: '已打款',
    gk7: '连续签到 7 天', gk15: '连续签到 15 天', gk30: '连续签到 30 天',
    bonusHead: '注册奖励',
    bonusLocked: '待解锁 · 完成 Enhanced KYC 后可提现', bonusGo: '去解锁',
    bonusPending: 'Enhanced KYC 审核中',
    bonusReady: '可提现', bonusReq: '申请提现',
    bonusRequested: '提现处理中,AM 会尽快打款。',
    bonusPaid: '已打款',
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
  const { profile, refresh } = useProfile()
  const [bonusBusy, setBonusBusy] = useState(false)

  async function requestBonus() {
    if (!user || bonusBusy) return
    setBonusBusy(true)
    const { error: e } = await supabase.from('profiles')
      .update({ signup_bonus_state: 'requested' }).eq('id', user.id)
    if (!e) await refresh()
    setBonusBusy(false)
  }
  const { lang } = useI18n()
  const t = COPY[lang]
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  const [grants, setGrants] = useState<BonusGrant[]>([])
  const [days, setDays] = useState<{ day: string; confirmed_at: string | null }[]>([])
  const [ciBusy, setCiBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const loadExtras = useCallback(async () => {
    if (!user) return
    const [g, c] = await Promise.all([
      supabase.from('bonus_grants').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('checkins').select('day, confirmed_at').eq('user_id', user.id).order('day', { ascending: false }).limit(60),
    ])
    setGrants((g.data ?? []) as BonusGrant[])
    setDays((c.data ?? []) as { day: string; confirmed_at: string | null }[])
  }, [user])
  useEffect(() => { void loadExtras() }, [loadExtras])

  const loadTasks = useCallback(() => {
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
  useEffect(() => { void loadTasks() }, [loadTasks])

  // 北京时间日界线,与后端一致;连续天数按"AM 已复核"口径(m23)
  const bjToday = bjDay()
  const bjYesterday = bjDay(-1)
  const confirmedSet = new Set(days.filter(x => x.confirmed_at).map(x => x.day))
  const todayRow = days.find(x => x.day === bjToday)
  const checkedToday = !!todayRow
  const confirmedToday = !!todayRow?.confirmed_at
  let streak = 0
  {
    const anchor = confirmedSet.has(bjToday) ? bjToday : confirmedSet.has(bjYesterday) ? bjYesterday : null
    if (anchor) {
      const start = new Date(anchor)
      for (let i = 0; ; i++) {
        const d = new Date(start.getTime() - i * 86400_000).toISOString().slice(0, 10)
        if (confirmedSet.has(d)) streak++
        else break
      }
    }
  }
  const NEXT: Array<[number, string]> = [[7, '$4.99'], [15, '$7.99'], [30, '$15.99']]
  const nextTier = NEXT.find(([n]) => streak < n && !grants.some(g => g.kind === `streak_${n}` as BonusGrant['kind']))

  async function checkin() {
    if (ciBusy) return
    setCiBusy(true)
    const { error: e } = await supabase.rpc('do_checkin')
    if (!e) await loadExtras()
    setCiBusy(false)
  }

  async function requestTask(id: string) {
    setRowBusy(id)
    const { error: e } = await supabase.rpc('request_task_payout', { p_task: id })
    if (!e) await new Promise<void>(res => { loadTasks(); setTimeout(res, 300) })
    setRowBusy(null)
  }

  async function confirmTask(id: string) {
    setRowBusy(id)
    const { error: e } = await supabase.rpc('confirm_receipt', { p_task_id: id })
    if (!e) await new Promise<void>(res => { loadTasks(); setTimeout(res, 300) })
    setRowBusy(null)
  }

  async function requestGrant(id: string) {
    setRowBusy(id)
    const { error: e } = await supabase.rpc('request_bonus_grant', { p_grant: id })
    if (!e) await loadExtras()
    setRowBusy(null)
  }

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

      {/* 每日签到(m21) */}
      <Card className="mb-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>{t.ciTitle}</Eyebrow>
            <p className="mt-1 text-sm text-ink">
              {confirmedToday ? t.ciDone(streak) : checkedToday ? t.ciPending(streak) : t.ciStreak(streak)}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-faint">
              {nextTier ? t.ciNext(Math.min(streak, nextTier[0]), nextTier[0], nextTier[1]) : t.ciAll}
            </p>
          </div>
          {!checkedToday && (
            <Button className="px-4 py-2 text-sm" disabled={ciBusy} onClick={checkin}>{ciBusy ? '…' : t.ciBtn}</Button>
          )}
        </div>
      </Card>

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

      {/* 注册奖励卡(m19:五态提现闸门) */}
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>{t.bonusHead}</Eyebrow>
            <p className="mt-1 font-display text-xl font-medium tracking-tight text-ink">{usd(profile?.signup_bonus_usd ?? 2.99)}</p>
          </div>
          {(() => {
            const enh = profile?.enhanced_kyc_status ?? 'none'
            const bst = profile?.signup_bonus_state ?? 'locked'
            const pill = (cls: string, txt: string) => (
              <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{txt}</span>
            )
            if (bst === 'paid') return (
              <div className="text-right">
                {pill('border-verified-border bg-verified-bg text-verified-text', t.bonusPaid)}
                {profile?.bonus_tx_ref && <p className="mt-1.5 font-mono text-[11px] text-faint">{profile.bonus_tx_ref}</p>}
              </div>
            )
            if (bst === 'requested') return pill('border-pending-border bg-pending-bg text-pending-text', t.bonusRequested)
            if (enh === 'verified') return (
              <div className="flex items-center gap-2.5">
                {pill('border-verified-border bg-verified-bg text-verified-text', t.bonusReady)}
                <Button className="px-3 py-1.5 text-xs" disabled={bonusBusy} onClick={requestBonus}>{bonusBusy ? '…' : t.bonusReq}</Button>
              </div>
            )
            if (enh === 'pending') return pill('border-pending-border bg-pending-bg text-pending-text', t.bonusPending)
            return (
              <div className="flex items-center gap-2.5">
                {pill('border-pending-border bg-pending-bg text-pending-text', t.bonusLocked)}
                <Link to="/enhanced-kyc"><Button className="px-3 py-1.5 text-xs">{t.bonusGo}</Button></Link>
              </div>
            )
          })()}
        </div>
      </Card>

      {/* 签到奖励(m21) */}
      {grants.length > 0 && (
        <Card className="mb-5 p-5">
          <div className="mb-2"><Eyebrow>{t.grantHead}</Eyebrow></div>
          {grants.map(g => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <div>
                <p className="text-sm text-ink">{g.kind === 'streak_7' ? t.gk7 : g.kind === 'streak_15' ? t.gk15 : t.gk30}</p>
                <p className="mt-0.5 font-display text-base font-medium tracking-tight text-ink">{usd(g.amount)}</p>
              </div>
              <div className="shrink-0 text-right">
                {g.state === 'paid' ? (
                  <>
                    <span className="rounded-full border border-verified-border bg-verified-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-verified-text">{t.grantPaid}</span>
                    {g.tx_ref && <p className="mt-1.5 font-mono text-[11px] text-faint">{g.tx_ref}</p>}
                  </>
                ) : g.state === 'requested' ? (
                  <span className="rounded-full border border-pending-border bg-pending-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-pending-text">{t.grantProcessing}</span>
                ) : (profile?.enhanced_kyc_status ?? 'none') === 'verified' ? (
                  <Button className="px-3 py-1.5 text-xs" disabled={rowBusy === g.id} onClick={() => void requestGrant(g.id)}>
                    {rowBusy === g.id ? '…' : t.grantReq}
                  </Button>
                ) : (
                  <Link to="/enhanced-kyc" className="text-sm text-petrol underline underline-offset-2">{t.grantLockedGate}</Link>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

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
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
              <div className="min-w-0">
                <Link to={`/tasks/${x.id}`} className="block truncate text-sm text-ink hover:text-petrol">{x.title}</Link>
                <p className="mt-0.5 font-mono text-xs text-faint">+{lt(x.amount)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {x.paid_at ? (
                  <>
                    {x.tx_hash && x.payout_network && (
                      <a href={txUrl(x.payout_network, x.tx_hash)} target="_blank" rel="noreferrer"
                        className="font-mono text-[11px] text-petrol underline underline-offset-2">{shortHash(x.tx_hash)}</a>
                    )}
                    <Button className="px-3 py-1.5 text-xs" disabled={rowBusy === x.id} onClick={() => void confirmTask(x.id)}>
                      {rowBusy === x.id ? '…' : t.taskConfirm}
                    </Button>
                  </>
                ) : x.payout_requested_at ? (
                  <span className="rounded-full border border-pending-border bg-pending-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-pending-text">{t.taskReqDone}</span>
                ) : (
                  <Button className="px-3 py-1.5 text-xs" disabled={rowBusy === x.id} onClick={() => void requestTask(x.id)}>
                    {rowBusy === x.id ? '…' : t.taskReq}
                  </Button>
                )}
              </div>
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
