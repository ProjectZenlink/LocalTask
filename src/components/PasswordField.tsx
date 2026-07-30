import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Label, Input } from './ui'

/** 密码输入框:自带小眼睛显示/隐藏。 */
export default function PasswordField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      <div className="relative">
        <Input {...props} type={show ? 'text' : 'password'} className="pr-11" />
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition hover:text-ink"
        >
          {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  )
}
