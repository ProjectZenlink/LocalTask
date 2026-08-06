/** MRZ 内核(v87 KYC Pro 批二) —— 护照机读码验真,全端内运行。
 *  · loadTesseract:Tesseract.js v5 CDN 注入(单例;与 OpenCV 同管道) + warmMrz 预热
 *  · extractMrzText:对已裁平护照画布取底部区带,OpenCV 灰度增强后 OCR(白名单字符)
 *  · parseTD3 + ICAO 7-3-1 校验位:docNo/dob/expiry/personal/composite 五位全验
 *  · compareWithProfile:MRZ 字段 ↔ KYC 资料自动比对,不一致列给 AM(不自动拒,决策③)
 *  失败静默降级:MRZ 不通过不拦提交,只作标记 —— 审核端红黄徽章人裁。 */

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'

// —— Tesseract 最小类型面(CDN 全局) ——
interface TessWorker {
  setParameters: (p: Record<string, string>) => Promise<unknown>
  recognize: (img: string) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}
interface TessNS { createWorker: (lang: string) => Promise<TessWorker> }
declare global { interface Window { Tesseract?: TessNS } }

let tessPromise: Promise<TessNS> | null = null

export function loadTesseract(): Promise<TessNS> {
  if (tessPromise) return tessPromise
  tessPromise = new Promise<TessNS>((resolve, reject) => {
    if (window.Tesseract) { resolve(window.Tesseract); return }
    const s = document.createElement('script')
    s.src = TESSERACT_URL
    s.async = true
    s.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract)
      else reject(new Error('tesseract_missing'))
    }
    s.onerror = () => { tessPromise = null; reject(new Error('tesseract_load_failed')) }
    document.head.appendChild(s)
    window.setTimeout(() => reject(new Error('tesseract_timeout')), 60_000)
  })
  return tessPromise
}

/** 预热:仅把主脚本拉进缓存(worker/core/语言包由库内部按需取,首跑仍最快化)。 */
export function warmMrz(): void {
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && /2g/.test(conn.effectiveType)) return
    const go = () => { void fetch(TESSERACT_URL, { cache: 'force-cache', mode: 'no-cors' }).catch(() => {}) }
    const ric = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    if (ric) ric(go)
    else window.setTimeout(go, 3500)
  } catch { /* 预热失败无碍 */ }
}

// —— OCR:底部区带增强后识别 ——
export async function extractMrzText(flat: HTMLCanvasElement): Promise<string> {
  // TD3 机读区在护照照片页底部;取底 32% 高、放大 2 倍提升 OCR 命中
  const zoneH = Math.round(flat.height * 0.32)
  const zone = document.createElement('canvas')
  zone.width = flat.width * 2
  zone.height = zoneH * 2
  const zctx = zone.getContext('2d')!
  zctx.imageSmoothingEnabled = true
  zctx.drawImage(flat, 0, flat.height - zoneH, flat.width, zoneH, 0, 0, zone.width, zone.height)

  // 灰度化(纯 JS):提升 OCR 对比一致性
  const gimg = zctx.getImageData(0, 0, zone.width, zone.height)
  const gd = gimg.data
  for (let i = 0; i < gd.length; i += 4) {
    const g = 0.299 * gd[i] + 0.587 * gd[i + 1] + 0.114 * gd[i + 2]
    gd[i] = g; gd[i + 1] = g; gd[i + 2] = g
  }
  zctx.putImageData(gimg, 0, 0)

  const T = await loadTesseract()
  const worker = await T.createWorker('eng')
  try {
    await worker.setParameters({
      tessedit_char_whitelist: MRZ_CHARS,
      preserve_interword_spaces: '0',
    })
    const { data } = await worker.recognize(zone.toDataURL('image/png'))
    return data.text ?? ''
  } finally {
    void worker.terminate()
  }
}

// —— TD3 解析与校验 ——
export interface MrzResult {
  found: boolean
  valid: boolean
  fields: {
    docNo: string; surname: string; given: string
    nationality: string; dob: string; expiry: string; sex: string
  } | null
  checks: { docNo: boolean; dob: boolean; expiry: boolean; personal: boolean; composite: boolean } | null
  mismatches: string[]
  raw: string
}

