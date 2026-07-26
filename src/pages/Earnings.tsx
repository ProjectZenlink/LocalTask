import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, BonusGrant, PayoutRequest } from '../types/database'
import { payoutLabel } from '../types/database'
import { lt, usd, taskMoney, dateShort, txUrl, shortHash, bjDay } from '../lib/format'
import { PageHeading, Card, Eyebrow, Button, Alert } from '../components/ui'
import { useI18n } from '../lib/i18n'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Wallet',
    sub: 'Everything you earn lands here — task pay, signup bonus, streak rewards. One button withdraws it all.',
    withdrawHead: 'Withdrawable',
    approx: (l: string, s: string) => `locked ${l} · settled ${s}`,
    gLocked: 'Locked', gUnlocked: 'Unlocked', gSettled: 'Settled',
    ciTitle: 'Daily check-in', ciBtn: 'Check in', ciDone: (n: number) => `Confirmed ✓ · ${n} day streak`,
    ciPending: (n: number) => `Checked in · pending AM review · ${n} day streak`,
    ciStreak: (n: number) => `${n} day streak`, ciNext: (have: number, need: number, amt: string) => `${have}/${need} days to unlock ${amt}`,
    ciAll: 'All streak rewards unlocked 🎉',
    wReq: 'Request payout', wBusy: 'Sending…',
    wNone: 'Nothing to withdraw yet — approved task pay and rewards will show up here.',
    wPendingPill: 'Payout requested · your AM is on it',
    wPaidPill: 'Sent · confirm below',
    wEnhPending: 'Enhanced KYC under review — payouts unlock once it\u2019s approved.',
    wEnhGate: 'Complete Enhanced KYC to withdraw',
    reqHead: 'Payout requests',
    reqEmpty: 'No payout requests yet.',
    stPending: 'Awaiting AM', stPaid: 'Sent · confirm receipt', stDone: 'Completed', stRejected: 'Rejected',
    confirmBtn: 'I received the payment', confirmBusy: 'Confirming…',
    confirmHint: 'Check your wallet or PayPal. Once the money is in, confirm — every task in this request closes and rewards settle. Not there yet? Message your AM instead.',
    rejReason: 'Reason', ref: 'ref',
    bonusHead: 'Signup bonus',
    bonusLocked: 'Bundled into your next payout request',
    bonusLockedGate: 'Withdrawable after Enhanced KYC',
    bonusRequested: 'In a payout request',
    bonusPaid: 'Paid',
    grantHead: 'Streak rewards',
    gk7: '7-day streak', gk15: '15-day streak', gk30: '30-day streak',
    payTo: 'Payments go to', crypto: 'Crypto wallet',
    noPayout: "No payout method yet — you can't accept offers until this is set.",
    edit: 'Edit',
    how: 'How LT Coins work',
    steps: [
      { k: 'Lock', cls: 'text-pending-text', d: 'Get assigned a task → its LT Coins lock into your balance. That’s the platform’s written record of what you’re owed.' },
      { k: 'Unlock', cls: 'text-petrol', d: 'Work approved → LT Coins unlock into your withdrawable balance, together with your bonuses.' },
      { k: 'Settle', cls: 'text-verified-text', d: 'You request a payout, your AM sends the money, you confirm it arrived → those LT Coins settle (burn). Settled = cash that actually reached you.' },
    ],
    ledgerNote: 'LT Coins are a display ledger, not a token or an in-app balance. LocalTask never holds your funds — payouts go straight to your own wallet or PayPal, and nothing closes until you confirm the money arrived.',
    unlockedHead: 'Unlocked tasks',
    inReq: 'In payout request', legacyConfirm: 'Confirm received', pendingPack: 'Ready for your next payout request',
    processing: 'Processing',
    settledHead: 'Settled history',
    settledEmpty: 'Nothing settled yet. Completed tasks land here.',
  },
  zh: {
    loading: '加载中…', title: '钱包',
    sub: '你赚到的一切都汇到这里——任务报酬、注册奖励、签到奖励。一个按钮统一提现。',
    withdrawHead: '可提现',
    approx: (l: string, s: string) => `锁定 ${l} · 已结清 ${s}`,
    gLocked: '锁定', gUnlocked: '已解锁', gSettled: '已结清',
    ciTitle: '每日签到', ciBtn: '签到', ciDone: (n: number) => `已复核 ✓ · 连续 ${n} 天`,
    ciPending: (n: number) => `已签到 · 待 AM 复核 · 连续 ${n} 天`,
    ciStreak: (n: number) => `连续 ${n} 天`, ciNext: (have: number, need: number, amt: string) => `再签 ${need - have} 天解锁 ${amt}(${have}/${need})`,
    ciAll: '签到奖励已全部解锁 🎉',
    wReq: '申请提现', wBusy: '提交中…',
    wNone: '暂无可提现——任务审核通过的报酬和奖励会出现在这里。',
    wPendingPill: '提现处理中 · AM 打款中',
    wPaidPill: '已打款 · 请在下方确认',
    wEnhPending: 'Enhanced KYC 审核中,通过后即可提现。',
    wEnhGate: '完成 Enhanced KYC 后提现',
    reqHead: '提现工单',
    reqEmpty: '还没有提现记录。',
    stPending: '待 AM 处理', stPaid: '已打款 · 待确认', stDone: '已完成', stRejected: '已驳回',
    confirmBtn: '我收到钱了', confirmBusy: '确认中…',
    confirmHint: '去钱包或 PayPal 核对。钱到了就确认——这张工单里的任务会全部关单、奖励同时落账;还没到就先别点,直接联系你的 AM。',
    rejReason: '原因', ref: '编号',
    bonusHead: '注册奖励',
    bonusLocked: '将随下次提现工单一起打包',
    bonusLockedGate: '完成 Enhanced KYC 后可提现',
    bonusRequested: '已在提现工单中',
    bonusPaid: '已打款',
    grantHead: '签到奖励',
    gk7: '连续签到 7 天', gk15: '连续签到 15 天', gk30: '连续签到 30 天',
    payTo: '收款去向', crypto: '加密钱包',
    noPayout: '还没设置收款方式。设置好之前无法接受邀约。',
    edit: '修改',
    how: 'LT Coins 是怎么运作的',
    steps: [
      { k: '锁定', cls: 'text-pending-text', d: '接到任务后，对应 LT Coins 锁进你的余额，这是平台对你应收款的书面记录。' },
      { k: '解锁', cls: 'text-petrol', d: '任务审核通过后 LT Coins 解锁，和各项奖励一起进入你的可提现余额。' },
      { k: '结清', cls: 'text-verified-text', d: '你发起提现，AM 打款到你的钱包或 PayPal，你确认到账后这些 LT Coins 结清（销毁）。已结清 = 真正到手的钱。' },
    ],
    ledgerNote: 'LT Coins 只是记账展示，不是代币，也不是应用内余额。LocalTask 从不代管你的钱——提现直接打到你自己的钱包或 PayPal，并且只有在你确认到账后，对应的任务和奖励才会关闭结清。',
    unlockedHead: '已解锁任务',
    inReq: '已在提现工单', legacyConfirm: '确认收款', pendingPack: '待打包进下次提现',
    processing: '处理中',
    settledHead: '结清记录',
    settledEmpty: '还没有结清记录。完成的任务会出现在这里。',
  },
}

