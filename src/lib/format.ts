import { supabase } from './supabase'
import type { ChainNetwork } from '../types/database'

export function money(amount: number, token: string): string {
  const n = Number(amount)
  const s = Number.isInteger(n) ? n.toString() : n.toFixed(2)
  return `${s} ${token}`
}

export function usd(amount: number): string {
  const n = Number(amount)
  return `$${Number.isInteger(n) ? n.toString() : n.toFixed(2)}`
}

export function lt(amount: number): string {
  const n = Number(amount)
  return `${Number.isInteger(n) ? n.toString() : n.toFixed(2)} LT Coins`
}

/** Task money: before acceptance token is null → "$30"; ETH wallets are paid
 *  the USD equivalent → "$30 · ETH"; stablecoins → "30 USDT". */
export function taskMoney(amount: number, token: string | null): string {
  if (!token) return usd(amount)
  if (token === 'ETH') return `${usd(amount)} · ETH`
  return money(amount, token)
}

export function dateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function dateTimeShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Human countdown to a deadline/expiry. Returns null once passed. */
export function timeLeft(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m left`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h ${mins % 60}m left`
  return `${Math.floor(hrs / 24)}d left`
}

export function txUrl(network: ChainNetwork, hash: string): string {
  return network === 'tron'
    ? `https://tronscan.org/#/transaction/${hash}`
    : `https://etherscan.io/tx/${hash}`
}

export function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

export function waLink(num: string): string {
  return `https://wa.me/${num.replace(/\D/g, '')}`
}
export function tgLink(handle: string): string {
  return `https://t.me/${handle.replace(/^@/, '')}`
}
export function xLink(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, '')}`
}

/** ISO → datetime-local 输入框格式(本地时区) */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

export function fileNameFromPath(path: string): string {
  const tail = path.split('/').pop() ?? path
  return tail.replace(/^\d{13}-/, '')
}

const IMG_EXT = /\.(png|jpe?g|webp|gif|heic)$/i
export function isImagePath(path: string): boolean {
  return IMG_EXT.test(path)
}

/** 批量签名:一次请求签全部路径(逐个签会在文件多时明显变慢) */
export async function signFiles(bucket: string, paths: string[]): Promise<{ path: string; url: string }[]> {
  if (paths.length === 0) return []
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 86400)  // 24h:页面开一天内缩略图不失效
  const out: { path: string; url: string }[] = []
  ;(data ?? []).forEach((d, i) => {
    if (d.signedUrl) out.push({ path: d.path ?? paths[i], url: d.signedUrl })
  })
  return out
}

export function signTaskFiles(paths: string[]) {
  return signFiles('task-attachments', paths)
}

/** 北京时间日界线:签到体系全站统一口径(与后端 Asia/Shanghai 一致)。offsetDays=-1 为昨天。 */
export function bjDay(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10)
}

/** 点击时现签并打开:彻底避免"页面开久了链接过期"的 InvalidJWT/exp 报错(m22/G2) */
export async function openSigned(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
}

/** 任务类型显示名：Other → 其他/Other，其余原样 */
export function typeLabel(t: string | null | undefined, lang: 'zh' | 'en'): string {
  if (!t) return '—'
  return t === 'Other' ? (lang === 'zh' ? '其他' : 'Other') : t
}
