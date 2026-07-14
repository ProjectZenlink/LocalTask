import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { Task, TaskOffer } from '../types/database'
import { usd, lt, dateShort, timeLeft } from '../lib/format'
import { PageHeading, Card, Button, Alert, Eyebrow } from '../components/ui'
import KycBanner from '../components/KycBanner'
import { useI18n } from '../lib/i18n'

type OfferRow = TaskOffer & { task: Task | null }

const COPY = {
  en: {
    loading: 'Loading…', title: 'Offers',
    sub: 'Tasks your account manager has offered you. Accepting is a commitment — declining is always free.',
    suspended: "Your account is paused and won't receive new offers. Contact your account manager.",
    notOpen: "You're currently not open to work, so new offers are off.", notOpenLink: 'Turn it on in your profile',
    noPayout: 'Set your payout method (crypto wallet or PayPal) to accept offers.', noPayoutLink: 'Add it in your profile',
    empty: 'No pending offers right now.',
    emptyHint: 'Your account manager will ping you on WhatsApp or Telegram when a task matches you.',
    due: 'due', expired: 'Expired', view: 'View details', decline: 'Decline', accept: 'Accept task', working: 'Working…',
    how: 'How offers work', step: (n: string) => `Step ${n}`,
    steps: [
      { n: '1', h: 'An offer lands here', d: 'Your account manager matches a task to your profile and sends it with a clear scope, payout and deadline. You’ll usually get a heads-up on WhatsApp or Telegram too.' },
      { n: '2', h: 'You decide — freely', d: 'Read the acceptance criteria first. Declining is always free and never counts against you; unanswered offers simply expire back to the pool.' },
      { n: '3', h: 'Accept = commitment', d: 'On accept, the task moves to your Tasks tab and its LT lock into your Wallet (1 LT = $1). Your payout details are snapshotted at this moment for your protection.' },
      { n: '4', h: 'Deliver → get paid', d: 'Submit proof, your manager reviews it, the client pays your wallet or PayPal directly, and you confirm the money arrived. Only you can close the loop.' },
    ],
    safeHead: 'Why this is safe',
    safe: [
      ['Payment goes straight to you.', 'Clients pay your own wallet or PayPal — LocalTask never holds or routes your money.'],
      ['Snapshot protection.', 'The payout details on file when you accept are the ones attached to the task, in writing, until it closes.'],
      ['You confirm receipt.', 'A task only completes after you press “I received the money” — nobody can mark it done for you.'],
    ],
    faq: [
      { q: 'What if I miss the expiry window?', a: 'Nothing bad happens. The offer expires, the task returns to the pool, and your standing is untouched.' },
      { q: 'Can I negotiate the amount?', a: 'Message your account manager before accepting — amounts are fixed once a task is accepted.' },
      { q: 'What happens if my work is rejected?', a: 'You get the reviewer’s notes and can resubmit a new version. LT stay locked until a version is approved.' },
    ],
  },
  zh: {
    loading: '加载中…', title: '任务邀约',
    sub: '账户经理发给你的任务。接受即承诺，拒绝永远免费。',
    suspended: '你的账号已暂停，不会收到新邀约。请联系你的账户经理。',
    notOpen: '你目前是「暂不接单」状态，新邀约已关闭。', notOpenLink: '去资料页打开',
    noPayout: '先设置收款方式（加密钱包或 PayPal）才能接受邀约。', noPayoutLink: '去资料页添加',
    empty: '暂时没有待处理的邀约。',
    emptyHint: '有匹配的任务时，账户经理会在 WhatsApp/Telegram 提醒你。',
    due: '截止', expired: '已过期', view: '查看详情', decline: '拒绝', accept: '接受任务', working: '处理中…',
    how: '邀约是怎么运作的', step: (n: string) => `第 ${n} 步`,
    steps: [
      { n: '1', h: '邀约到这里', d: '账户经理按你的资料匹配任务，附上清晰的范围、报酬和截止时间发给你，通常也会在 WhatsApp/Telegram 提前打个招呼。' },
      { n: '2', h: '你自由决定', d: '先读验收标准。拒绝永远免费、不影响任何记录；不回应的邀约到期后自动回池。' },
      { n: '3', h: '接受 = 承诺', d: '接受后任务进入「我的任务」，对应 LT 锁进钱包（1 LT = 1 美元）。此刻你的收款信息会被快照存档，保护你。' },
      { n: '4', h: '交付 → 收钱', d: '提交凭证，经理审核，客户直接付到你的钱包或 PayPal，你确认到账。只有你能关闭这个闭环。' },
    ],
    safeHead: '为什么安全',
    safe: [
      ['钱直接到你手上。', '客户付到你自己的钱包或 PayPal，LocalTask 从不经手、不代收。'],
      ['快照保护。', '接受时存档的收款信息会一直跟着这个任务，白纸黑字，直到关闭。'],
      ['你来确认收款。', '任务只有在你点「我收到钱了」之后才算完成，没人能替你标记。'],
    ],
    faq: [
      { q: '错过有效期会怎样？', a: '没有任何影响。邀约过期、任务回池，你的记录不受影响。' },
      { q: '金额能谈吗？', a: '接受前找账户经理谈；任务一旦接受，金额即锁定。' },
      { q: '提交被驳回怎么办？', a: '你会看到审核意见，可以修改后重新提交。LT 保持锁定，直到某个版本通过。' },
    ],
  },
}

