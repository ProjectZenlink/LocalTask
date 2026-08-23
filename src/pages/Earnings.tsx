import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, BonusGrant, PayoutRequest } from '../types/database'
import { payoutLabel } from '../types/database'
import { lt, usd, dateShort, shortHash, bjDay } from '../lib/format'
import { PageHeading, Card, Eyebrow, Button, Alert } from '../components/ui'
import { friendly } from '../lib/errors'

const COPY = {
  en: {
    loading: 'Loading…', title: 'Wallet',
    sub: 'Bundle everything into one payout request.',
    ciTitle: 'Daily check-in', ciBtn: 'Check in', ciDone: (n: number) => `Confirmed ✓ · ${n} day streak`,
    ciPending: (n: number) => `Checked in · pending AM review · ${n} day streak`,
    ciNext: (have: number, need: number, amt: string) => `${have}/${need} days to unlock ${amt}`,
    ciAll: 'All streak rewards unlocked 🎉',
    availHead: 'Withdrawable', availEmpty: 'Finish tasks & keep your streak.',
    itTask: 'Task', itGrant: 'Streak reward', itSignup: 'Signup bonus',
    gk7: '7-day streak', gk15: '15-day streak', gk30: '30-day streak',
    bonusGate: 'Signup bonus unlocks after Enhanced KYC →', bonusPendingKyc: 'Signup bonus · Enhanced KYC under review',
    reqBtn: 'Request payout', reqBusy: 'Packing…',
    openHead: 'Payout in progress',
    stPending: 'Waiting for your AM to send it', stPaid: 'Paid', stDone: 'Confirmed', stRejected: 'Rejected',
    txLabel: 'tx', reasonLabel: 'Reason',
    histHead: 'Payout history', histEmpty: 'No payouts yet. Bundled requests land here.',
    payTo: 'Payments go to', crypto: 'Crypto wallet',
    noPayout: "No payout method yet — set one up before requesting.", edit: 'Edit',
    how: 'How LT Coins work',
    steps: [
      { k: 'Lock', cls: 'text-pending-text', d: 'Get assigned a task → its LT Coins lock into your balance. That’s the platform’s written record of what you’re owed.' },
      { k: 'Unlock', cls: 'text-petrol', d: 'Work approved → LT Coins unlock and join your withdrawable balance with your rewards.' },
      { k: 'Settle', cls: 'text-verified-text', d: 'You request a payout, your AM sends it to your wallet or PayPal, and those LT Coins settle. Settled = cash that reached you.' },
    ],
    ledgerNote: 'LT Coins are a display ledger, not a token or an in-app balance. LocalTask never holds your funds — payouts go straight to your own wallet or PayPal.',
  },
  }

function useCountUp(target: number) {
  const [val, setVal] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVal(target); prev.current = target; return }
    const from = prev.current
    prev.current = target
    if (from === target) { setVal(target); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 600)
      const e = 1 - Math.pow(1 - p, 3)
      setVal(from + (target - from) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return val
}

const GRANT_LABEL: Record<string, 'gk7' | 'gk15' | 'gk30'> = { streak_7: 'gk7', streak_15: 'gk15', streak_30: 'gk30' }
const STREAK_TIERS = [{ need: 7, amt: 1.99 }, { need: 15, amt: 4.99 }, { need: 30, amt: 12.99 }]

