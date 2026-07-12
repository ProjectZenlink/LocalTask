import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Plus, Minus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { SUPPORT } from '../lib/support'
import { Rv } from '../lib/useReveal'
import TaskCardDemo from '../components/TaskCardDemo'
import SupportDock from '../components/SupportDock'

/** 公开落地页 v3:独立渲染(不进应用外壳)。
 *  每屏一个念头;动效预算 = 任务卡主秀 + 流程时间轴 + 滚动显现/悬停。 */

const FAQ: { q: string; a: string }[] = [
  { q: 'Is this a job?', a: 'No — independent contractor, task by task. No shifts, no quotas. Decline anything you don\'t like.' },
  { q: 'What exactly will I be doing?', a: 'Structured tasks scoped by your manager. Every offer shows the steps, the criteria and the amount — before you accept.' },
  { q: 'Why are stablecoins a payout option?', a: 'Cross-border businesses settle fastest with stablecoins. Prefer PayPal? Also fine. Your choice, always.' },
  { q: 'What if something goes wrong mid-task?', a: 'Message your manager directly — a named person, not a ticket queue. Tasks can be returned, fixed and resubmitted.' },
  { q: 'Who sees my documents?', a: 'Platform admins only, encrypted — never clients, never other freelancers.' },
  { q: 'Does it cost anything?', a: 'Never. No fees, no deposits, no kits. Anyone asking you for money is not us.' },
]

function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="mt-10">
      {FAQ.map((f, i) => (
        <Rv key={f.q} delay={i * 40} className="border-b border-hair first:border-t">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 py-5 text-left"
          >
            <span className="font-display text-[16px] font-medium tracking-tight">{f.q}</span>
            <span className="shrink-0 text-faint">
              {open === i ? <Minus size={16} strokeWidth={1.75} /> : <Plus size={16} strokeWidth={1.75} />}
            </span>
          </button>
          {open === i && <p className="ld-fade -mt-1 pb-5 pr-8 text-sm leading-relaxed text-muted">{f.a}</p>}
        </Rv>
      ))}
    </div>
  )
}

/** 流程时间轴:进度线自动推进 01→04 循环,点击任一步聚焦。 */
const STEPS4: [string, string, string][] = [
  ['01', 'Apply & verify', 'Ten minutes. It keeps everyone here real.'],
  ['02', 'Meet your manager', 'A named person on WhatsApp or Telegram, day one.'],
  ['03', 'Work the task', 'Accept what you like, follow the steps, submit.'],
  ['04', 'Confirm the pay', 'We pay. You confirm. Only then does it close.'],
]

