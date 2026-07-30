import { useEffect, useRef } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { createElement } from 'react'

/** 滚动显现:进入视口加 .in,一次性。reduced-motion 直接显示。 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in')
      return
    }
    const ob = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('in')
            ob.disconnect()
          }
        }
      },
      { threshold: 0.12 },
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [])
  return ref
}

/** 便捷包装:<Rv delay={80}>…</Rv> */
export function Rv({ children, className = '', delay = 0, as = 'div' }: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'section' | 'p' | 'h2' | 'li'
}) {
  const ref = useReveal<HTMLDivElement>()
  const style: CSSProperties = delay ? { transitionDelay: `${delay}ms` } : {}
  return createElement(as, { ref, className: `rv ${className}`, style }, children)
}