/** Wallet(v49 合流):统一钱包——任务+签到奖励+注册奖励打包成提现工单;方案甲:确认到账纯可选。 */
export default function Wallet() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const t = COPY.en

  const [tasks, setTasks] = useState<Task[]>([])
  const [grants, setGrants] = useState<BonusGrant[]>([])
  const [requests, setRequests] = useState<PayoutRequest[]>([])
  const [days, setDays] = useState<{ day: string; confirmed_at: string | null }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ciBusy, setCiBusy] = useState(false)
  const [reqBusy, setReqBusy] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [ciJust, setCiJust] = useState(false)

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

  // 北京时间日界线;连续天数按"AM 已复核"口径
  const bjToday = bjDay()
  const confirmedSet = new Set(days.filter(x => x.confirmed_at).map(x => x.day))
  const todayRow = days.find(x => x.day === bjToday)
  const checkedToday = !!todayRow
  const confirmedToday = !!todayRow?.confirmed_at
  let streak = 0
  {
    const anchor = confirmedSet.has(bjToday) ? bjToday : bjDay(-1)
    let d = anchor
    let off = confirmedSet.has(bjToday) ? 0 : -1
    while (confirmedSet.has(d)) { streak += 1; off -= 1; d = bjDay(off + 1) }
  }
  const nextTier = STREAK_TIERS.find(x => streak < x.need)

  async function doCheckin() {
    if (ciBusy) return
    setCiBusy(true); setErr(null)
    const { error: e } = await supabase.rpc('do_checkin')
    setCiBusy(false)
    if (e) { setErr(friendly(e)); return }
    setCiJust(true)
    setTimeout(() => setCiJust(false), 1400)
    await loadAll()
  }

  // 可提现集合(与 request_wallet_payout 同口径)
  const inFlightRefs = new Set<string>()
  for (const r of requests) if (r.status !== 'rejected') {
    for (const it of r.items) inFlightRefs.add(`${it.kind}:${it.ref}`)
  }
  const availTasks = tasks.filter(x => x.status === 'pending_payment' && !inFlightRefs.has(`task:${x.id}`))
  const availGrants = grants.filter(g => g.state === 'locked')
  const enhancedOk = profile?.enhanced_kyc_status === 'verified'
  const bonusAvail = profile?.signup_bonus_state === 'locked' && enhancedOk
  const bonusPendingKyc = profile?.signup_bonus_state === 'locked' && profile?.enhanced_kyc_status === 'pending'
  const bonusGate = profile?.signup_bonus_state === 'locked' && !enhancedOk && !bonusPendingKyc
  const availTotal = availTasks.reduce((s, x) => s + Number(x.amount), 0)
    + availGrants.reduce((s, g) => s + Number(g.amount), 0)
    + (bonusAvail ? 2.99 : 0)
  const animTotal = useCountUp(availTotal)
  const openReqs = requests.filter(r => r.status === 'pending' || r.status === 'paid_pending_confirm')
  const histReqs = requests.filter(r => r.status === 'completed' || r.status === 'rejected')

  async function requestPayout() {
    if (reqBusy) return
    setReqBusy(true); setErr(null)
    const { error: e } = await supabase.rpc('request_wallet_payout')
    setReqBusy(false)
    if (e) {
      setErr(friendly(e))
      await loadAll()  // v85.1:出错也刷新 —— 旧快照当场校正,金额与真相对齐
      return
    }
    await loadAll()
  }


  const itemLabel = (it: { kind: string; label: string }) =>
    it.kind === 'grant' ? (t[GRANT_LABEL[it.label] ?? 'gk7']) : it.kind === 'signup' ? t.itSignup : it.label

  const statusChip = (s: PayoutRequest['status']) => {
    const map = {
      pending: ['border-pending-border bg-pending-bg text-pending-text', t.stPending],
      paid_pending_confirm: ['border-petrol/30 bg-petrol/10 text-petrol', t.stPaid],
      completed: ['border-verified-border bg-verified-bg text-verified-text', t.stDone],
      rejected: ['border-danger-border bg-danger-bg text-danger-text', t.stRejected],
    } as const
    const [cls, label] = map[s]
    return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{label}</span>
  }

  if (!loaded) return <p className="text-muted">{t.loading}</p>
  const payText = !profile ? null
    : profile.payout_method === 'paypal' && profile.payout_paypal_email
      ? `PayPal · ${profile.payout_paypal_email}`
      : profile.payout_network && profile.payout_token && profile.payout_address
        ? `${payoutLabel(profile.payout_network, profile.payout_token)} · ${shortHash(profile.payout_address)}`
        : null

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {err && <Alert tone="error">{err}</Alert>}

      {/* 可提现 · Hero 余额卡(v52) */}
      <div className="relative mb-5 overflow-hidden rounded-2xl bg-petrol text-paper shadow-[0_16px_40px_rgba(36,75,77,0.28)]">
        <span className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full border border-paper/10" />
        <span className="pointer-events-none absolute -right-2 -top-24 h-40 w-40 rounded-full border border-paper/[0.07]" />
        <div className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/75">{t.availHead}</p>
          <p className="mt-2.5 font-mono text-4xl tracking-tight">{usd(animTotal)}</p>
          <p className="mt-1 font-mono text-[11px] text-paper/75">{lt(availTotal)}</p>
          {availTasks.length === 0 && availGrants.length === 0 && !bonusAvail && !bonusGate && !bonusPendingKyc ? (
            <p className="mt-3.5 text-sm text-paper/75">{t.availEmpty}</p>
          ) : (
            <div className="mt-4 space-y-1.5 border-t border-paper/15 pt-3.5">
              {availTasks.map(x => (
                <p key={x.id} className="flex items-baseline justify-between gap-3 font-mono text-xs text-paper/75">
                  <span className="truncate">{t.itTask} · {x.title}</span><span className="shrink-0 text-paper">{usd(Number(x.amount))}</span>
                </p>
              ))}
              {availGrants.map(g => (
                <p key={g.id} className="flex items-baseline justify-between gap-3 font-mono text-xs text-paper/75">
                  <span>{t.itGrant} · {t[GRANT_LABEL[g.kind] ?? 'gk7']}</span><span className="text-paper">{usd(Number(g.amount))}</span>
                </p>
              ))}
              {bonusAvail && (
                <p className="flex items-baseline justify-between gap-3 font-mono text-xs text-paper/75">
                  <span>{t.itSignup}</span><span className="text-paper">{usd(2.99)}</span>
                </p>
              )}
              {bonusPendingKyc && <p className="font-mono text-xs text-paper/75">{t.bonusPendingKyc}</p>}
              {bonusGate && <Link to="/enhanced-kyc" className="block font-mono text-xs text-paper/85 underline decoration-paper/40 underline-offset-2 transition hover:text-paper">{t.bonusGate}</Link>}
            </div>
          )}
        </div>
        {availTotal > 0 && (
          <button disabled={reqBusy} onClick={() => void requestPayout()}
            className="block w-full border-t border-paper/15 bg-paper py-3 font-display text-sm font-medium text-petrol transition hover:bg-white disabled:opacity-60">
            {reqBusy ? t.reqBusy : t.reqBtn}
          </button>
        )}
      </div>

      {/* 签到 · 细条(v52) */}
      <Card className="mb-5 flex items-center justify-between gap-3 px-5 py-3">
        <p className="min-w-0 truncate text-sm text-ink">
          <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-faint">{t.ciTitle}</span>
          {confirmedToday ? t.ciDone(streak) : checkedToday ? t.ciPending(streak) : nextTier ? t.ciNext(streak, nextTier.need, usd(nextTier.amt)) : t.ciAll}
        </p>
        {ciJust ? (
          <span className="ms-rise flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-petrol text-paper">
            <svg viewBox="0 0 14 14" className="h-4 w-4"><path d="M3 7.4 L6 10.4 L11.2 4.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        ) : !checkedToday && (
          <Button className="shrink-0 px-3.5 py-1.5 text-xs" disabled={ciBusy} onClick={() => void doCheckin()}>{ciBusy ? '…' : t.ciBtn}</Button>
        )}
      </Card>

      {/* 进行中的提现 */}
      {openReqs.length > 0 && (
        <Card className="mb-5 p-5">
          <Eyebrow>{t.openHead}</Eyebrow>
          <div className="mt-3 space-y-4">
            {openReqs.map(r => (
              <div key={r.id} className="rounded-xl border border-hair bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-ink">{usd(Number(r.total))}</span>
                  {statusChip(r.status)}
                </div>
                <div className="mt-2 space-y-1">
                  {r.items.map((it, i) => (
                    <p key={i} className="flex items-baseline justify-between font-mono text-[11px] text-muted">
                      <span className="truncate">{itemLabel(it)}</span><span className="shrink-0">{usd(Number(it.amount))}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-2 font-mono text-[10px] text-faint">{dateShort(r.created_at)}{r.tx_ref && <> · {t.txLabel} <span className="text-ink">{shortHash(r.tx_ref)}</span></>}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 收款去向 */}
      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>{t.payTo}</Eyebrow>
          <Link to="/me" className="font-mono text-[11px] uppercase tracking-wider text-petrol hover:text-petrol-hover">{t.edit}</Link>
        </div>
        <p className="mt-2 font-mono text-xs text-ink">
          {payText ?? <span className="text-pending-text">{t.noPayout}</span>}
        </p>
      </Card>

      {/* 提现记录 */}
      <Card className="mb-5 p-5">
        <Eyebrow>{t.histHead}</Eyebrow>
        {histReqs.length === 0 ? (
          <p className="mt-3 text-sm text-faint">{t.histEmpty}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {histReqs.map(r => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hair pb-2 last:border-b-0 last:pb-0">
                <span className="font-mono text-xs text-muted">{dateShort(r.created_at)} · {usd(Number(r.total))}
                  {r.reject_reason && <span className="ml-2 text-danger-text">{t.reasonLabel}: {r.reject_reason}</span>}
                </span>
                {statusChip(r.status)}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* LT 说明:默认折叠(v50) */}
      <Card className="p-5">
        <button className="flex w-full items-center justify-between" onClick={() => setHowOpen(v => !v)}>
          <Eyebrow>{t.how}</Eyebrow>
          <svg viewBox="0 0 12 12" className={`h-3 w-3 text-faint transition-transform duration-300 ${howOpen ? 'rotate-180' : ''}`}>
            <path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`fold-wrap ${howOpen ? 'open' : ''}`}><div className="fold-inner">
        <div className="mt-3 space-y-2.5">
          {t.steps.map(s => (
            <p key={s.k} className="text-xs leading-relaxed text-muted">
              <span className={`mr-2 font-mono text-[10px] uppercase tracking-wider ${s.cls}`}>{s.k}</span>{s.d}
            </p>
          ))}
        </div>
        <p className="mt-3 border-t border-hair pt-3 text-[11px] leading-relaxed text-faint">{t.ledgerNote}</p>
        </div></div>
      </Card>
    </div>
  )
}
