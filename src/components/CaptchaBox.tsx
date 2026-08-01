import { forwardRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useI18n } from '../lib/i18n'

/** Cloudflare Turnstile 站点公钥（Site Key）。公钥设计上就是公开的；私钥只存放在 Supabase 后台。 */
const TURNSTILE_SITE_KEY = '0x4AAAAAAD8lA9SzcSxZMWHS'

type Props = {
  /** 在 Cloudflare 统计里区分入口 */
  action: 'login' | 'signup' | 'staff-join' | 'join'
  /** token 生命周期回调：验证通过给 token；过期 / 出错给 null（调用方据此禁用提交按钮） */
  onToken: (token: string | null) => void
  /** 不跟随站点语言时强制指定（员工注册页是纯中文隐藏页） */
  language?: 'zh-cn' | 'en'
}

/** 人机验证框。token 是一次性的：每次 auth 请求返回后，父组件应调 ref.current?.reset() 换新 token。 */
const CaptchaBox = forwardRef<TurnstileInstance, Props>(function CaptchaBox(
  { action, onToken, language },
  ref,
) {
  const { lang } = useI18n()
  return (
    <div className="mb-4">
      <Turnstile
        ref={ref}
        siteKey={TURNSTILE_SITE_KEY}
        options={{
          action,
          theme: 'light',
          size: 'flexible',
          language: language ?? (lang === 'zh' ? 'zh-cn' : 'en'),
        }}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    </div>
  )
})

export default CaptchaBox
export type { TurnstileInstance }
