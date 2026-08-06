/** 证件扫描内核(v86 KYC Pro 批一)
 *  · loadOpenCV:OpenCV.js 懒加载(单例 promise,仅在拍摄页触发)
 *  · warmDocScan:后台预热(只下载进 HTTP 缓存、不执行;省流/2G 自动跳过)
 *  · assessCanvasQuality + evaluateGates:四关质检门
 *      ①四角齐(由调用方传入) ②Laplacian 清晰度 ③高光眩光占比 ④最短边分辨率
 *  阈值 GATES 为首发保守值,待真机标定后调优(宪法记录)。 */


// —— OpenCV 全局命名空间(最小类型面) ——
export interface CvNS {
  Mat: new () => CvMat
  imread: (src: HTMLCanvasElement | HTMLImageElement) => CvMat
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void
  Laplacian: (src: CvMat, dst: CvMat, ddepth: number) => void
  meanStdDev: (src: CvMat, mean: CvMat, stddev: CvMat) => void
  threshold: (src: CvMat, dst: CvMat, thresh: number, maxval: number, type: number) => void
  countNonZero: (src: CvMat) => number
  COLOR_RGBA2GRAY: number
  CV_64F: number
  THRESH_BINARY: number
}
export interface CvMat {
  delete: () => void
  doubleAt: (row: number, col: number) => number
  rows: number
  cols: number
}



let cvPromise: Promise<CvNS> | null = null

/** 自托管加载(v88):引擎打进本站构建,走 localtask 自有域名 —— 无第三方 CDN 依赖。
 *  @techstark/opencv-js 默认导出为 thenable,await 即得命名空间。 */
export function loadOpenCV(): Promise<CvNS> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js')
      .then(async m => (await (m.default as unknown as PromiseLike<unknown>)) as CvNS)
      .catch(err => { cvPromise = null; throw err })
  }
  return cvPromise
}

/** 后台预热:把 wasm 拉进浏览器缓存(不执行,零 CPU)。注册后空闲时调用。 */
export function warmDocScan(): void {
  try {
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && /2g/.test(conn.effectiveType)) return
    const go = () => { void loadOpenCV().catch(() => {}) }
    const ric = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    if (ric) ric(go)
    else window.setTimeout(go, 2500)
  } catch { /* 预热失败无碍主流程 */ }
}

// —— 质检 ——
export interface DocQuality {
  cornersFound: boolean
  lap: number      // Laplacian 方差(越高越锐)
  glare: number    // 高光像素占比 0–1
  minSide: number  // 裁后最短边像素
}

export const GATES = {
  lapMin: 60,      // 首发保守阈值,真机标定后调优
  glareMax: 0.06,
  minSideMin: 900,
} as const

/** 对(已裁平的)画布计算清晰度/眩光/分辨率三指标。 */
export function assessCanvasQuality(cv: CvNS, canvas: HTMLCanvasElement, cornersFound: boolean): DocQuality {
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const lapM = new cv.Mat()
  const mean = new cv.Mat()
  const stddev = new cv.Mat()
  const bin = new cv.Mat()
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.Laplacian(gray, lapM, cv.CV_64F)
    cv.meanStdDev(lapM, mean, stddev)
    const sd = stddev.doubleAt(0, 0)
    const lap = sd * sd
    cv.threshold(gray, bin, 245, 255, cv.THRESH_BINARY)
    const glare = cv.countNonZero(bin) / (gray.rows * gray.cols)
    const minSide = Math.min(canvas.width, canvas.height)
    return { cornersFound, lap: Math.round(lap * 10) / 10, glare: Math.round(glare * 1000) / 1000, minSide }
  } finally {
    src.delete(); gray.delete(); lapM.delete(); mean.delete(); stddev.delete(); bin.delete()
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
