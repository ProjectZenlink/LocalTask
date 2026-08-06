/** jscanify 浏览器构建(UMD)类型声明 —— v86 KYC Pro 批一。
 *  依赖全局 window.cv(OpenCV.js);经 lib/docScan.loadOpenCV() 先行注入。 */
declare module 'jscanify/client' {
  export interface JscanifyPoint { x: number; y: number }
  export interface JscanifyCorners {
    topLeftCorner: JscanifyPoint
    topRightCorner: JscanifyPoint
    bottomLeftCorner: JscanifyPoint
    bottomRightCorner: JscanifyPoint
  }
  export default class jscanify {
    findPaperContour(mat: unknown): unknown
    getCornerPoints(contour: unknown): JscanifyCorners
    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: JscanifyCorners,
    ): HTMLCanvasElement
    highlightPaper(
      image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
      options?: { color?: string; thickness?: number },
    ): HTMLCanvasElement
  }
}
