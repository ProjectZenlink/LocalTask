/** 证件扫描内核 v89 —— 引擎换装 scanic(Rust WASM + GPU 变形,~10ms 级,gzip <100KB)。
 *  jscanify + OpenCV.js(15.5MB) 全退役;质检门改纯 JS 实现(几毫秒级)。
 *  · getScanner:scanic Scanner 单例(持久 WASM 实例,webcam 推荐路径)
 *  · warmDocScan:空闲预热(省流/2G 跳过;引擎仅 ~100KB,秒热)
 *  · assessCanvasQuality + evaluateGates:四关质检门(纯 JS)
 *  阈值 GATES 为保守首发值,真机标定后调优(宪法记录)。 */
import type { Scanner as ScanicScanner } from 'scanic'

let scannerPromise: Promise<ScanicScanner> | null = null

/** scanic 扫描器单例:动态导入 + initialize 预编译 WASM。 */
export function getScanner(): Promise<ScanicScanner> {
  if (!scannerPromise) {
    scannerPromise = import('scanic')
      .then(async m => {
        const s = new m.Scanner()
        await s.initialize()
        return s
      })
      .catch(err => { scannerPromise = null; throw err })
  }
  return scannerPromise
}

/** 后台预热:空闲期把引擎装载完毕(仅 ~100KB)。 */
export function warmDocScan(): void {
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && /2g/.test(conn.effectiveType)) return
    const go = () => { void getScanner().catch(() => {}) }
    const ric = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    if (ric) ric(go)
    else window.setTimeout(go, 2500)
  } catch { /* 预热失败无碍主流程 */ }
}

// —— 质检(纯 JS) ——
export interface DocQuality {
  cornersFound: boolean
  lap: number      // Laplacian 方差(越高越锐)
  glare: number    // 高光像素占比 0–1
  minSide: number  // 裁后最短边像素
}

export const GATES = {
  lapMin: 60,      // 保守首发,待真机标定
  glareMax: 0.06,
  minSideMin: 900,
} as const

/** 灰度 + 4 邻域 Laplacian 方差 + 高光占比,在 ≤640 降采样上计算(几毫秒)。 */
export function assessCanvasQuality(canvas: HTMLCanvasElement, cornersFound: boolean): DocQuality {
  const minSide = Math.min(canvas.width, canvas.height)
  const scale = Math.min(1, 640 / Math.max(canvas.width, canvas.height))
  const w = Math.max(2, Math.round(canvas.width * scale))
  const h = Math.max(2, Math.round(canvas.height * scale))
  const work = document.createElement('canvas')
  work.width = w; work.height = h
  const ctx = work.getContext('2d')!
  ctx.drawImage(canvas, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  let glareCount = 0
  for (let i = 0; i < w * h; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    gray[i] = g
    if (g >= 245) glareCount++
  }
  const glare = glareCount / (w * h)

  // 4 邻域 Laplacian:lap = 4c − 上 − 下 − 左 − 右;取响应方差
  let sum = 0, sumSq = 0
  const n = (w - 2) * (h - 2)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      sum += v; sumSq += v * v
    }
  }
  const mean = sum / n
  const lap = sumSq / n - mean * mean

  return {
    cornersFound,
    lap: Math.round(lap * 10) / 10,
    glare: Math.round(glare * 1000) / 1000,
    minSide,
  }
}

/** 四关判定 → 未过关原因(英文,FR 面向)。空数组 = 放行。 */
export function evaluateGates(q: DocQuality): string[] {
  const reasons: string[] = []
  if (!q.cornersFound) reasons.push('Document edges not detected — fill the frame with all four corners.')
  if (q.lap < GATES.lapMin) reasons.push('Image looks blurry — hold steady and tap to refocus.')
  if (q.glare > GATES.glareMax) reasons.push('Too much glare — tilt the document away from direct light.')
  if (q.minSide < GATES.minSideMin) reasons.push('Resolution too low — move the camera closer.')
  return reasons
}
