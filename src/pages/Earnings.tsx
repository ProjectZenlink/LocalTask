import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, BonusGrant, PayoutRequest } from '../types/database'
import { payoutLabel } from '../types/database'
import { lt, usd, taskMoney, dateShort, txUrl, shortHash, bjDay } from '../lib/format'
import { PageHeading, Card, Eyebrow, Button, Alert } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { EASE, Stagger, Item, Collapse, CountUp, CheckDraw } from '../components/motionKit'
import { SkeletonPage } from '../components/Skeleton'

const COPY = {
  en: {
    title: 'Wallet',
    sub: 'Task pay, bonuses, streaks — one button withdraws it all.',
    withdrawHead: 'Withdrawable',
    approx: (l: string, s: string) => `locked ${l} · settled ${s}`,
    gLocked: 'Locked', gUnlocked: 'Unlocked', gSettled: 'Settled',
    ciTitle: 'Daily check-in', ciBtn: 'Check in',
    ciDone: (n: number) => `Confirmed ✓ · ${n} day streak`,
    ciPending: (n: number) => `Checked in · AM reviewing · ${n} day streak`,
    ciStreak: (n: number) => `${n} day streak`,
    ciNext: (have: number, need: number, amt: string) => `${have}/${need} days → ${amt}`,
    ciAll: 'All streak rewards unlocked 🎉',
    ciFlipHead: 'Streak', ciFlipDays: (n: number) => `${n} days`,
    wReq: 'Request payout', wBusy: 'Sending…',
    wNone: 'Approved pay and rewards show up here.',
    wPendingPill: 'Requested · your AM is on it',
    wPaidPill: 'Sent · confirm below ↓',
    wEnhPending: 'Enhanced KYC in review',
    wEnhGate: 'Complete Enhanced KYC to withdraw',
    reqHead: 'Payout requests',
    stPending: 'Awaiting AM', stPaid: 'Sent · confirm receipt', stDone: 'Completed', stRejected: 'Rejected',
    confirmBtn: 'I received the payment', confirmBusy: 'Confirming…',
    confirmHint: 'Money in? Confirm — the whole request closes at once. Not yet? Message your AM.',
    rejReason: 'Reason', ref: 'ref',
    bonusHead: 'Signup bonus',
    bonusLocked: 'Goes out with your next payout',
    bonusLockedGate: 'Unlocks after Enhanced KYC',
    bonusRequested: 'In a payout request',
    bonusPaid: 'Paid',
    grantHead: 'Streak rewards',
    gk7: '7-day streak', gk15: '15-day streak', gk30: '30-day streak',
    payTo: 'Payments go to', crypto: 'Crypto wallet',
    noPayout: 'No payout method yet — add one in your profile.',
    edit: 'Edit',
    how: 'How LT Coins work',
    steps: [
      { k: 'Lock', cls: 'text-pending-text', d: 'Task assigned → its LT Coins lock in. 1 LT = $1 owed.' },
      { k: 'Unlock', cls: 'text-petrol', d: 'Work approved → coins join your withdrawable balance.' },
      { k: 'Settle', cls: 'text-verified-text', d: 'You confirm the payout arrived → coins settle. Settled = cash in hand.' },
    ],
    ledgerNote: 'LocalTask never holds your funds — payouts go straight to your own wallet or PayPal.',
    unlockedHead: 'Unlocked tasks',
    inReq: 'In payout request', legacyConfirm: 'Confirm received', pendingPack: 'Next payout', processing: 'Processing',
    settledHead: 'Settled history',
    settledEmpty: 'Completed tasks land here.',
  },
  zh: {
    title: '钱包',
    sub: '任务报酬和各类奖励都在这里，一键提现。',
    withdrawHead: '可提现',
    approx: (l: string, s: string) => `锁定 ${l} · 已结清 ${s}`,
    gLocked: '锁定', gUnlocked: '已解锁', gSettled: '已结清',
    ciTitle: '每日签到', ciBtn: '签到',
    ciDone: (n: number) => `已复核 ✓ · 连续 ${n} 天`,
    ciPending: (n: number) => `已签到 · AM 复核中 · 连续 ${n} 天`,
    ciStreak: (n: number) => `连续 ${n} 天`,
    ciNext: (have: number, need: number, amt: string) => `${have}/${need} 天 → ${amt}`,
    ciAll: '签到奖励已全部解锁 🎉',
    ciFlipHead: '连击', ciFlipDays: (n: number) => `${n} 天`,
    wReq: '申请提现', wBusy: '提交中…',
    wNone: '任务通过后的报酬和奖励会出现在这里。',
    wPendingPill: '已申请 · AM 处理中',
    wPaidPill: '已打款 · 到下方确认 ↓',
    wEnhPending: 'Enhanced KYC 审核中',
    wEnhGate: '完成 Enhanced KYC 后提现',
    reqHead: '提现工单',
    stPending: '待 AM 处理', stPaid: '已打款 · 待确认', stDone: '已完成', stRejected: '已驳回',
    confirmBtn: '我收到钱了', confirmBusy: '确认中…',
    confirmHint: '钱到了就确认，整单一起关；没到先别点，找你的 AM。',
    rejReason: '原因', ref: '编号',
    bonusHead: '注册奖励',
    bonusLocked: '随下次提现一起打包',
    bonusLockedGate: '完成 Enhanced KYC 后解锁',
    bonusRequested: '已在提现工单',
    bonusPaid: '已打款',
    grantHead: '签到奖励',
    gk7: '连续签到 7 天', gk15: '连续签到 15 天', gk30: '连续签到 30 天',
    payTo: '收款去向', crypto: '加密钱包',
    noPayout: '还没有收款方式——去资料页添加。',
    edit: '修改',
    how: 'LT Coins 是怎么运作的',
    steps: [
      { k: '锁定', cls: 'text-pending-text', d: '接到任务 → LT Coins 锁入余额，1 LT = 欠你 1 美元。' },
      { k: '解锁', cls: 'text-petrol', d: '审核通过 → 进入可提现余额。' },
      { k: '结清', cls: 'text-verified-text', d: '你确认到账 → 结清销毁。已结清 = 真正到手。' },
    ],
    ledgerNote: 'LocalTask 从不代管你的钱——提现直接打到你自己的钱包或 PayPal。',
    unlockedHead: '已解锁任务',
    inReq: '已在提现工单', legacyConfirm: '确认收款', pendingPack: '待下次提现', processing: '处理中',
    settledHead: '结清记录',
    settledEmpty: '完成的任务会出现在这里。',
  },
}

