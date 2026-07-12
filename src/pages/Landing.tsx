import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SUPPORT } from '../lib/support'
import { Rv } from '../lib/useReveal'
import TaskCardDemo from '../components/TaskCardDemo'

/** 公开落地页:FB/IG 冷流量首触点。
 *  设计语言:Dispatch 编辑部 × Apple 空间纪律 × Stripe 产品即插画 × Wise 诚实话术。
 *  纪律:一种强调色、两级字阶、零图库照片、动效 = 1 主秀 + 滚动显现 + 悬停。 */

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is this a job?',
    a: "No — you work as an independent contractor, task by task. There are no shifts, no quotas, and no obligation to accept any offer. Every task is a separate agreement with its scope and price written down before you say yes.",
  },
  {
    q: 'What exactly will I be doing?',
    a: "Structured tasks for vetted cross-border businesses, scoped by your account manager. Every offer shows the full picture — the steps, the acceptance criteria, and the exact USD amount — before you accept. If a task isn't for you, you simply decline it.",
  },
  {
    q: 'Why are stablecoins a payout option?',
    a: "The businesses on the other side operate internationally, and stablecoins settle across borders in minutes with near-zero fees. If that's not your thing, PayPal works too. You choose, you can keep several methods on file, and no task closes until you confirm the money actually arrived.",
  },
  {
    q: 'What if something goes wrong mid-task?',
    a: "You message your account manager directly — a named person on WhatsApp or Telegram, not a ticket queue. Tasks can be returned, fixed and resubmitted, and there's a formal review process when an account or task gets flagged. Nothing silently disappears.",
  },
  {
    q: 'Who sees my documents?',
    a: "Verification documents are encrypted and visible to platform administrators only — never to clients, never to other freelancers. Your SSN is restricted even further: admin-only, used solely to verify that you are you.",
  },
  {
    q: 'Does it cost anything to join?',
    a: "No. Not now, not later. We never ask you for money — no fees, no deposits, no 'starter kits'. If anyone claiming to represent LocalTask asks you to pay for anything, it is not us. Walk away and report it.",
  },
]

