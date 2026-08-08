import { useEffect, useState } from 'react'
import { totpCode } from '../lib/totp'

/** 实时 2FA 验证码:每秒刷新,点击复制。密钥无效时不渲染。 */
export default function TotpCode({ secret }: { secret: string }) {
  const [v, setV] = useState<{ code: string; seconds: number } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = () => { void totpCode(secret).then(r => { if (alive) setV(r) }) }
    tick()
    const id = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(id) }
  }, [secret])

  if (!v) return null

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(v.code)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      title="Click to copy"
      className="inline-flex items-baseline gap-1.5 rounded-md border border-petrol/25 bg-petrol/5 px-1.5 py-0.5 font-mono text-xs text-petrol transition hover:bg-petrol/10"
    >
      <span className="font-medium tracking-[0.15em]">{copied ? 'copied' : v.code}</span>
      <span className="text-[10px] text-petrol/60">{v.seconds}s</span>
    </button>
  )
}