type ReqPhase = 'idle' | 'busy' | 'ok'

/** Wallet(v49):可提现是主角;按钮三态变身;签到翻牌;教学折叠。 */
export default function Wallet() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
  const rm = useReducedMotion()

  const [tasks, setTasks] = useState<Task[]>([])
  const [grants, setGrants] = useState<BonusGrant[]>([])
  const [requests, setRequests] = useState<PayoutRequest[]>([])
  const [days, setDays] = useState<{ day: string; confirmed_at: string | null }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ciBusy, setCiBusy] = useState(false)
  const [ciFlipped, setCiFlipped] = useState(false)
  const [reqPhase, setReqPhase] = useState<ReqPhase>('idle')
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [howOpen, setHowOpen] = useState(false)

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

  // 北京时间日界线,连续天数按"AM 已复核"口径(m23)
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
    if (!e) {
      await loadAll()
      setCiFlipped(true)
      setTimeout(() => setCiFlipped(false), 2600)
    }
    setCiBusy(false)
  }

  async function requestPayout() {
    if (reqPhase !== 'idle') return
    setErr(null); setReqPhase('busy')
    const { error: e } = await supabase.rpc('request_wallet_payout')
    if (e) { setErr(e.message); setReqPhase('idle'); return }
    setReqPhase('ok')
    setTimeout(() => {
      void Promise.all([loadAll(), refresh()]).then(() => setReqPhase('idle'))
    }, 900)
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

  if (!loaded) return <SkeletonPage />

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

      <Stagger>
      {/* 每日签到:签到成功翻牌展示连击 */}
      <Item>
      <div className="relative mb-3" style={{ perspective: 1000 }}>
        <motion.div
          className="relative"
          animate={{ rotateY: ciFlipped && !rm ? 180 : 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <Card className="p-5" >
            <div className="flex flex-wrap items-center justify-between gap-3" style={{ backfaceVisibility: 'hidden' }}>
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
          {/* 背面:连击奖励瞬间 */}
          <div
            className="absolute inset-0 flex items-center justify-between gap-4 rounded-2xl border border-petrol/25 bg-petrol px-5 text-paper"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">{t.ciFlipHead}</p>
              <p className="font-display text-2xl font-medium tracking-tight">{t.ciFlipDays(streak + (confirmedToday ? 0 : 1))}</p>
            </div>
            {nextTier && (
              <div className="min-w-0 flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-paper/20">
                  <motion.div
                    className="h-full rounded-full bg-paper"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((streak + 1) / nextTier[0]) * 100)}%` }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.4 }}
                  />
                </div>
                <p className="mt-1.5 text-right font-mono text-[10px] text-paper/70">→ {nextTier[1]}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
      </Item>

      {/* 可提现主卡:数字滚动 + 按钮三态变身 */}
      <Item>
      <div className="mb-3 overflow-hidden rounded-2xl bg-petrol p-6 text-paper shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60">{t.withdrawHead}</p>
        <p className="mt-1 font-display text-4xl font-medium tracking-tight">
          <CountUp value={withdrawable} format={n => usd(n)} />
        </p>
        <p className="mt-2 font-mono text-xs text-paper/60">{t.approx(lt(sum(locked)), lt(sum(settled)))}</p>
        <div className="mt-4 min-h-[38px]">
          <AnimatePresence mode="wait" initial={false}>
            {openReq?.status === 'pending' ? (
              <motion.span key="pill-p" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="inline-block rounded-full border border-paper/30 bg-paper/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper/90">
                {t.wPendingPill}
              </motion.span>
            ) : openReq?.status === 'paid_pending_confirm' ? (
              <motion.span key="pill-s" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="inline-block rounded-full border border-paper/30 bg-paper/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper/90">
                {t.wPaidPill}
              </motion.span>
            ) : withdrawable <= 0 ? (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="font-mono text-[11px] text-paper/50">{t.wNone}</motion.p>
            ) : enh === 'pending' ? (
              <motion.span key="enh-p" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="inline-block rounded-full border border-paper/30 bg-paper/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-paper/90">
                {t.wEnhPending}
              </motion.span>
            ) : enh !== 'verified' ? (
              <motion.div key="gate" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Link to="/enhanced-kyc"
                  className="press inline-block rounded-xl bg-paper px-4 py-2 font-display text-sm font-medium tracking-tight text-petrol transition hover:opacity-90">
                  {t.wEnhGate} →
                </Link>
              </motion.div>
            ) : (
              <motion.button key={`btn-${reqPhase}`} layout
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={requestPayout} disabled={reqPhase !== 'idle'}
                className={`press rounded-xl bg-paper font-display text-sm font-medium tracking-tight text-petrol transition hover:opacity-90 disabled:opacity-90 ${reqPhase === 'ok' ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
                {reqPhase === 'idle' ? `${t.wReq} · ${usd(withdrawable)}`
                  : reqPhase === 'busy' ? (
                    <span className="flex items-center gap-2">
                      <motion.span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-petrol/25 border-t-petrol"
                        animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} />
                      {t.wBusy}
                    </span>
                  ) : <CheckDraw size={26} className="text-verified" />}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      </Item>

      <Item>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: t.gLocked, v: sum(locked), cls: 'text-pending-text' },
          { label: t.gUnlocked, v: sum(unlocked), cls: 'text-petrol' },
          { label: t.gSettled, v: sum(settled), cls: 'text-verified-text' },
        ].map(x => (
          <Card key={x.label} className="p-4 text-center">
            <p className={`font-display text-xl font-medium tracking-tight ${x.cls}`}>
              <CountUp value={x.v} format={n => lt(n).replace(' LT Coins', '')} />
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{x.label} LT Coins</p>
          </Card>
        ))}
      </div>
      </Item>

      {/* 提现工单:空则整卡隐藏 */}
      {requests.length > 0 && (
        <Item>
        <Card className="mb-5 p-5">
          <div className="mb-2"><Eyebrow>{t.reqHead}</Eyebrow></div>
          <AnimatePresence initial={false}>
            {requests.map(r => (
              <motion.div key={r.id} layout
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="border-b border-hair py-3 last:border-b-0">
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
              </motion.div>
            ))}
          </AnimatePresence>
        </Card>
        </Item>
      )}

      {/* 注册奖励:纯状态 */}
      <Item>
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
      </Item>

      {/* 签到奖励:纯状态 */}
      {grants.length > 0 && (
        <Item>
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
        </Item>
      )}

      {/* 收款去向 */}
      <Item>
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
      </Item>

      {/* How LT works:默认折叠 */}
      <Item>
      <Card className="mb-5 p-5">
        <button type="button" onClick={() => setHowOpen(o => !o)} className="flex w-full items-center justify-between">
          <Eyebrow>{t.how}</Eyebrow>
          <motion.span animate={{ rotate: howOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }}
            className="text-faint" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5.5 L7 9.5 L11 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.span>
        </button>
        <Collapse open={howOpen}>
          <div className="mt-3 space-y-2.5">
            {t.steps.map(x => (
              <div key={x.k} className="flex gap-3">
                <span className={`w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider ${x.cls}`}>{x.k}</span>
                <p className="text-xs leading-relaxed text-muted">{x.d}</p>
              </div>
            ))}
            <p className="border-t border-hair pt-2.5 text-xs leading-relaxed text-faint">{t.ledgerNote}</p>
          </div>
        </Collapse>
      </Card>
      </Item>

      {unlocked.length > 0 && (
        <Item>
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
        </Item>
      )}

      <Item>
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
      </Item>
      </Stagger>
    </div>
  )
}