export default function Landing() {
  const { session, loading } = useAuth()
  if (!loading && session) return <Navigate to="/offers" replace />

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ============ 页头 ============ */}
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight">
            <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
            LocalTask
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-ink">
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-petrol px-4 py-2 text-sm font-medium text-paper transition hover:bg-petrol-hover"
            >
              Apply
            </Link>
          </nav>
        </div>
      </header>

      {/* ============ Hero:一屏一个念头 ============ */}
      <section className="mx-auto max-w-5xl px-5 pb-20 pt-16 sm:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-petrol">
              For US-based freelancers
            </Rv>
            <Rv as="h2" delay={70} className="mt-5 font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Task-based work,
              <br />
              done properly.
            </Rv>
            <Rv as="p" delay={140} className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              LocalTask matches US-based freelancers with structured tasks from vetted cross-border
              businesses. Every task is scoped upfront, priced in USD — and it only closes after
              <span className="text-ink"> you confirm the money arrived</span>.
            </Rv>
            <Rv delay={210} className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="rounded-xl bg-petrol px-6 py-3.5 font-display text-[15px] font-medium text-paper shadow-[0_10px_28px_rgba(36,75,77,0.28)] transition hover:-translate-y-px hover:bg-petrol-hover"
              >
                Apply now
              </Link>
              <Link
                to="/login"
                className="rounded-xl border border-hair px-6 py-3.5 font-display text-[15px] text-ink transition hover:-translate-y-px hover:border-petrol/40"
              >
                Sign in
              </Link>
            </Rv>
            <Rv as="p" delay={280} className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              No fees. No deposits. Ever.
            </Rv>
          </div>

          <Rv delay={160}>
            <TaskCardDemo />
          </Rv>
        </div>
      </section>

      {/* ============ 事实条 ============ */}
      <div className="border-y border-hair bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-5 py-4">
          {['Scoped upfront', 'Priced in USD', 'One manager per person', 'You confirm every payment'].map(f => (
            <p key={f} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              {f}
            </p>
          ))}
        </div>
      </div>

      {/* ============ 01 工作长什么样 ============ */}
      <section className="mx-auto max-w-5xl px-5 py-24">
        <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">01 — The work</Rv>
        <Rv as="h2" delay={60} className="mt-4 max-w-xl font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Discrete, structured tasks. Not gigs, not gambles.
        </Rv>
        <Rv as="p" delay={120} className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Each task arrives as an offer with a fixed scope, a fixed dollar amount and written
          acceptance criteria — all visible before you accept. No hour tracking, no bidding, no
          moving goalposts. You take a task, complete the steps, submit, get paid, confirm. Then the next one.
        </Rv>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ['Fixed scope', 'The acceptance criteria are written down before you start — you always know what “done” means.'],
            ['Fixed price', 'The exact USD amount is on the offer itself. Nothing is renegotiated after the work is in.'],
            ['One at a time', 'Steady, reviewable work. We optimize for quality and a long relationship — not volume.'],
          ].map(([h, b], i) => (
            <Rv key={h} delay={i * 80} className="rounded-2xl border border-hair bg-surface p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(30,29,25,0.08)]">
              <p className="font-display text-lg font-medium tracking-tight">{h}</p>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{b}</p>
            </Rv>
          ))}
        </div>
      </section>

      {/* ============ 02 流程四步 ============ */}
      <section className="border-y border-hair bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-24">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">02 — How it works</Rv>
          <Rv as="h2" delay={60} className="mt-4 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Four steps. The fourth is yours.
          </Rv>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {[
              ['01', 'Apply & verify', 'A short application and identity verification — about ten minutes. It keeps every person on the network real, which is exactly what keeps the pay real.'],
              ['02', 'Meet your manager', 'You are assigned a named account manager with a direct line on WhatsApp or Telegram. One person, accountable to you, from day one.'],
              ['03', 'Work the task', 'Offers come with full details. Accept the ones you want, complete the steps, submit for review. Your manager is one message away throughout.'],
              ['04', 'Confirm the pay', 'We send the payment and mark it. But the task only closes when you confirm the money actually arrived. That rule is absolute.'],
            ].map(([n, h, b], i) => (
              <Rv key={n} delay={i * 70} className="flex gap-5">
                <p className="font-mono text-sm font-bold text-petrol">{n}</p>
                <div>
                  <p className="font-display text-lg font-medium tracking-tight">{h}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
                </div>
              </Rv>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 03 钱,直说 ============ */}
      <section className="mx-auto max-w-5xl px-5 py-24">
        <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">03 — The money</Rv>
        <Rv as="h2" delay={60} className="mt-4 font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Money, in plain terms.
        </Rv>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {[
            ['Priced in USD', 'Every task shows an exact dollar amount before you accept. What you see is what the task pays.'],
            ['Paid your way', 'USDT (TRC20), USDC (ERC20) or PayPal. Keep several methods on file, switch your default between tasks.'],
            ['Closed by you', 'A task is not finished when we say we paid. It is finished when you confirm it arrived. Until then, it stays open — on our books, in your favor.'],
            ['Never pay us', 'We never ask you for money. No fees, no deposits, no equipment kits. Anyone who does is not us.'],
          ].map(([h, b], i) => (
            <Rv key={h} delay={i * 70} className="rounded-2xl border border-hair bg-surface p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">{h}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{b}</p>
            </Rv>
          ))}
        </div>
      </section>

      {/* ============ 04 为什么要验证你 ============ */}
      <section className="border-y border-hair bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-24">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">04 — Verification</Rv>
              <Rv as="h2" delay={60} className="mt-4 font-display text-3xl font-medium tracking-tight sm:text-4xl">
                Why we verify you — and why that protects you first.
              </Rv>
              <Rv as="p" delay={120} className="mt-5 text-[15px] leading-relaxed text-muted">
                Every member of this network — freelancer and business alike — passes identity
                verification. It is the single reason the tasks are real, the counterparties are
                real, and the payments are real. A network where nobody is verified is a network
                where you can't trust anyone. Ours is the opposite, on purpose.
              </Rv>
            </div>
            <Rv delay={160} className="self-center rounded-2xl border border-hair bg-paper p-6">
              {[
                ['What we ask for', 'Government ID, proof of address, a selfie with your ID.'],
                ['Your SSN', 'Encrypted at rest. Visible to administrators only. Used for one thing: confirming you are you.'],
                ['Your documents', 'Never shared with clients. Never shared with other freelancers. Never sold.'],
                ['Eligibility', '18 or older, US-based.'],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-hair py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{k}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{v}</p>
                </div>
              ))}
            </Rv>
          </div>
        </div>
      </section>

      {/* ============ 05 账户经理 ============ */}
      <section className="mx-auto max-w-5xl px-5 py-24">
        <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">05 — Your manager</Rv>
        <Rv as="h2" delay={60} className="mt-4 max-w-xl font-display text-3xl font-medium tracking-tight sm:text-4xl">
          A person, not a portal.
        </Rv>
        <Rv as="p" delay={120} className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          From day one you have a named account manager — a real person you can message on
          WhatsApp or Telegram. They scope your tasks, answer the awkward questions, untangle
          anything that goes sideways, and stay with you for the long run. Platforms hide behind
          ticket queues; we put a name on the line.
        </Rv>
      </section>

      {/* ============ FAQ ============ */}
      <section className="border-t border-hair bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-24">
          <Rv as="p" className="text-center font-mono text-[11px] uppercase tracking-[0.28em] text-faint">
            Straight answers
          </Rv>
          <Rv as="h2" delay={60} className="mt-4 text-center font-display text-3xl font-medium tracking-tight sm:text-4xl">
            The questions you should be asking.
          </Rv>
          <div className="mt-12">
            {FAQ.map((f, i) => (
              <Rv key={f.q} delay={i * 50} className="border-b border-hair py-6 first:border-t">
                <p className="font-display text-[17px] font-medium tracking-tight">{f.q}</p>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{f.a}</p>
              </Rv>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 尾部 CTA ============ */}
      <section className="mx-auto max-w-5xl px-5 py-24 text-center">
        <Rv as="h2" className="font-display text-3xl font-medium tracking-tight sm:text-5xl">
          Read the rules. Then decide.
        </Rv>
        <Rv as="p" delay={70} className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-muted">
          Everything above is exactly how the platform works — no more, no less. If that sounds
          like your kind of arrangement, applying takes about ten minutes.
        </Rv>
        <Rv delay={140} className="mt-8">
          <Link
            to="/signup"
            className="inline-block rounded-xl bg-petrol px-8 py-4 font-display text-[15px] font-medium text-paper shadow-[0_10px_28px_rgba(36,75,77,0.28)] transition hover:-translate-y-px hover:bg-petrol-hover"
          >
            Apply now
          </Link>
        </Rv>
      </section>

      {/* ============ 页脚 ============ */}
      <footer className="border-t border-hair">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2 font-display text-sm font-medium tracking-tight">
              <img src="/logo.svg" alt="" className="h-5 w-5 rounded" />
              LocalTask
            </p>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              <Link to="/terms" className="transition hover:text-ink">Terms</Link>
              <Link to="/privacy" className="transition hover:text-ink">Privacy</Link>
              <a
                href={`https://t.me/${SUPPORT.telegram}`}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-ink"
              >
                Support · Telegram
              </a>
            </nav>
          </div>
          <p className="mt-6 font-mono text-[11px] leading-relaxed text-faint">
            Questions before applying? Message us — a person answers.
            <br />© 2026 LocalTask · Operated by Local Group
          </p>
        </div>
      </footer>
    </div>
  )
}
