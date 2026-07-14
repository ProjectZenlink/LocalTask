import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowRight, Plus, Minus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { SUPPORT } from '../lib/support'
import { Rv } from '../lib/useReveal'
import TaskCardDemo from '../components/TaskCardDemo'
import SupportDock from '../components/SupportDock'

/** 公开落地页 v4(封版稿)。
 *  纪律:一种强调色 / 两款字体两级字阶 / 零图库照片 /
 *  动效预算 = 任务卡主秀 + 流程时间轴 + 滚动显现与悬停,再无其他。
 *  每一节配一件视觉主角:任务卡 → 台账 → 时间轴 → 墨绿面板 → 徽章 → 对话卡。 */

const FAQ: { q: string; a: string }[] = [
  { q: 'Is this a job?', a: "No. You're an independent contractor, task by task. No shifts, no quotas. Decline anything you don't like." },
  { q: 'What exactly will I be doing?', a: 'Structured tasks scoped by your manager. Every offer shows the steps, the criteria and the amount before you accept.' },
  { q: 'Why are stablecoins a payout option?', a: 'Cross-border businesses settle fastest with stablecoins. Prefer PayPal? Also fine. Your choice, always.' },
  { q: 'What if something goes wrong mid-task?', a: 'Message your manager directly. A real person, not a ticket queue. Tasks can be returned, fixed and resubmitted.' },
  { q: 'Who sees my documents?', a: 'Encrypted, and never shared with clients or other freelancers.' },
  { q: 'Does it cost anything?', a: "Never. No fees, no deposits, no starter kits. Anyone asking you for money isn't us." },
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

/** 流程时间轴:进度线自动推进循环;桌面横轨、移动竖轨;用户一旦点击,自动播放让位。 */
const STEPS4: [string, string, string][] = [
  ['01', 'Apply & verify', 'Ten minutes of ID checks. It keeps everyone here real.'],
  ['02', 'Meet your manager', 'One dedicated manager on WhatsApp or Telegram.'],
  ['03', 'Work the task', 'Accept what you like, follow the steps, submit.'],
  ['04', 'Confirm the pay', 'We send the payment. You confirm it arrived. Then it closes.'],
]

function Steps() {
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [act, setAct] = useState(reduced ? 3 : 0)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    if (reduced || manual) return
    const id = setTimeout(() => setAct(a => (a + 1) % 4), 2600)
    return () => clearTimeout(id)
  }, [act, reduced, manual])

  const node = (i: number) =>
    i < act
      ? 'border-petrol/30 bg-petrol/15 text-petrol'
      : i === act
        ? 'border-petrol bg-petrol text-paper'
        : 'border-hair bg-surface text-faint'

  return (
    <div className="relative mt-12">
      {/* 光斑:毛玻璃的背景养分 */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-[6%] h-56 w-56 rounded-full bg-petrol/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-12 right-[8%] h-64 w-64 rounded-full bg-petrol/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-hair bg-surface/55 shadow-[0_18px_48px_rgba(30,29,25,0.10)] backdrop-blur-xl">
        {/* 滑动高亮:移动竖滑 / 桌面横滑 */}
        <div
          aria-hidden
          className="absolute left-2 right-2 h-[100px] rounded-xl bg-paper/90 shadow-sm md:hidden"
          style={{ top: 0, transform: `translateY(${act * 108 + 4}px)`, transition: 'transform .6s var(--ease-ld)' }}
        />
        <div
          aria-hidden
          className="absolute inset-y-2 hidden w-1/4 rounded-xl bg-paper/90 shadow-sm md:block"
          style={{ transform: `translateX(${act * 100}%)`, transition: 'transform .6s var(--ease-ld)' }}
        />

        <div className="relative grid md:grid-cols-4">
          {STEPS4.map(([n, h, b], i) => (
            <button
              key={n}
              type="button"
              onClick={() => { setManual(true); setAct(i) }}
              className="flex h-[108px] items-center gap-4 px-5 text-left md:h-auto md:min-h-[168px] md:flex-col md:items-start md:gap-0 md:px-6 md:py-6"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold transition-colors duration-500 md:mb-3 ${node(i)}`}>
                {n}
              </span>
              <span className="min-w-0">
                <span className={`block font-display text-[16px] font-medium tracking-tight transition-colors duration-500 md:text-[17px] ${i === act ? 'text-ink' : 'text-muted'}`}>
                  {h}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted md:mt-1.5 md:text-sm md:leading-relaxed">
                  {b}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { session, loading } = useAuth()
  if (!loading && session) return <Navigate to="/offers" replace />

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ============ 页头:吸顶毛玻璃 ============ */}
      <header className="sticky top-0 z-30 border-b border-hair bg-paper/85 backdrop-blur">
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

      {/* ============ Hero:开幕编排 ============ */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-48 right-[-12%] h-[520px] w-[520px] rounded-full bg-petrol/[0.05] blur-3xl" />
        <div className="mx-auto max-w-5xl px-5 pb-20 pt-16 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="ld-fade font-mono text-[11px] uppercase tracking-[0.28em] text-petrol">
                For US-based freelancers
              </p>
              <h1 className="t-hero mt-5 font-display font-medium">
                <span className="ld-fade block" style={{ animationDelay: '90ms' }}>Task-based work</span>
                <span className="ld-fade block text-petrol" style={{ animationDelay: '180ms' }}>done properly.</span>
              </h1>
              <p className="ld-fade mt-6 max-w-md text-base leading-relaxed text-muted" style={{ animationDelay: '280ms' }}>
                Structured tasks, paid in USD. Nothing closes until
                <span className="font-medium text-petrol"> you confirm the money arrived</span>.
              </p>
              <div className="ld-fade mt-8" style={{ animationDelay: '380ms' }}>
                <Link
                  to="/signup"
                  className="group inline-flex items-center gap-2 rounded-xl bg-petrol px-7 py-3.5 font-display text-[15px] font-medium text-paper shadow-[0_10px_28px_rgba(36,75,77,0.28)] transition hover:-translate-y-px hover:bg-petrol-hover"
                >
                  Apply now
                  <ArrowRight size={16} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </div>
              <p className="ld-fade mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-faint" style={{ animationDelay: '470ms' }}>
                No fees. No deposits. Ever.
              </p>
            </div>

            <div className="ld-rise" style={{ animationDelay: '260ms' }}>
              <TaskCardDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ============ 01 工作长什么样:台账卡 ============ */}
      <section className="relative overflow-hidden border-t border-hair">
        <span aria-hidden className="pointer-events-none absolute top-6 right-3 select-none font-display text-[6rem] font-semibold leading-none tracking-tighter text-petrol/[0.04] sm:text-[11rem]">01</span>
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">01 — The work</Rv>
          <Rv as="h2" delay={60} className="t-h2 mt-4 max-w-xl font-display font-medium">
            Discrete
            <br />
            structured tasks.
          </Rv>
          <Rv as="p" delay={120} className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            Every offer shows the steps, the criteria and the exact amount — before you accept.
          </Rv>
          <Rv delay={180} className="mt-10 max-w-2xl rounded-2xl border border-hair bg-surface">
            {[
              ['Fixed scope', 'You always know what “done” means.'],
              ['Fixed price', 'The amount is on the offer. It doesn\'t move.'],
              ['One at a time', 'Steady, reviewable work — built for the long run.'],
            ].map(([h, b]) => (
              <div key={h} className="flex flex-col gap-1 border-b border-hair px-6 py-5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-8">
                <p className="w-36 shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">{h}</p>
                <p className="text-sm leading-relaxed text-muted">{b}</p>
              </div>
            ))}
          </Rv>
        </div>
      </section>

      {/* ============ 02 流程:活的时间轴 ============ */}
      <section className="relative overflow-hidden border-y border-hair bg-surface">
        <span aria-hidden className="pointer-events-none absolute top-6 right-3 select-none font-display text-[6rem] font-semibold leading-none tracking-tighter text-petrol/[0.04] sm:text-[11rem]">02</span>
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">02 — How it works</Rv>
          <Rv as="h2" delay={60} className="t-h2 mt-4 font-display font-medium">
            Four steps. The fourth is yours.
          </Rv>
          <Rv delay={120}>
            <Steps />
          </Rv>
        </div>
      </section>

      {/* ============ 03 钱:墨绿面板 ============ */}
      <section className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute top-6 right-3 select-none font-display text-[6rem] font-semibold leading-none tracking-tighter text-petrol/[0.04] sm:text-[11rem]">03</span>
        <div className="mx-auto max-w-5xl px-5 py-28 sm:py-32">
        <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">03 — The money</Rv>
        <Rv as="h2" delay={60} className="t-h2 mt-4 font-display font-medium">
          It isn't done
          <br />
          <span className="text-petrol">until you're paid.</span>
        </Rv>
        <Rv delay={140} className="relative mt-10 overflow-hidden rounded-2xl bg-petrol p-8 shadow-[0_20px_56px_rgba(36,75,77,0.32)] sm:p-10">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-paper/[0.07] blur-3xl" />
          <div className="relative grid sm:grid-cols-3 sm:gap-8">
            <div className="border-b border-paper/15 py-5 first:pt-0 sm:border-0 sm:py-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">Priced in USD</p>
              <p className="mt-2 text-sm leading-relaxed text-paper">The exact amount is on every offer.</p>
            </div>
            <div className="border-b border-paper/15 py-5 sm:border-0 sm:py-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">Paid your way</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['USDT', 'USDC', 'PayPal'].map(m => (
                  <span key={m} className="rounded-full border border-paper/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-paper">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="py-5 last:pb-0 sm:border-0 sm:py-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60">Closed by you</p>
              <p className="mt-2 text-sm leading-relaxed text-paper">Nothing closes until you confirm it arrived.</p>
            </div>
          </div>
          <div className="mt-8 border-t border-paper/20 pt-6">
            <p className="font-display text-xl font-medium tracking-tight text-paper sm:text-2xl">
              We never ask you for money. <span className="text-paper/70">No fees, no deposits, no starter kits. If anyone asks, it isn't us.</span>
            </p>
          </div>
        </Rv>
        </div>
      </section>

      {/* ============ 04 验证:一句话 + 徽章 ============ */}
      <section className="relative overflow-hidden border-y border-hair bg-surface">
        <span aria-hidden className="pointer-events-none absolute top-6 right-3 select-none font-display text-[6rem] font-semibold leading-none tracking-tighter text-petrol/[0.04] sm:text-[11rem]">04</span>
        <div className="mx-auto max-w-5xl px-5 py-20">
          <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">04 — Verification</Rv>
          <Rv as="h2" delay={60} className="t-h2 mt-4 max-w-xl font-display font-medium">
            Encrypted documents
            <br />
            only for verification.
          </Rv>
          <Rv as="p" delay={120} className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            Identity verification is what keeps every task and every payment real.
          </Rv>
          <div className="mt-10 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {[
              ['Valid ID', 'Government-issued and unexpired.'],
              ['SSN check', 'Used for identity only.'],
              ['18+ required', 'US-based freelancers.'],
            ].map(([h, b], i) => (
              <Rv key={h} delay={i * 70} className="border-t border-hair pt-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-petrol">{h}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
              </Rv>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 05 账户经理:对话卡 ============ */}
      <section className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute top-6 right-3 select-none font-display text-[6rem] font-semibold leading-none tracking-tighter text-petrol/[0.04] sm:text-[11rem]">05</span>
        <div className="mx-auto max-w-5xl px-5 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Rv as="p" className="font-mono text-[11px] uppercase tracking-[0.28em] text-faint">05 — Your manager</Rv>
            <Rv as="h2" delay={60} className="t-h2 mt-4 max-w-xl font-display font-medium">
              Your own manager
              <br />
              from day one.
            </Rv>
            <Rv as="p" delay={120} className="mt-4 max-w-lg text-base leading-relaxed text-muted">
              One dedicated account manager on WhatsApp or Telegram. They scope your tasks,
              answer fast, and stick around.
            </Rv>
          </div>
          <Rv delay={160} className="max-w-md rounded-2xl border border-hair bg-surface p-5 lg:justify-self-end">
            <div className="flex items-center gap-3 border-b border-hair pb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-petrol font-display text-xs font-medium text-paper">
                SW
              </span>
              <div>
                <p className="font-display text-sm font-medium tracking-tight">Sarah W.</p>
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-verified" />
                  Account manager
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              <p className="self-end rounded-2xl rounded-tr-md bg-petrol px-3.5 py-2.5 text-[13px] leading-relaxed text-paper">
                Quick one — the offer says 4 criteria, where do I see them?
              </p>
              <p className="self-start rounded-2xl rounded-tl-md border border-hair bg-paper px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft">
                Open the task → scope section, all four are listed. Ping me anytime — I'm here.
              </p>
              <p className="self-start font-mono text-[10px] uppercase tracking-wider text-faint">Replied in 2 min</p>
            </div>
          </Rv>
        </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="border-t border-hair bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <Rv as="p" className="text-center font-mono text-[11px] uppercase tracking-[0.28em] text-faint">
            Straight answers
          </Rv>
          <Rv as="h2" delay={60} className="t-h2 mt-4 text-center font-display font-medium">
            The questions you should be asking.
          </Rv>
          <FaqList />
        </div>
      </section>

      {/* ============ 尾部 CTA ============ */}
      <section className="mx-auto max-w-5xl px-5 py-20 text-center">
        <Rv as="h2" className="t-h2 font-display font-medium">
          Read the rules. Then decide.
        </Rv>
        <Rv as="p" delay={70} className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
          Applying takes about ten minutes.
        </Rv>
        <Rv delay={140} className="mt-7">
          <Link
            to="/signup"
            className="group inline-flex items-center gap-2 rounded-xl bg-petrol px-8 py-4 font-display text-[15px] font-medium text-paper shadow-[0_10px_28px_rgba(36,75,77,0.28)] transition hover:-translate-y-px hover:bg-petrol-hover"
          >
            Apply now
            <ArrowRight size={16} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </Rv>
        <Rv as="p" delay={210} className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          No fees. No deposits. Ever.
        </Rv>
      </section>

      {/* ============ 页脚 ============ */}
      <footer className="border-t border-hair">
        <div className="mx-auto max-w-5xl px-5 py-10 pb-28 sm:pb-10">
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
