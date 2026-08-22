/** v85.7 · 错误翻译层:把 Supabase / Postgres / 网络错误翻成双语人话。
 *  语言判定:/admin 与 /am 路径读 lt_admin_lang(默认中文),其余读 lt_lang(默认英文,与 FR 端锁英一致)。
 *  code === 'P0001' 是业务层自写 RAISE 文案,原样放行;未识别错误给通用句并附截断原文,便于回报排查。 */
type ErrLike = { message?: unknown; code?: unknown; error_description?: unknown }

function uiLang(): 'en' | 'zh' {
  try {
    const p = window.location.pathname
    if (p.startsWith('/admin') || p.startsWith('/am')) {
      return localStorage.getItem('lt_admin_lang') === 'en' ? 'en' : 'zh'
    }
    return localStorage.getItem('lt_lang') === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

const RULES: [RegExp, { en: string; zh: string }][] = [
  [/invalid login credentials/i, { en: 'Email or password is incorrect.', zh: '邮箱或密码不正确。' }],
  [/email not confirmed/i, { en: 'Please confirm your email first — check your inbox.', zh: '请先完成邮箱验证，去收件箱看看。' }],
  [/already registered|already been registered/i, { en: 'This email is already registered — try logging in.', zh: '该邮箱已注册，试试直接登录。' }],
  [/duplicate key|already exists|23505/i, { en: 'That record already exists.', zh: '已存在相同的记录。' }],
  [/rate limit|too many requests|429/i, { en: 'Too many attempts — wait a moment and try again.', zh: '操作太频繁，稍等片刻再试。' }],
  [/failed to fetch|networkerror|fetch failed|load failed|network request failed/i, { en: 'Network hiccup — check your connection and try again.', zh: '网络不稳定，请检查网络后重试。' }],
  [/jwt expired|token is expired|invalid refresh token|session.*expired/i, { en: 'Your session expired — please sign in again.', zh: '登录已过期，请重新登录。' }],
  [/row-level security|permission denied|42501|not authorized/i, { en: "You don't have permission for that action.", zh: '没有权限执行该操作。' }],
  [/PGRST116|multiple \(or no\) rows/i, { en: 'Record not found or already changed — refresh and try again.', zh: '记录不存在或已被更新，刷新后再试。' }],
  [/foreign key|23503/i, { en: 'A related record is missing or has changed.', zh: '关联数据不存在或已变更。' }],
  [/value too long|22001/i, { en: 'That text is too long.', zh: '内容过长。' }],
  [/invalid input syntax|22P02/i, { en: 'That format looks invalid.', zh: '格式不正确。' }],
  [/captcha|turnstile/i, { en: 'Captcha check failed — please try again.', zh: '人机验证未通过，请重试。' }],
  [/payload too large|maximum allowed size|exceeds the maximum/i, { en: 'That file is too large.', zh: '文件太大了。' }],
  [/weak password|password should be at least/i, { en: 'Password is too weak — use at least 8 characters.', zh: '密码强度不够，至少要 8 位。' }],
]

function genericText(): string {
  return uiLang() === 'zh' ? '操作没有成功，请重试。' : 'Something went wrong — please try again.'
}

/** 显示层统一入口:接受 Supabase 错误对象 / Error / 任意 unknown。 */
export function friendly(e: unknown): string {
  const o = (e ?? {}) as ErrLike
  const candidates = [o.message, o.error_description, e instanceof Error ? e.message : null, typeof e === 'string' ? e : null]
  const msg = (candidates.find(v => typeof v === 'string' && v.length > 0) as string | undefined) ?? ''
  const code = typeof o.code === 'string' ? o.code : ''
  if (code === 'P0001') return msg || genericText()
  const hay = `${code} ${msg}`
  for (const [re, t] of RULES) if (re.test(hay)) return t[uiLang()]
  const detail = msg.slice(0, 90)
  return detail ? `${genericText()} (${detail}${msg.length > 90 ? '…' : ''})` : genericText()
}