function Steps() {
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [act, setAct] = useState(reduced ? 3 : 0)

  useEffect(() => {
    if (reduced) return
    const id = setTimeout(() => setAct(a => (a + 1) % 4), 2600)
    return () => clearTimeout(id)
  }, [act, reduced])

  return (
    <div className="relative mt-14">
      <div className="absolute left-0 right-0 top-[15px] hidden h-px bg-hair md:block" />
      <div
        className="absolute left-0 top-[15px] hidden h-px bg-petrol md:block"
        style={{ width: `${(act / 3) * 100}%`, transition: 'width .7s var(--ease-ld)' }}
      />
      <div className="grid gap-9 md:grid-cols-4 md:gap-6">
        {STEPS4.map(([n, h, b], i) => (
          <button key={n} type="button" onClick={() => setAct(i)} className="relative text-left">
            <p className={`relative inline-block bg-surface pr-3 font-mono text-2xl font-bold transition-colors duration-500 ${i <= act ? 'text-petrol' : 'text-faint'}`}>
              {n}
            </p>
            <p className={`mt-2.5 font-display text-[17px] font-medium tracking-tight transition-colors duration-500 ${i === act ? 'text-ink' : 'text-muted'}`}>
              {h}
            </p>
            <p className={`mt-1.5 text-sm leading-relaxed text-muted transition-opacity duration-500 ${i === act ? 'opacity-100' : 'opacity-45'}`}>
              {b}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

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
          <Link to="/login" className="rounded-lg border border-hair px-4 py-2 text-sm text-ink transition hover:border-petrol/40">
            Sign in
          </Link>
        </div>
      </header>

      {/* ============ Hero ============ */}
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-petrol">
              For US-based freelancers
            </Rv>
            <Rv as="h2" delay={70} className="mt-4 font-display text-[2.3rem] font-medium leading-[1.06] tracking-tight sm:text-5xl">
              Task-based work,
              <br />
              done properly.
            </Rv>
            <Rv as="p" delay={140} className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
              Structured tasks from vetted cross-border businesses. Priced in USD — closed only
              after <span className="text-ink">you confirm the money arrived</span>.
            </Rv>
            <Rv delay={210} className="mt-7">
              <Link
                to="/signup"
                className="inline-block rounded-xl bg-petrol px-7 py-3.5 font-display text-[15px] font-medium text-paper shadow-[0_10px_28px_rgba(36,75,77,0.28)] transition hover:-translate-y-px hover:bg-petrol-hover"
              >
                Apply now
              </Link>
            </Rv>
            <Rv as="p" delay={280} className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              No fees. No deposits. Ever.
            </Rv>
          </div>

          <Rv delay={160}>
            <TaskCardDemo />
          </Rv>
        </div>
      </section>

      {/* ============ 01 工作长什么样 ============ */}
      <section className="border-t border-hair">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">01 — The work</Rv>
          <Rv as="h2" delay={60} className="mt-4 max-w-xl font-display text-3xl font-medium tracking-tight">
            Discrete, structured tasks.
          </Rv>
          <Rv as="p" delay={120} className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
            Every offer shows the steps, the criteria and the exact amount — before you accept.
            Work it, submit it, get paid, confirm. Next.
          </Rv>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['Fixed scope', 'You always know what “done” means.'],
              ['Fixed price', 'The amount is on the offer. It doesn\'t move.'],
              ['One at a time', 'Steady, reviewable work — built for the long run.'],
            ].map(([h, b], i) => (
              <Rv key={h} delay={i * 80} className="rounded-2xl border border-hair bg-surface p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(30,29,25,0.08)]">
                <p className="font-display text-lg font-medium tracking-tight">{h}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
              </Rv>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 02 流程:活的时间轴 ============ */}
      <section className="border-y border-hair bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">02 — How it works</Rv>
          <Rv as="h2" delay={60} className="mt-4 font-display text-3xl font-medium tracking-tight">
            Four steps. The fourth is yours.
          </Rv>
          <Rv delay={120}>
            <Steps />
          </Rv>
        </div>
      </section>

      {/* ============ 03 钱:一块墨绿面板 ============ */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">03 — The money</Rv>
        <Rv as="h2" delay={60} className="mt-4 font-display text-3xl font-medium tracking-tight">
          Paid ≠ done. <span className="text-petrol">Done = you confirmed.</span>
        </Rv>
        <Rv delay={140} className="mt-10 rounded-3xl bg-petrol p-8 shadow-[0_20px_56px_rgba(36,75,77,0.32)] sm:p-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">Priced in USD</p>
              <p className="mt-2 text-sm leading-relaxed text-paper">The exact amount is on every offer.</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">Paid your way</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['USDT', 'USDC', 'PayPal'].map(m => (
                  <span key={m} className="rounded-full border border-paper/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-paper">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">Closed by you</p>
              <p className="mt-2 text-sm leading-relaxed text-paper">Nothing closes until you confirm it arrived.</p>
            </div>
          </div>
          <div className="mt-8 border-t border-paper/20 pt-6">
            <p className="font-display text-lg font-medium tracking-tight text-paper">
              We never ask you for money. <span className="text-paper/70">No fees, no deposits, no kits — anyone who asks is not us.</span>
            </p>
          </div>
        </Rv>
      </section>

      {/* ============ 04 验证:一句话 + 徽章 ============ */}
      <section className="border-y border-hair bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">04 — Verification</Rv>
          <Rv as="h2" delay={60} className="mt-4 max-w-xl font-display text-3xl font-medium tracking-tight">
            Verified, properly.
          </Rv>
          <Rv as="p" delay={120} className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
            Everyone here — freelancer and business — is identity-verified. That's why the tasks
            are real and the pay is real.
          </Rv>
          <Rv delay={180} className="mt-8 flex flex-wrap gap-2">
            {['Encrypted documents', 'Valid government ID', 'SSN identity check', '18+ · US-based'].map(c => (
              <span key={c} className="rounded-full border border-hair bg-paper px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                {c}
              </span>
            ))}
          </Rv>
        </div>
      </section>

      {/* ============ 05 账户经理 ============ */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">05 — Your manager</Rv>
        <Rv as="h2" delay={60} className="mt-4 max-w-xl font-display text-3xl font-medium tracking-tight">
          A person, not a portal.
        </Rv>
        <Rv as="p" delay={120} className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
          From day one you have a named account manager on WhatsApp or Telegram. They scope your
          tasks, answer the awkward questions, and stay for the long run.
        </Rv>
      </section>

      {/* ============ FAQ ============ */}
      <section className="border-t border-hair bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <Rv as="p" className="text-center font-mono text-[11px] uppercase tracking-[0.28em] text-faint">
            Straight answers
          </Rv>
          <Rv as="h2" delay={60} className="mt-4 text-center font-display text-3xl font-medium tracking-tight">
            The questions you should be asking.
          </Rv>
          <FaqList />
        </div>
      </section>

      {/* ============ 尾部 CTA ============ */}
      <section className="mx-auto max-w-5xl px-5 py-20 text-center">
        <Rv as="h2" className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Read the rules. Then decide.
        </Rv>
        <Rv as="p" delay={70} className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted">
          Applying takes about ten minutes.
        </Rv>
        <Rv delay={140} className="mt-7">
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
              {SUPPORT.whatsapp && (
                <a href={`https://wa.me/${SUPPORT.whatsapp}`} target="_blank" rel="noreferrer" className="transition hover:text-ink">
                  WhatsApp
                </a>
              )}
              <a href={`https://t.me/${SUPPORT.telegram}`} target="_blank" rel="noreferrer" className="transition hover:text-ink">
                Telegram
              </a>
            </nav>
          </div>
          <p className="mt-6 font-mono text-[11px] leading-relaxed text-faint">
            Questions before applying? Message us — a person answers.
            <br />© 2026 LocalTask · Operated by Local Group
          </p>
        </div>
      </footer>

      <SupportDock />
    </div>
  )
}
