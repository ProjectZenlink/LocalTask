import { supabase } from './supabase'

/** 个人贴纸库(v69 ③,仅员工):私有桶 chat-stickers,路径 {uid}/{uuid}.{ext}。
 *  ≤2MB·仅图片四型为桶级服务端硬限制;此处校验只为更早报错。
 *  发送时由 ChatCenter 复制为普通图片附件走 v64 全链,消息侧零新面。 */

export const STICKER_MAX_BYTES = 2 * 1024 * 1024
export const STICKER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
export const STICKER_CAP = 24

export interface StickerItem { path: string; name: string }

export async function listStickers(uid: string): Promise<StickerItem[]> {
  const { data, error } = await supabase.storage.from('chat-stickers')
    .list(uid, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } })
  if (error || !data) return []
  return data.filter(o => o.name && !o.name.startsWith('.'))
    .map(o => ({ path: `${uid}/${o.name}`, name: o.name }))
}

export async function uploadSticker(uid: string, f: File): Promise<void> {
  if (!STICKER_ACCEPT.split(',').includes(f.type)) throw new Error('type')
  if (f.size < 1 || f.size > STICKER_MAX_BYTES) throw new Error('size')
  const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${uid}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('chat-stickers')
    .upload(path, f, { contentType: f.type, upsert: false })
  if (error) throw new Error(error.message)
}

export async function deleteSticker(path: string): Promise<void> {
  await supabase.storage.from('chat-stickers').remove([path])
}

const urlCache = new Map<string, { url: string; exp: number }>()

export async function stickerUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from('chat-stickers')
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 })
  return data.signedUrl
}
