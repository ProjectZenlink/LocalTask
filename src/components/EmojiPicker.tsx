import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'

/** Emoji 选择器(v63 ③):原生 Unicode 表情,零依赖零后端;
 *  与翻译(needsTranslation 只认文字)和脏话拦截天然兼容。 */

const EMOJIS = [
  '😀','😄','😁','😊','🙂','😉','😍','🥰','😘','😜','🤗','🤔',
  '😅','😂','🤣','🙃','😎','🤩','🥳','😇','😌','😴','🤤','😋',
  '👍','👎','👌','🤝','🙏','👏','💪','✌️','🤞','👋','🫡','🤙',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💯','✨','🔥',
  '🎉','🎊','🎁','🏆','⭐','🌟','☀️','🌈','⚡','💡','📌','📎',
  '✅','☑️','❌','⚠️','❗','❓','💬','📝','📷','💰','💵','🪙',
  '🚀','⏰','📅','🔒','🔑','🛠️','📦','🏦','🏪','🛒','🌍','🇺🇸',
]

export default function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} title="Emoji"
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
          open ? 'border-petrol/50 text-petrol' : 'border-hair text-faint hover:border-petrol/40 hover:text-petrol'
        }`}>
        <Smile size={17} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-11 left-0 z-30 w-64 rounded-2xl border border-hair bg-white p-2.5 shadow-[0_16px_48px_rgba(26,32,30,0.18)]">
          <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => { onPick(e); setOpen(false) }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-paper">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
