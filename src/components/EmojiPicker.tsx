import { useCallback, useEffect, useRef, useState } from 'react'
import { Smile, Plus, X } from 'lucide-react'
import {
  listStickers, uploadSticker, deleteSticker, stickerUrl,
  STICKER_ACCEPT, STICKER_CAP, type StickerItem,
} from '../lib/stickers'

/** 表情选择器(v63 ③ / v69 ③):
 *  「表情」页签 = 原生 Unicode,零依赖,全端可用;
 *  「贴纸」页签 = 个人贴纸库,仅员工(传入 stickerUid 才出现),点选即发。 */

const EMOJIS = [
  '😀','😄','😁','😊','🙂','😉','😍','🥰','😘','😜','🤗','🤔',
  '😅','😂','🤣','🙃','😎','🤩','🥳','😇','😌','😴','🤤','😋',
  '👍','👎','👌','🤝','🙏','👏','💪','✌️','🤞','👋','🫡','🤙',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💯','✨','🔥',
  '🎉','🎊','🎁','🏆','⭐','🌟','☀️','🌈','⚡','💡','📌','📎',
  '✅','☑️','❌','⚠️','❗','❓','💬','📝','📷','💰','💵','🪙',
  '🚀','⏰','📅','🔒','🔑','🛠️','📦','🏦','🏪','🛒','🌍','🇺🇸',
]

const COPY = {
  zh: { emoji: '表情', sticker: '贴纸', empty: '还没有贴纸 —— 点 + 上传一张图片。',
        tooMany: `最多 ${STICKER_CAP} 张,先删几张再传。`, badType: '仅支持 JPG/PNG/WebP/GIF。',
        badSize: '单张最大 2MB。', failed: '上传失败,请重试。' },
  en: { emoji: 'Emoji', sticker: 'Stickers', empty: 'No stickers yet — tap + to upload an image.',
        tooMany: `Up to ${STICKER_CAP} stickers — delete some first.`, badType: 'JPG/PNG/WebP/GIF only.',
        badSize: 'Max 2 MB each.', failed: 'Upload failed, please retry.' },
}

function StickerThumb({ item, onSend, onDelete }: {
  item: StickerItem; onSend: () => void; onDelete: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void stickerUrl(item.path).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [item.path])
  return (
    <span className="group relative">
      <button onClick={onSend} disabled={!url} title={item.name}
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-hair bg-white transition hover:border-petrol/50">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" />
             : <span className="font-mono text-[10px] text-faint">…</span>}
      </button>
      <button onClick={onDelete} title="×"
        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-hair bg-white text-faint shadow-sm transition hover:text-danger-text group-hover:flex">
        <X size={11} />
      </button>
    </span>
  )
}

export default function EmojiPicker({
  onPick, lang = 'en', stickerUid = null, onSticker,
}: {
  onPick: (e: string) => void
  lang?: 'zh' | 'en'
  stickerUid?: string | null
  onSticker?: (path: string, name: string) => void
}) {
  const t = COPY[lang]
  const canSticker = !!stickerUid && !!onSticker
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'emoji' | 'sticker'>('emoji')
  const [items, setItems] = useState<StickerItem[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!stickerUid) return
    setItems(await listStickers(stickerUid))
  }, [stickerUid])

  useEffect(() => { if (open && canSticker) void load() }, [open, canSticker, load])

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!f || !stickerUid || busy) return
    setNote(null)
    if (items.length >= STICKER_CAP) { setNote(t.tooMany); return }
    setBusy(true)
    try {
      await uploadSticker(stickerUid, f)
      await load()
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setNote(m === 'type' ? t.badType : m === 'size' ? t.badSize : t.failed)
    }
    setBusy(false)
  }

  async function onDelete(path: string) {
    await deleteSticker(path)
    await load()
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} title="Emoji"
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
          open ? 'border-petrol/50 text-petrol' : 'border-hair text-faint hover:border-petrol/40 hover:text-petrol'
        }`}>
        <Smile size={17} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-11 left-0 z-30 w-72 rounded-2xl border border-hair bg-white p-2.5 shadow-[0_16px_48px_rgba(26,32,30,0.18)]">
          {canSticker && (
            <div className="mb-2 flex gap-1 px-0.5">
              {(['emoji', 'sticker'] as const).map(k => (
                <button key={k} onClick={() => setTab(k)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${
                    tab === k ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:text-ink'
                  }`}>
                  {k === 'emoji' ? t.emoji : `${t.sticker} ${items.length}/${STICKER_CAP}`}
                </button>
              ))}
            </div>
          )}
          {(!canSticker || tab === 'emoji') && (
            <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => { onPick(e); setOpen(false) }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-paper">
                  {e}
                </button>
              ))}
            </div>
          )}
          {canSticker && tab === 'sticker' && (
            <>
              {note && <p className="mb-1.5 px-1 text-xs text-danger-text">{note}</p>}
              <div className="grid max-h-60 grid-cols-3 justify-items-center gap-2 overflow-y-auto p-1">
                {items.map(it => (
                  <StickerThumb key={it.path} item={it}
                    onSend={() => { onSticker?.(it.path, it.name); setOpen(false) }}
                    onDelete={() => void onDelete(it.path)} />
                ))}
                {items.length < STICKER_CAP && (
                  <button onClick={() => fileRef.current?.click()} disabled={busy} title="+"
                    className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-hair text-faint transition hover:border-petrol/50 hover:text-petrol disabled:opacity-40">
                    <Plus size={18} strokeWidth={1.8} />
                  </button>
                )}
              </div>
              {items.length === 0 && <p className="px-1 pb-1 pt-1.5 text-xs leading-relaxed text-faint">{t.empty}</p>}
              <input ref={fileRef} type="file" accept={STICKER_ACCEPT} className="hidden" onChange={e => void onFile(e)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