/** Wallet(v48):全部收入统一进钱包,一键打包成提现工单发给专属 AM。 */
export default function Wallet() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]

  const [tasks, setTasks] = useState<Task[]>([])
  const [grants, setGrants] = useState<BonusGrant[]>([])
  const [requests, setRequests] = useState<PayoutRequest[]>([])
  const [days, setDays] = useState<{ day: string; confirmed_at: string | null }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ciBusy, setCiBusy] = useState(false)
  const [reqBusy, setReqBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    if (!user) return
    const [tk, g, c, r] = await Promise.all([
      supabase.from('tasks').select('*').eq('assigned_freelancer', user.id)
        .in('status', ['in_progress', 'under_review', 'pending_payment', 'completed'])
        .order('assigned_at', { ascending: false }),
      supabase.from('bonus_grants').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('checkins').select('day, confirmed_at').eq('user_id', user.id).order('day', { ascending: false }).limit(60),
      supabase.from('payout_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setTasks((tk.data ?? []) as Task[])
    setGrants((g.data ?? []) as BonusGrant[])
    setDays((c.data ?? []) as { day: string; confirmed_at: string | null }[])
    setRequests((r.data ?? []) as PayoutRequest[])
    setLoaded(true)
  }, [user])
  useEffect(() => { void loadAll() }, [loadAll])

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
    if (!e) await loadAll()
    setCiBusy(false)
  }

  async function requestPayout() {
    if (reqBusy) return
    setErr(null); setReqBusy(true)
    const { error: e } = await supabase.rpc('request_wallet_payout')
    setReqBusy(false)
    if (e) { setErr(e.message); return }
    await Promise.all([loadAll(), refresh()])
  }

  async function confirmRequest(id: string) {
    setErr(null); setRowBusy(id)
    const { error: e } = await supabase.rpc('confirm_wallet_payout', { p_request: id })
    setRowBusy(null)
    if (e) { setErr(e.message); return }
    await Promise.all([loadAll(), refresh()])
  }

  async function confirmLegacyTask(id: string) {
    setErr(null); setRowBusy(id)
    const { error: e } = await supabase.rpc('confirm_receipt', { p_task_id: id })
    setRowBusy(null)
    if (e) { setErr(e.message); return }
    await loadAll()
  }

  if (!loaded) return <div className="text-muted">{t.loading}</div>

  const sum = (list: Task[]) => list.reduce((a, x) => a + Number(x.amount), 0)
  const locked = tasks.filter(x => x.status === 'in_progress' || x.status === 'under_review')
  const unlocked = tasks.filter(x => x.status === 'pending_payment')
  const settled = tasks.filter(x => x.status === 'completed')

  const openReq = requests.find(r => r.status === 'pending' || r.status === 'paid_pending_confirm') ?? null
  const openIds = new Set((openReq?.items ?? []).filter(i => i.kind === 'task').map(i => i.ref))
  const inOpenReq = (taskId: string) => openIds.has(taskId)

  const enh = profile?.enhanced_kyc_status ?? 'none'
  const bst = profile?.signup_bonus_state ?? 'locked'
  const bonusUsd = Number(profile?.signup_bonus_usd ?? 2.99)
  const wTasks = unlocked.filter(x => !x.paid_at && !x.payout_requested_at)
  const wGrants = grants.filter(g => g.state === 'locked')
  const withdrawable = sum(wTasks)
    + wGrants.reduce((a, g) => a + Number(g.amount), 0)
    + (bst === 'locked' ? bonusUsd : 0)

  const isPaypal = profile?.payout_method === 'paypal'
  const payoutSet = isPaypal ? !!profile?.payout_paypal_email : !!profile?.payout_address

  const chip = (cls: string, txt: string) => (
    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{txt}</span>
  )
  const stChip = (s: PayoutRequest['status']) =>
    s === 'pending' ? chip('border-pending-border bg-pending-bg text-pending-text', t.stPending)
    : s === 'paid_pending_confirm' ? chip('border-petrol/30 bg-petrol/10 text-petrol', t.stPaid)
    : s === 'completed' ? chip('border-verified-border bg-verified-bg text-verified-text', t.stDone)
    : chip('border-hair bg-paper text-faint', t.stRejected)

  const itemLabel = (i: { kind: string; label: string }) =>
    i.kind === 'signup' ? t.bonusHead
    : i.kind === 'grant' ? (i.label === 'streak_7' ? t.gk7 : i.label === 'streak_15' ? t.gk15 : i.label === 'streak_30' ? t.gk30 : t.grantHead)
    : i.label

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      {err && <Alert tone="error">{err}</Alert>}

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

      {/* 可提现主卡(v48):统一提款按钮 */}
      <div className="mb-3 overflow-hidden rounded-2xl bg-petrol p-6 text-paper shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">{t.withdrawHead}</p>
        <p className="mt-1 font-display text-4xl font-medium tracking-tight">{usd(withdrawable)}</p>
        <p className="mt-2 font-mono text-xs text-paper/60">{t.approx(lt(sum(locked)), lt(sum(settled)))}</p>
        <div className="mt-4">
          {openReq?.status === 'pending' ? (
            <span className="inline-block rounded-full border border-paper/30 bg-paper/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper/90">{t.wPendingPill}</span>
          ) : openReq?.status === 'paid_pending_confirm' ? (
            <span className="inline-block rounded-full border border-paper/30 bg-paper/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper/90">{t.wPaidPill}</span>
          ) : withdrawable <= 0 ? (
            <p className="font-mono text-[11px] text-paper/50">{t.wNone}</p>
          ) : enh === 'pending' ? (
            <span className="inline-block rounded-full border border-paper/30 bg-paper/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper/90">{t.wEnhPending}</span>
          ) : enh !== 'verified' ? (
            <Link to="/enhanced-kyc" className="inline-block rounded-xl bg-paper px-4 py-2 font-display text-sm font-medium tracking-tight text-petrol transition hover:opacity-90">
              {t.wEnhGate} →
            </Link>
          ) : (
            <button onClick={requestPayout} disabled={reqBusy}
              className="rounded-xl bg-paper px-4 py-2 font-display text-sm font-medium tracking-tight text-petrol transition hover:opacity-90 disabled:opacity-60">
              {reqBusy ? t.wBusy : `${t.wReq} · ${usd(withdrawable)}`}
            </button>
          )}
        </div>
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

      {/* 提现工单(v48) */}
      <Card className="mb-5 p-5">
        <div className="mb-2"><Eyebrow>{t.reqHead}</Eyebrow></div>
        {requests.length === 0 ? (
          <p className="py-2 text-sm text-faint">{t.reqEmpty}</p>
        ) : requests.map(r => (
          <div key={r.id} className="border-b border-hair py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-base font-medium tracking-tight text-ink">{usd(r.total)}</p>
                <p className="mt-0.5 font-mono text-[11px] text-faint">{dateShort(r.created_at)}</p>
              </div>
              <div className="shrink-0">{stChip(r.status)}</div>
            </div>
            <div className="mt-2 space-y-0.5">
              {r.items.map((i, idx) => (
                <p key={idx} className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-muted">
                  <span className="truncate">{itemLabel(i)}</span>
                  <span className="shrink-0">{usd(i.amount)}</span>
                </p>
              ))}
            </div>
            {(r.tx_ref || r.note) && (
              <p className="mt-2 font-mono text-[11px] text-faint">
                {r.tx_ref && <>{t.ref} {r.tx_ref}</>}
                {r.tx_ref && r.note && ' · '}
                {r.note}
              </p>
            )}
            {r.status === 'rejected' && r.reject_reason && (
              <p className="mt-2 text-xs text-muted">{t.rejReason}: {r.reject_reason}</p>
            )}
            {r.status === 'paid_pending_confirm' && (
              <div className="mt-3 rounded-xl border border-petrol/20 bg-petrol/5 p-3">
                <p className="text-xs leading-relaxed text-muted">{t.confirmHint}</p>
                <Button className="mt-2.5 w-full" disabled={rowBusy === r.id} onClick={() => void confirmRequest(r.id)}>
                  {rowBusy === r.id ? t.confirmBusy : t.confirmBtn}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* 注册奖励:纯状态展示(闸门与按钮集中在主卡) */}
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>{t.bonusHead}</Eyebrow>
            <p className="mt-1 font-display text-xl font-medium tracking-tight text-ink">{usd(bonusUsd)}</p>
          </div>
          {bst === 'paid' ? (
            <div className="text-right">
              {chip('border-verified-border bg-verified-bg text-verified-text', t.bonusPaid)}
              {profile?.bonus_tx_ref && <p className="mt-1.5 font-mono text-[11px] text-faint">{profile.bonus_tx_ref}</p>}
            </div>
          ) : bst === 'requested' ? (
            chip('border-pending-border bg-pending-bg text-pending-text', t.bonusRequested)
          ) : (
            chip('border-hair bg-paper text-faint', enh === 'verified' ? t.bonusLocked : t.bonusLockedGate)
          )}
        </div>
      </Card>

      {/* 签到奖励:纯状态展示 */}
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
                    {chip('border-verified-border bg-verified-bg text-verified-text', t.bonusPaid)}
                    {g.tx_ref && <p className="mt-1.5 font-mono text-[11px] text-faint">{g.tx_ref}</p>}
                  </>
                ) : g.state === 'requested' ? (
                  chip('border-pending-border bg-pending-bg text-pending-text', t.bonusRequested)
                ) : (
                  chip('border-hair bg-paper text-faint', enh === 'verified' ? t.bonusLocked : t.bonusLockedGate)
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
                {inOpenReq(x.id) ? (
                  <span className="rounded-full border border-pending-border bg-pending-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-pending-text">{t.inReq}</span>
                ) : x.paid_at ? (
                  <>
                    {x.tx_hash && x.payout_network && (
                      <a href={txUrl(x.payout_network, x.tx_hash)} target="_blank" rel="noreferrer"
                        className="font-mono text-[11px] text-petrol underline underline-offset-2">{shortHash(x.tx_hash)}</a>
                    )}
                    <Button className="px-3 py-1.5 text-xs" disabled={rowBusy === x.id} onClick={() => void confirmLegacyTask(x.id)}>
                      {rowBusy === x.id ? '…' : t.legacyConfirm}
                    </Button>
                  </>
                ) : x.payout_requested_at ? (
                  <span className="rounded-full border border-pending-border bg-pending-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-pending-text">{t.processing}</span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-faint">{t.pendingPack}</span>
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
