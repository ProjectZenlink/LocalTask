import LogoMark from './LogoMark'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

export interface MastNavItem { to: string; label: string; count?: number }

/**
 * 三端统一报头(Dispatch 2.0 · 单据美学):
 * 同一套解剖 —— 发丝下边线、logo 方块 + 字标 + 角色徽章、
 * 分组导航(组间发丝竖线)、墨线式激活态、右侧安静工具区。
 * 三端结构相同、选项各自不同。
 */
export default function Masthead({
  home, badge, groups, right, maxW = 'max-w-6xl',
}: {
  home: string
  badge?: string | null
  groups: MastNavItem[][]
  right?: ReactNode
  maxW?: string
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-paper/95 backdrop-blur">
      <div className={`mx-auto flex ${maxW} flex-wrap items-stretch gap-x-6 gap-y-0 px-5`}>
        <Link to={home} className="flex items-center gap-2.5 py-3.5 font-display text-lg font-medium tracking-tight text-ink">
          <LogoMark />
          LocalTask
          {badge && (
            <span className="rounded border border-hair px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              {badge}
            </span>
          )}
        </Link>

        <nav className="flex flex-wrap items-stretch gap-x-5">
          {groups.map((g, gi) => (
            <div key={gi} className="flex items-stretch gap-x-5">
              {gi > 0 && <span className="my-auto h-4 w-px bg-hair" aria-hidden />}
              {g.map(n => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 border-b-2 pb-[calc(0.875rem-2px)] pt-3.5 text-sm transition ${
                      isActive
                        ? 'border-petrol font-medium text-ink'
                        : 'border-transparent text-muted hover:text-ink'
                    }`
                  }
                >
                  {n.label}
                  {typeof n.count === 'number' && n.count > 0 && (
                    <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-petrol px-1 font-mono text-[10px] leading-4 text-paper">
                      {n.count}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4 py-3.5 text-sm">{right}</div>
      </div>
    </header>
  )
}
