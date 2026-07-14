import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

/** freelancer 端语言开关:默认英文,localStorage 记忆,页级 COPY 字典按 lang 取值。 */
export type Lang = 'en' | 'zh'

const LangContext = createContext<{ lang: Lang; toggle: () => void }>({ lang: 'en', toggle: () => {} })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('lt_lang') : null
    return saved === 'zh' ? 'zh' : 'en'
  })
  const toggle = () =>
    setLang(l => {
      const next: Lang = l === 'en' ? 'zh' : 'en'
      localStorage.setItem('lt_lang', next)
      return next
    })
  return <LangContext.Provider value={{ lang, toggle }}>{children}</LangContext.Provider>
}

export function useI18n() {
  return useContext(LangContext)
}
