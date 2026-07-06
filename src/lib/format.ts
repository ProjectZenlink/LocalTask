import { supabase } from './supabase'
import type { ChainNetwork } from '../types/database'

export function money(amount: number, token: string): string {
  const n = Number(amount)
  const s = Number.isInteger(n) ? n.toString() : n.toFixed(2)
  return `${s} ${token}`
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

/** Signed URLs for a list of storage paths in the task-attachments bucket. */
export async function signTaskFiles(paths: string[]): Promise<{ path: string; url: string }[]> {
  const out: { path: string; url: string }[] = []
  for (const path of paths) {
    const { data } = await supabase.storage.from('task-attachments').createSignedUrl(path, 3600)
    if (data?.signedUrl) out.push({ path, url: data.signedUrl })
  }
  return out
}
