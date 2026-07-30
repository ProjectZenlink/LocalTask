import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion, animate } from 'motion/react'

/** v49 动效底座:一条缓动曲线、一套弹簧、少数可组合原语。全部尊重系统减弱动效。 */
export const EASE = [0.22, 1, 0.36, 1] as const
export const SPRING = { type: 'spring' as const, stiffness: 340, damping: 26 }

/** 入场:轻抬升渐现。 */
export function Rise({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const rm = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={rm ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/** 列表交错入场容器 + 子项。 */
export function Stagger({ children, className = '', gap = 0.055 }: { children: ReactNode; className?: string; gap?: number }) {
  const rm = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={rm ? false : 'off'}
      animate="on"
      variants={{ on: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}
export function Item({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ off: { opacity: 0, y: 12 }, on: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }}
    >
      {children}
    </motion.div>
  )
}

/** 折叠:高度 auto 展开收起。 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const rm = useReducedMotion()
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={rm ? { duration: 0 } : { duration: 0.32, ease: EASE }}
      style={{ overflow: 'hidden' }}
    >
      {children}
    </motion.div>
  )
}

/** 数字滚动:from 当前显示值 → value。 */
export function CountUp({ value, format, duration = 0.8, className = '' }: {
  value: number; format: (n: number) => string; duration?: number; className?: string
}) {
  const rm = useReducedMotion()
  const [txt, setTxt] = useState(() => format(rm ? value : 0))
  const prev = useRef(rm ? value : 0)
  useEffect(() => {
    if (rm) { setTxt(format(value)); prev.current = value; return }
    const controls = animate(prev.current, value, {
      duration, ease: [0.22, 1, 0.36, 1],
      onUpdate: v => setTxt(format(v)),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, rm])  // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={className}>{txt}</span>
}

/** 对勾描画(SVG stroke)。 */
export function CheckDraw({ size = 56, delay = 0, className = '' }: { size?: number; delay?: number; className?: string }) {
  const rm = useReducedMotion()
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" className={className}>
      <motion.circle
        cx="28" cy="28" r="25" stroke="currentColor" strokeWidth="2.5"
        initial={rm ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.55, ease: EASE, delay }}
      />
      <motion.path
        d="M17 29.5 L25 37 L40 20.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
        initial={rm ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: EASE, delay: delay + 0.4 }}
      />
    </svg>
  )
}

/** 微光迸发:一次性金/翠双色细屑,克制而喜庆。 */
export function Sparkles({ count = 14, delay = 0 }: { count?: number; delay?: number }) {
  const rm = useReducedMotion()
  if (rm) return null
  const parts = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.35
    const dist = 44 + (i % 3) * 22
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      c: i % 3 === 0 ? '#B07A2E' : '#3E7A57',
      s: i % 2 === 0 ? 5 : 3.5,
      d: delay + (i % 5) * 0.03,
    }
  })
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, background: p.c }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: [0.4, 1, 0.6] }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: p.d }}
        />
      ))}
    </div>
  )
}
