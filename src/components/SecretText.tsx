import { useState } from 'react'

/** 敏感文本:默认打码,点显/隐,一键复制 */
export default function SecretText({ value }: { value: string }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 剪贴板不可用则忽略 */ }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="break-all font-mono text-xs text-ink">{show ? value : '••••••••'}</span>
      <button onClick={() => setShow(v => !v)}
        className="font-mono text-[10px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
        {show ? 'hide' : 'show'}
      </button>
      <button onClick={copy}
        className="font-mono text-[10px] uppercase tracking-wider text-faint transition hover:text-ink">
        {copied ? '✓' : 'copy'}
      </button>
    </span>
  )
}