export default function Offers() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { lang } = useI18n()
  const t = COPY[lang]
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error: e } = await supabase
      .from('task_offers')
      .select('*, task:tasks(*)')
      .eq('freelancer_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (e) { setError(e.message); setLoaded(true); return }
    setOffers((data ?? []) as OfferRow[])
    setLoaded(true)
  }, [user])

  useEffect(() => { void load() }, [load])

  async function respond(offerId: string, accept: boolean) {
    setError(null)
    setBusyId(offerId)
    const { error: e } = await supabase.rpc('respond_to_offer', { p_offer_id: offerId, p_accept: accept })
    setBusyId(null)
    if (e) { setError(e.message); await load(); return }
    await load()
  }

  if (!loaded) return <div className="text-muted">{t.loading}</div>

  const verified = profile?.kyc_status === 'verified'
  const payoutReady = profile?.payout_method === 'paypal'
    ? !!profile?.payout_paypal_email
    : !!profile?.payout_address

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeading sub={t.sub}>{t.title}</PageHeading>

      <KycBanner />
      {verified && profile?.is_suspended && (
        <Alert tone="warning">{t.suspended}</Alert>
      )}
      {verified && !profile?.is_suspended && !profile?.open_to_work && (
        <Alert tone="info">
          {t.notOpen}{' '}
          <Link to="/me" className="underline underline-offset-2">{t.notOpenLink}</Link>
        </Alert>
      )}
      {verified && !profile?.is_suspended && !payoutReady && (
        <Alert tone="warning">
          {t.noPayout}{' '}
          <Link to="/me" className="underline underline-offset-2">{t.noPayoutLink}</Link>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {offers.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">{t.empty}</p>
          <p className="mt-1 text-xs text-faint">{t.emptyHint}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {offers.map(o => {
            const tk = o.task
            if (!tk) return null
            const left = timeLeft(o.expires_at)
            return (
              <Card key={o.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/tasks/${tk.id}`} className="block truncate font-display text-base font-medium text-ink hover:text-petrol">
                      {tk.title}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-faint">
                      {usd(tk.amount)} · +{lt(tk.amount)}
                      {tk.deadline && <> · {t.due} {dateShort(tk.deadline)}</>}
                    </p>
                  </div>
                  <span className={`shrink-0 font-mono text-[11px] uppercase tracking-wider ${left ? 'text-pending-text' : 'text-danger-text'}`}>
                    {left ?? t.expired}
                  </span>
                </div>

                {o.note && <p className="mt-3 text-sm leading-relaxed text-muted">{o.note}</p>}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/tasks/${tk.id}`} className="sm:mr-auto">
                    <Button variant="ghost" className="w-full sm:w-auto">{t.view}</Button>
                  </Link>
                  {left && (
                    <>
                      <Button variant="ghost" disabled={busyId === o.id} onClick={() => respond(o.id, false)} className="w-full sm:w-auto">
                        {t.decline}
                      </Button>
                      <Button disabled={busyId === o.id || !payoutReady} onClick={() => respond(o.id, true)} className="w-full sm:w-auto">
                        {busyId === o.id ? t.working : t.accept}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-10">
        <Eyebrow>{t.how}</Eyebrow>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {t.steps.map(x => (
            <Card key={x.n} className="p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">{t.step(x.n)}</p>
              <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink">{x.h}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{x.d}</p>
            </Card>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-petrol/20 bg-petrol/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-petrol">{t.safeHead}</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            {t.safe.map(([h, d]) => (
              <li key={h}>· <span className="text-ink">{h}</span> {d}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          {t.faq.map(f => (
            <details key={f.q} className="group border-b border-hair py-3 last:border-b-0">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink transition group-open:text-petrol">{f.q}</summary>
              <p className="mt-2 text-xs leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