const CHAR_VAL: Record<string, number> = {}
for (let i = 0; i < 10; i++) CHAR_VAL[String(i)] = i
for (let i = 0; i < 26; i++) CHAR_VAL[String.fromCharCode(65 + i)] = 10 + i
CHAR_VAL['<'] = 0

function checkDigit(s: string): number {
  const w = [7, 3, 1]
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += (CHAR_VAL[s[i]] ?? 0) * w[i % 3]
  return sum % 10
}
const cdOk = (data: string, cd: string) => /\d/.test(cd) && checkDigit(data) === Number(cd)

/** 数字位 OCR 常见混淆矫正(仅用于应为数字的位段)。 */
const fixDigits = (s: string) =>
  s.replace(/O/g, '0').replace(/Q/g, '0').replace(/I/g, '1').replace(/L/g, '1')
   .replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8')

export function parseTD3(rawText: string): MrzResult {
  const none: MrzResult = { found: false, valid: false, fields: null, checks: null, mismatches: [], raw: rawText }
  const lines = rawText.toUpperCase().split(/\n+/)
    .map(l => l.replace(/[^A-Z0-9<]/g, ''))
    .filter(l => l.length >= 40 && l.includes('<'))
    .map(l => (l + '<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<').slice(0, 44))
  const l1 = lines.find(l => l.startsWith('P'))
  const l2i = lines.findIndex(l => !l.startsWith('P') && /\d/.test(l.slice(0, 10)))
  const l2 = l2i >= 0 ? lines[l2i] : undefined
  if (!l1 || !l2) return none

  const names = l1.slice(5).split('<<')
  const surname = (names[0] ?? '').replace(/</g, ' ').trim()
  const given = (names[1] ?? '').replace(/</g, ' ').trim()

  const docNo = l2.slice(0, 9)
  const docCd = fixDigits(l2[9] ?? '')
  const nationality = l2.slice(10, 13).replace(/</g, '')
  const dob = fixDigits(l2.slice(13, 19))
  const dobCd = fixDigits(l2[19] ?? '')
  const sex = l2[20] ?? '<'
  const expiry = fixDigits(l2.slice(21, 27))
  const expCd = fixDigits(l2[27] ?? '')
  const personal = l2.slice(28, 42)
  const perCd = fixDigits(l2[42] ?? '')
  const finalCd = fixDigits(l2[43] ?? '')

  const checks = {
    docNo: cdOk(docNo, docCd),
    dob: cdOk(dob, dobCd),
    expiry: cdOk(expiry, expCd),
    personal: perCd === '0' && personal.replace(/</g, '') === ''
      ? true
      : cdOk(personal, perCd),
    composite: cdOk(
      docNo + docCd + l2.slice(10, 13) + dob + dobCd + sex + expiry + expCd + personal + perCd,
      finalCd,
    ),
  }
  const valid = checks.docNo && checks.dob && checks.expiry && checks.composite
  return {
    found: true, valid,
    fields: { docNo: docNo.replace(/</g, ''), surname, given, nationality, dob, expiry, sex },
    checks, mismatches: [], raw: rawText,
  }
}

/** MRZ ↔ KYC 资料比对:姓名(令牌子集)与生日(YYMMDD)。产出不一致标签给 AM。 */
export function compareWithProfile(
  r: MrzResult,
  profile: { full_name?: string | null; date_of_birth?: string | null },
): MrzResult {
  if (!r.found || !r.fields) return r
  const mismatches: string[] = []
  const pf = (profile.full_name ?? '').toUpperCase().replace(/[^A-Z ]/g, ' ')
  if (pf.trim()) {
    const tokens = new Set(pf.split(/\s+/).filter(Boolean))
    const mrzTokens = (r.fields.surname + ' ' + r.fields.given).split(/\s+/).filter(Boolean)
    const hit = mrzTokens.filter(t => tokens.has(t)).length
    if (hit < Math.min(2, mrzTokens.length)) mismatches.push('name')
  }
  const dobIso = profile.date_of_birth ?? ''
  if (/^\d{4}-\d{2}-\d{2}/.test(dobIso)) {
    const yymmdd = dobIso.slice(2, 4) + dobIso.slice(5, 7) + dobIso.slice(8, 10)
    if (r.fields.dob !== yymmdd) mismatches.push('date of birth')
  }
  return { ...r, mismatches }
}
