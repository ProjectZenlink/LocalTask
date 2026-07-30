import { createContext, useContext, useState, type ReactNode } from 'react'
import type { TaskStatus } from '../types/database'

export type Lang = 'zh' | 'en'
const KEY = 'lt_admin_lang'

const LangContext = createContext<{ lang: Lang; toggle: () => void }>({ lang: 'zh', toggle: () => {} })

export function AdminLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem(KEY)
    return saved === 'en' ? 'en' : 'zh'
  })
  function toggle() {
    setLang(prev => {
      const next = prev === 'zh' ? 'en' : 'zh'
      localStorage.setItem(KEY, next)
      return next
    })
  }
  return <LangContext.Provider value={{ lang, toggle }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

/** Bilingual task-status labels + badge tone for the console. */
export const STATUS_LABEL: Record<TaskStatus, { zh: string; en: string; s: 'verified' | 'pending' | 'unverified' }> = {
  unassigned: { zh: '未指派', en: 'Unassigned', s: 'unverified' },
  offered: { zh: '已邀约(停用)', en: 'Offered (legacy)', s: 'pending' },
  in_progress: { zh: '进行中', en: 'In progress', s: 'pending' },
  under_review: { zh: '待审核', en: 'Under review', s: 'pending' },
  pending_payment: { zh: '待放款', en: 'Awaiting payment', s: 'verified' },
  completed: { zh: '已完成', en: 'Completed', s: 'verified' },
  cancelled: { zh: '已取消', en: 'Cancelled', s: 'unverified' },
}
