import { useEffect, useMemo, useState } from 'react'

/** Hero 主秀:一张真实任务卡自动走完生命周期。
 *  导演脚本:落桌 → 字段显影 → OFFER → 进行中 → 已提交 → 已付款 →
 *  「Confirm received」呼吸 → 你确认 → CLOSED 钢印 → 淡出,循环。
 *  只用 transform/opacity;reduced-motion 时静止在完结帧。 */

const PHASE_MS = [950, 1700, 2100, 1900, 2100, 2700, 2900, 650]
const STEPS = ['OFFER', 'IN PROGRESS', 'SUBMITTED', 'PAID', 'CLOSED'] as const

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

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        key={loop}
        className={`relative overflow-hidden rounded-2xl border border-hair bg-surface p-6 shadow-[0_24px_64px_rgba(30,29,25,0.10)] ${phase === 0 ? 'ld-rise' : ''} ${phase === 7 ? 'ld-out' : ''}`}
      >
        {/* 头行 */}
        <div className="ld-fade flex items-baseline justify-between" style={{ animationDelay: '120ms' }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">Task A-1042</p>
          <p className="font-display text-2xl font-medium tracking-tight text-ink">$120.00</p>
        </div>

        {/* 字段:等宽台账 */}
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
          {[
            ['SCOPE', 'Fixed · 4 criteria'],
            ['PRICED', 'USD, upfront'],
            ['PAYOUT', 'USDT · TRC20'],
            ['MANAGER', 'Sarah W.'],
          ].map(([k, v], i) => (
            <div key={k} className="ld-fade" style={{ animationDelay: `${240 + i * 90}ms` }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{k}</p>
              <p className="mt-0.5 font-mono text-[13px] text-ink-soft">{v}</p>
            </div>
          ))}
        </div>

        {/* 生命周期胶囊 */}
        <div className="ld-fade mt-6 flex flex-wrap gap-1.5" style={{ animationDelay: '640ms' }}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all duration-500 ${
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

        {/* 付款与确认区 */}
        <div className="mt-6 min-h-[52px] border-t border-hair pt-4">
          {phase < 4 && (
            <p className="font-mono text-xs text-faint">
              {phase <= 1 ? 'Offer expires in 23h — your call.' : phase === 2 ? 'Steps in progress…' : 'Submitted — in review.'}
            </p>
          )}
          {phase >= 4 && phase < 6 && (
            <div className="ld-fade flex items-center justify-between gap-3">
              <p className="min-w-0 truncate font-mono text-xs text-muted">Payment sent · TX 7f3a…9c2e</p>
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

        {/* CLOSED 钢印 */}
        {phase >= 6 && (
          <div className="ld-pop pointer-events-none absolute right-5 top-5 rounded-md border-2 border-petrol px-2.5 py-1">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-petrol">Closed</p>
          </div>
        )}
      </div>

      {/* 玻璃注脚卡(桌面) / 说明行(移动) */}
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
