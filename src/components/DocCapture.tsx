/** DocCapture(v86 KYC Pro 批一) —— Onfido 风格证件采集,全英(FR 面向)。
 *  流程:Open camera → 实时四角引导(mint 描线) → Shutter → 四角透视裁平
 *       → 四关质检门(边角/清晰度/眩光/分辨率) → 过关预览确认 / 未过关列原因重拍。
 *  相机被拒或无摄像头 → Upload photo 兜底(同一质检门,无旁路)。
 *  产物:onCaptured(file, quality) —— 裁平 JPEG + 指标(随提交入 kyc_submissions.quality)。 */
import { useEffect, useRef, useState } from 'react'
import { Button, Alert } from './ui'
import {
  loadOpenCV, assessCanvasQuality, evaluateGates,
  type CvNS, type DocQuality,
} from '../lib/docScan'
import type { default as jscanifyType, JscanifyCorners } from 'jscanify/client'

type Phase = 'idle' | 'loading' | 'camera' | 'review' | 'done'

export default function DocCapture({ title, hint, onCaptured }: {
  title: string
  hint?: string
  onCaptured: (file: File, quality: DocQuality) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const [quality, setQuality] = useState<DocQuality | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const reviewRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const lastTickRef = useRef(0)
  const cvRef = useRef<CvNS | null>(null)
  const scannerRef = useRef<jscanifyType | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { stopStream(); cancelAnimationFrame(rafRef.current) }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function ensureEngine() {
    if (cvRef.current && scannerRef.current) return
    const cv = await loadOpenCV()
    const mod = await import('jscanify/client')
    cvRef.current = cv
    scannerRef.current = new mod.default()
  }

  async function openCamera() {
    setError(null); setReasons([]); setPhase('loading')
    try {
      await ensureEngine()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      setPhase('camera')
      requestAnimationFrame(() => {
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        void v.play().then(() => { rafRef.current = requestAnimationFrame(guideLoop) })
      })
    } catch (err) {
      const name = (err as { name?: string } | null)?.name
      if (name === 'NotAllowedError' || name === 'NotFoundError') {
        setPhase('idle')
        setError('Camera unavailable — you can upload a photo instead.')
      } else {
        setPhase('idle')
        setError('Scanner failed to start. Check your connection and try again.')
      }
    }
  }

  /** 取景引导:约 8fps 在降采样帧上找角,叠加 mint 描线。 */
  function guideLoop(ts: number) {
    rafRef.current = requestAnimationFrame(guideLoop)
    if (ts - lastTickRef.current < 120) return
    lastTickRef.current = ts
    const v = videoRef.current, ov = overlayRef.current
    const cv = cvRef.current, scanner = scannerRef.current
    if (!v || !ov || !cv || !scanner || v.readyState < 2) return
    const scale = 480 / v.videoWidth
    const w = 480, h = Math.round(v.videoHeight * scale)
    const work = document.createElement('canvas')
    work.width = w; work.height = h
    work.getContext('2d')!.drawImage(v, 0, 0, w, h)
    let corners: JscanifyCorners | null = null
    try {
      const mat = cv.imread(work)
      try {
        const contour = scanner.findPaperContour(mat)
        if (contour) corners = scanner.getCornerPoints(contour)
      } finally { (mat as { delete: () => void }).delete() }
    } catch { corners = null }
    ov.width = v.clientWidth; ov.height = v.clientHeight
    const ctx = ov.getContext('2d')!
    ctx.clearRect(0, 0, ov.width, ov.height)
    if (corners) {
      const sx = ov.width / w, sy = ov.height / h
      const pts = [corners.topLeftCorner, corners.topRightCorner,
                   corners.bottomRightCorner, corners.bottomLeftCorner]
      ctx.strokeStyle = '#6EE7B7'; ctx.lineWidth = 3; ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((p, i) => { const x = p.x * sx, y = p.y * sy; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
      ctx.closePath(); ctx.stroke()
      ctx.fillStyle = '#6EE7B7'
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 5, 0, Math.PI * 2); ctx.fill() })
    }
  }

  /** 快门:全分辨率帧 → 找角裁平 → 质检门。 */
  function shutter() {
    const v = videoRef.current
    if (!v) return
    const frame = document.createElement('canvas')
    frame.width = v.videoWidth; frame.height = v.videoHeight
    frame.getContext('2d')!.drawImage(v, 0, 0)
    cancelAnimationFrame(rafRef.current)
    stopStream()
    void processCanvas(frame)
  }

  async function processCanvas(source: HTMLCanvasElement) {
    setPhase('loading'); setReasons([])
    try {
      await ensureEngine()
      const cv = cvRef.current!, scanner = scannerRef.current!
      let corners: JscanifyCorners | null = null
      const mat = cv.imread(source)
      try {
        const contour = scanner.findPaperContour(mat)
        if (contour) corners = scanner.getCornerPoints(contour)
      } finally { (mat as { delete: () => void }).delete() }

      let flat: HTMLCanvasElement = source
      if (corners) {
        const wTop = Math.hypot(corners.topRightCorner.x - corners.topLeftCorner.x,
                                corners.topRightCorner.y - corners.topLeftCorner.y)
        const wBot = Math.hypot(corners.bottomRightCorner.x - corners.bottomLeftCorner.x,
                                corners.bottomRightCorner.y - corners.bottomLeftCorner.y)
        const hL = Math.hypot(corners.bottomLeftCorner.x - corners.topLeftCorner.x,
                              corners.bottomLeftCorner.y - corners.topLeftCorner.y)
        const hR = Math.hypot(corners.bottomRightCorner.x - corners.topRightCorner.x,
                              corners.bottomRightCorner.y - corners.topRightCorner.y)
        const aspect = ((hL + hR) / 2) / Math.max(1, (wTop + wBot) / 2)
        const outW = Math.min(1600, Math.round(Math.max(wTop, wBot)))
        const outH = Math.round(outW * aspect)
        flat = scanner.extractPaper(source, outW, outH, corners)
      }

      const q = assessCanvasQuality(cv, flat, corners !== null)
      setQuality(q)
      const rs = evaluateGates(q)
      if (rs.length > 0) { setReasons(rs); setPhase('idle'); return }

      const rv = reviewRef.current
      setPhase('review')
      requestAnimationFrame(() => {
        const rv2 = reviewRef.current ?? rv
        if (!rv2) return
        rv2.width = flat.width; rv2.height = flat.height
        rv2.getContext('2d')!.drawImage(flat, 0, 0)
      })
    } catch {
      setPhase('idle')
      setError('Processing failed — please try again.')
    }
  }

  function onUpload(f: File | null) {
    if (!f) return
    setError(null)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(img.src)
      void processCanvas(c)
    }
    img.src = URL.createObjectURL(f)
  }

  function usePhoto() {
    const rv = reviewRef.current
    if (!rv || !quality) return
    rv.toBlob(b => {
      if (!b) return
      const file = new File([b], `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`, { type: 'image/jpeg' })
      setPhase('done')
      onCaptured(file, quality)
    }, 'image/jpeg', 0.92)
  }

  function retake() { setPhase('idle'); setReasons([]); setQuality(null) }

  return (
    <div className="rounded-2xl border border-hair bg-white p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {reasons.length > 0 && (
        <div className="mt-2 rounded-xl border border-pending-border bg-pending-bg px-3 py-2">
          {reasons.map(r => <p key={r} className="text-xs leading-relaxed text-pending-text">· {r}</p>)}
        </div>
      )}

      {phase === 'idle' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="px-4 py-2 text-sm" onClick={() => void openCamera()}>Open camera</Button>
          <Button variant="ghost" className="px-4 py-2 text-sm" onClick={() => fileRef.current?.click()}>
            Upload photo
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => onUpload(e.target.files?.[0] ?? null)} />
        </div>
      )}

      {phase === 'loading' && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-faint">
          Preparing scanner… first run may take a moment
        </p>
      )}

      {phase === 'camera' && (
        <div className="mt-3">
          <div className="relative overflow-hidden rounded-xl border border-hair bg-ink/90">
            <video ref={videoRef} playsInline muted className="block w-full" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>
          <p className="mt-2 text-xs text-muted">Fill the frame — all four corners inside, no glare.</p>
          <div className="mt-2 flex gap-2">
            <Button className="px-4 py-2 text-sm" onClick={shutter}>Capture</Button>
            <Button variant="ghost" className="px-4 py-2 text-sm"
              onClick={() => { cancelAnimationFrame(rafRef.current); stopStream(); setPhase('idle') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="mt-3">
          <canvas ref={reviewRef} className="block w-full rounded-xl border border-hair" />
          {quality && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">
              sharpness {quality.lap} · glare {(quality.glare * 100).toFixed(1)}% · {quality.minSide}px
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button className="px-4 py-2 text-sm" onClick={usePhoto}>Use photo</Button>
            <Button variant="ghost" className="px-4 py-2 text-sm" onClick={retake}>Retake</Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-verified-text">✓ Captured & checked</span>
          <button onClick={retake}
            className="font-mono text-[10px] uppercase tracking-wider text-faint transition hover:text-ink">
            Retake
          </button>
        </div>
      )}
    </div>
  )
}
