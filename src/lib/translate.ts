import { supabase } from './supabase'

/** 聊天自动翻译(v61):中英启发式判定 + 批量调用 Edge Function translate-messages。
 *  函数侧带缓存表(m41),每条消息每种语言只真正翻一次;失败静默降级显示原文。 */
export type ChatLang = 'zh' | 'en'

const CJK = /[㐀-䶿一-鿿]/
const LETTERS = /[a-zA-Z㐀-䶿一-鿿]/

/** 这条消息是否需要为当前界面语言翻译(纯表情/数字/同语言 → 否) */
export function needsTranslation(body: string, uiLang: ChatLang): boolean {
  if (!LETTERS.test(body)) return false
  const isZh = CJK.test(body)
  return uiLang === 'zh' ? !isZh : isZh
}

/** 批量翻译(每批 ≤50);返回 { 消息id: 译文 };失败返回已有部分或空对象 */
export async function translateBatch(ids: string[], target: ChatLang): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    try {
      const { data, error } = await supabase.functions.invoke('translate-messages', {
        body: { message_ids: chunk, target_lang: target },
      })
      if (!error && data && typeof data === 'object') {
        Object.assign(out, (data as { translations?: Record<string, string> }).translations ?? {})
      }
    } catch {
      /* 静默降级:前端显示原文 */
    }
  }
  return out
}

/** 预热翻译函数(杀冷启动):空批直调,函数即刻返回;失败无视 */
export function prewarmTranslate(): void {
  void supabase.functions.invoke('translate-messages', {
    body: { message_ids: [], target_lang: 'en' },
  }).catch(() => { /* 预热失败无碍 */ })
}
