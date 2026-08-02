import { supabase } from './supabase'

/** 聊天附件基础层(v64 ⑦):图片(jpg/png/webp/gif) + PDF,单个 ≤10MB(与 m44 库侧
 *  msg_att_shape 同源同值)。路径规范 {conversation_id}/{uid}/{uuid}-{文件名} ——
 *  与 send_message 路径铁门、存储策略(参与者+本人目录+活线)三方同一约定。 */

export const MAX_ATTACH_BYTES = 10 * 1024 * 1024

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const FILE_MIMES = ['application/pdf']
export const ATTACH_ACCEPT = [...IMAGE_MIMES, ...FILE_MIMES].join(',')

export type AttachType = 'image' | 'file'

/** 类型白名单判定:不在名单 → null(调用方据此报错) */
export function classifyFile(f: File): AttachType | null {
  if (IMAGE_MIMES.includes(f.type)) return 'image'
  if (FILE_MIMES.includes(f.type)) return 'file'
  return null
}

export function humanSize(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** 文件名净化:保留常见安全字符,防路径注入与存储键怪字符 */
function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.\-()\u4e00-\u9fff ]+/g, '_').slice(-80)
  return cleaned || 'file'
}

export async function uploadChatFile(convId: string, uid: string, f: File): Promise<{
  path: string; name: string; type: AttachType; size: number
}> {
  const type = classifyFile(f)
  if (!type) throw new Error('type')
  if (f.size < 1 || f.size > MAX_ATTACH_BYTES) throw new Error('size')
  const path = `${convId}/${uid}/${crypto.randomUUID()}-${safeName(f.name)}`
  const { error } = await supabase.storage.from('chat-attachments')
    .upload(path, f, { contentType: f.type, upsert: false })
  if (error) throw new Error(error.message)
  return { path, name: f.name, type, size: f.size }
}

/** 签名 URL(私有桶):模块级缓存 55 分钟(签发 60 分钟) */
const urlCache = new Map<string, { url: string; exp: number }>()

export async function chatFileUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from('chat-attachments')
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) return null
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 })
  return data.signedUrl
}
