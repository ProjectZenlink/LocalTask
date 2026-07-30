import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

/** 独立认证外壳:无站点导航,纸色全屏 + 居中卡片(m24/C1)。登录与注册共用。 */
export default function AuthShell({ children }: { children: ReactNode }) {
  const { lang, toggle } = useI18n()
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-petrol font-display text-sm font-semibold text-white">L</span>
          <span className="font-display text-lg font-semibold tracking-tight text-ink">LocalTask</span>
        </Link>
        <button onClick={toggle} className="font-mono text-xs uppercase tracking-wider text-muted hover:text-ink">
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl border border-hair bg-white p-8 shadow-sm sm:p-10">
          {children}
        </div>
      </main>
      <footer className="pb-6 text-center">
        <Link to="/" className="font-mono text-[11px] uppercase tracking-wider text-faint hover:text-muted">
          {lang === 'zh' ? '← 返回首页' : '← Back to home'}
        </Link>
      </footer>
    </div>
  )
}
