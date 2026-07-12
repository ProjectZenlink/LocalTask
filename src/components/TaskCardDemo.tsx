import { useEffect, useMemo, useRef, useState } from 'react'

/** Hero 主秀 v2:双任务交替(USDT ↔ PayPal),全区域定高零回流。
 *  脚本:落桌 → 字段显影 → OFFER → 进行中 → 已提交 → 已付款 →
 *  「Confirm received」呼吸 → 你确认 → CLOSED 钢印 → 淡出,换下一单。 */

const PHASE_MS = [950, 1700, 2100, 1900, 2100, 2700, 2900, 650]
const STEPS = ['OFFER', 'ACTIVE', 'SUBMITTED', 'PAID', 'CLOSED'] as const

const TASKS = [
  { id: 'TASK A-1042', amt: '$120.00', time: '~45 min', payout: 'USDT · TRC20', ref: 'TX 7f3a…9c2e' },
  { id: 'TASK B-2087', amt: '$85.00', time: '~30 min', payout: 'PayPal', ref: 'Ref 8KD2…41ZQ' },
] as const

function stepIndex(phase: number): number {
  if (phase <= 1) return 0
  if (phase === 2) return 1
  if (phase === 3) return 2
  if (phase <= 5) return 3
  return 4
}

export default function TaskCardDemo() {
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [phase, setPhase] = useState(reduced ? 6 : 0)
  const [loop, setLoop] = useState(0)

  useEffect(() => {
    if (reduced) return
    const id = setTimeout(() => {
      setPhase(p => {
        if (p >= 7) { setLoop(l => l + 1); return 0 }
        return p + 1
      })
    }, PHASE_MS[phase])
    return () => clearTimeout(id)
  }, [phase, reduced])

  const active = stepIndex(phase)
  const task = TASKS[loop % 2]

  /* 指针微倾:桌面 ±3°,阻尼重,离开归位;reduced-motion 关闭 */
  const tiltRef = useRef<HTMLDivElement>(null)
  function onTilt(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return
    const el = tiltRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`
  }
  function offTilt() {
    const el = tiltRef.current
    if (el) el.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg)'
  }

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* petrol 微光:让卡片浮起来 */}
      <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(36,75,77,0.09),transparent_72%)] blur-2xl" />
      <div
        ref={tiltRef}
        onMouseMove={onTilt}
        onMouseLeave={offTilt}
        style={{ transition: 'transform .25s var(--ease-ld)' }}
      >
      <div
        key={loop}
        className={`relative overflow-hidden rounded-2xl border border-hair bg-surface p-6 shadow-[0_24px_64px_rgba(30,29,25,0.10)] ${phase === 0 ? 'ld-rise' : ''} ${phase === 7 ? 'ld-out' : ''}`}
      >
        {/* 头行(定高) */}
        <div className="ld-fade flex h-9 items-baseline justify-between" style={{ animationDelay: '120ms' }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">{task.id}</p>
          <p className="font-display text-2xl font-medium tracking-tight text-ink">{task.amt}</p>
        </div>

        {/* 字段:等宽台账(定高) */}
        <div className="mt-4 grid h-[92px] grid-cols-2 content-start gap-x-6 gap-y-3">
          {[
            ['SCOPE', 'Fixed · 4 criteria'],
            ['EST. TIME', task.time],
            ['PAYOUT', task.payout],
            ['MANAGER', 'Sarah W.'],
          ].map(([k, v], i) => (
            <div key={k} className="ld-fade" style={{ animationDelay: `${240 + i * 90}ms` }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{k}</p>
              <p className="mt-0.5 truncate font-mono text-[13px] text-ink-soft">{v}</p>
            </div>
          ))}
        </div>

        {/* 生命周期胶囊(定高一行) */}
        <div className="ld-fade mt-5 flex h-7 items-center gap-1.5 overflow-hidden" style={{ animationDelay: '640ms' }}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`whitespace-nowrap rounded-full border px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-all duration-500 sm:px-2 sm:text-[9.5px] ${
                i < active
                  ? 'border-hair bg-paper text-faint'
                  : i === active
                    ? 'border-petrol bg-petrol text-paper'
                    : 'border-hair text-faint/60'
              }`}
              style={{ transitionTimingFunction: 'var(--ease-ld)' }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* 付款与确认区(定高) */}
        <div className="mt-5 flex h-14 items-center border-t border-hair">
          {phase < 4 && (
            <p className="font-mono text-xs text-faint">
              {phase <= 1 ? 'Offer expires in 23h — your call.' : phase === 2 ? 'Steps in progress…' : 'Submitted — in review.'}
            </p>
          )}
          {phase >= 4 && phase < 6 && (
            <div className="ld-fade flex w-full items-center justify-between gap-3">
              <p className="min-w-0 truncate font-mono text-xs text-muted">Payment sent · {task.ref}</p>
              <button
                type="button"
                tabIndex={-1}
                className={`shrink-0 rounded-lg bg-petrol px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-paper ${phase === 5 ? 'ld-breathe' : ''}`}
              >
                Confirm received
              </button>
            </div>
          )}
          {phase >= 6 && (
            <p className="ld-fade font-mono text-xs text-verified-text">✓ Receipt confirmed — by you, not by us.</p>
          )}
        </div>

        {/* CLOSED 钢印(绝对定位,不影响布局) */}
        {phase >= 6 && (
          <div className="ld-pop pointer-events-none absolute right-5 top-5 rounded-md border-2 border-petrol px-2.5 py-1">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-petrol">Closed</p>
          </div>
        )}
      </div>

      </div>

      {/* 玻璃注脚(桌面) / 说明行(移动) */}
      <div className="absolute -bottom-5 -right-4 hidden rounded-xl border border-hair bg-surface/75 px-3.5 py-2.5 shadow-[0_10px_28px_rgba(30,29,25,0.10)] backdrop-blur md:block">
        <p className="max-w-[180px] font-mono text-[10.5px] leading-relaxed text-muted">
          A task closes only after <span className="text-petrol">you</span> confirm the money arrived.
        </p>
      </div>
      <p className="mt-4 text-center font-mono text-[11px] text-faint md:hidden">
        Closes only after you confirm the money arrived.
      </p>
    </div>
  )
}
