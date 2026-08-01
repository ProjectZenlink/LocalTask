import { useEffect, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { chatFileUrl, humanSize } from '../lib/chatFiles'

/** 聊天附件渲染(v64 ⑦):image=缩略图点开灯箱;file=下载条(签名 URL 新开)。
 *  私有桶,URL 按需签发并缓存。 */

export default function AttachmentView({
  path, name, type, size, mine,
}: {
  path: string
  name: string
  type: 'image' | 'file'
  size: number
  mine: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [box, setBox] = useState(false)

  useEffect(() => {
    let alive = true
    void chatFileUrl(path).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path])

  useEffect(() => {
    if (!box) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBox(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [box])

  if (type === 'image') {
    return (
      <>
        <button onClick={() => url && setBox(true)} className="block" title={name}>
          {url ? (
            <img src={url} alt={name}
              className="max-h-56 max-w-full rounded-xl border border-hair bg-white object-contain" />
          ) : (
            <span className="flex h-28 w-40 items-center justify-center rounded-xl border border-hair bg-white font-mono text-[10px] text-faint">…</span>
          )}
        </button>
        {box && url && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
            onClick={() => setBox(false)}>
            <img src={url} alt={name} className="max-h-[92vh] max-w-[94vw] rounded-lg object-contain" />
            <button onClick={() => setBox(false)} title="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-ink transition hover:bg-paper">
              <X size={17} />
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer"
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
        mine
          ? 'border-paper/30 text-paper hover:bg-white/10'
          : 'border-hair bg-white text-ink hover:border-petrol/40'
      } ${url ? '' : 'pointer-events-none opacity-60'}`}>
      <Paperclip size={15} strokeWidth={1.8} className="shrink-0" />
      <span className="min-w-0">
        <span className="block max-w-[13rem] truncate text-sm">{name}</span>
        <span className={`font-mono text-[9.5px] uppercase tracking-wider ${mine ? 'text-paper/70' : 'text-faint'}`}>
          {humanSize(size)} · PDF
        </span>
      </span>
    </a>
  )
}
