import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/** 头像上传(m33/v53):公开桶 avatars,路径 {uid}/avatar-{ts}.ext,≤2MB。
 *  成功后更新 profiles.avatar_path 并 best-effort 清理旧文件。 */

export function avatarPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export default function AvatarUpload({ uid, name, path, lang, onChanged }: {
  uid: string; name: string | null; path: string | null; lang: 'zh' | 'en'; onChanged: (p: string) => void
}) {
  const inp = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const url = avatarPublicUrl(path)
  const initials = (name ?? '·').trim().slice(0, 2).toUpperCase() || '·'
  const t = lang === 'zh'
    ? { change: '更换头像', hint: '图片 ≤ 2MB,聊天与档案中可见', tooBig: '图片需小于 2MB。', notImg: '请选择图片文件。', fail: '上传失败:' }
    : { change: 'Change avatar', hint: 'Image ≤ 2MB — shown in chat and on your profile', tooBig: 'Image must be under 2MB.', notImg: 'Please pick an image file.', fail: 'Upload failed: ' }

  async function pick(f: File) {
    setErr(null)
    if (!f.type.startsWith('image/')) { setErr(t.notImg); return }
    if (f.size > 2 * 1024 * 1024) { setErr(t.tooBig); return }
    setBusy(true)
    const ext = (f.name.split('.').pop() || 'png').toLowerCase()
    const newPath = `${uid}/avatar-${Date.now()}.${ext}`
    const { error: ue } = await supabase.storage.from('avatars').upload(newPath, f, { contentType: f.type })
    if (ue) { setBusy(false); setErr(t.fail + ue.message); return }
    const { error: pe } = await supabase.from('profiles').update({ avatar_path: newPath }).eq('id', uid)
    if (pe) { setBusy(false); setErr(t.fail + pe.message); return }
    if (path && path !== newPath) void supabase.storage.from('avatars').remove([path])
    setBusy(false)
    onChanged(newPath)
  }

  return (
    <div className="flex items-center gap-4">
      {url ? (
        <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-full border border-hair object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-petrol font-display text-lg font-medium text-paper">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <button type="button" disabled={busy} onClick={() => inp.current?.click()}
          className="rounded-lg border border-hair bg-white px-3 py-1.5 font-display text-sm text-ink transition hover:bg-paper disabled:opacity-50">
          {busy ? '…' : t.change}
        </button>
        <p className="mt-1 font-mono text-[10px] text-faint">{t.hint}</p>
        {err && <p className="mt-1 text-xs text-danger-text">{err}</p>}
      </div>
      <input ref={inp} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
    </div>
  )
}
