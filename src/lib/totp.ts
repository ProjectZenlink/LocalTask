/** 内置 TOTP(2FA)解码:纯本地计算,密钥不出站 —— 比粘到 2fa.online 之类外站安全。 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(s: string): Uint8Array | null {
  const clean = s.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!clean || /[^A-Z2-7]/.test(clean)) return null
  let bits = 0
  let val = 0
  const out: number[] = []
  for (const c of clean) {
    val = (val << 5) | B32.indexOf(c)
    bits += 5
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return out.length ? new Uint8Array(out) : null
}

export async function totpCode(secret: string, step = 30, digits = 6): Promise<{ code: string; seconds: number } | null> {
  const key = base32Decode(secret)
  if (!key) return null
  try {
    const counter = Math.floor(Date.now() / 1000 / step)
    const buf = new ArrayBuffer(8)
    new DataView(buf).setUint32(4, counter, false)
    const ck = await crypto.subtle.importKey('raw', key.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', ck, buf))
    const off = sig[sig.length - 1] & 0x0f
    const bin = ((sig[off] & 0x7f) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3]
    const code = (bin % 10 ** digits).toString().padStart(digits, '0')
    const seconds = step - (Math.floor(Date.now() / 1000) % step)
    return { code, seconds }
  } catch {
    return null
  }
}
