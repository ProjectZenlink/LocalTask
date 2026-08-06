/** DocCapture v89 —— scanic 引擎版(Rust WASM,~10ms/帧):Onfido 级跟手描线。
 *  流程:Open camera → 实时四角引导(~12fps mint 描线) → Shutter → GPU 透视裁平
 *       → 四关质检门 → 过关预览确认 / 未过关列原因重拍。
 *  相机被拒 → Upload photo 兜底(同一质检门,无旁路)。
 *  产物:onCaptured(file, quality)。 */
import { useEffect, useRef, useState } from 'react'
import { Button, Alert } from './ui'
import { getScanner, assessCanvasQuality, evaluateGates, type DocQuality } from '../lib/docScan'
import type { Scanner as ScanicScanner, CornerPoints } from 'scanic'

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
  const busyRef = useRef(false)
  const scannerRef = useRef<ScanicScanner | null>(null)
  const workRef = useRef<HTMLCanvasElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { stopStream(); cancelAnimationFrame(rafRef.current) }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function ensureEngine() {
    if (!scannerRef.current) scannerRef.current = await getScanner()
  }

  async function openCamera() {
    setError(null); setReasons([]); setPhase('loading')
    try {
      await ensureEngine()
    } catch {
      setPhase('idle')
      setError('Scanner engine failed to load — tap Open camera to retry, or use Upload photo.')
      return
    }
    try {
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
      setPhase('idle')
      setError(name === 'NotAllowedError' || name === 'NotFoundError'
        ? 'Camera unavailable — you can upload a photo instead.'
        : 'Camera failed to start — try again or use Upload photo.')
    }
  }

  /** 取景引导:~12fps 在 480px 降采样帧上找角(scanic ~10ms 级),mint 描线。 */
  function guideLoop(ts: number) {
    rafRef.current = requestAnimationFrame(guideLoop)
    if (ts - lastTickRef.current < 80 || busyRef.current) return
    lastTickRef.current = ts
    const v = videoRef.current, ov = overlayRef.current, scanner = scannerRef.current
    if (!v || !ov || !scanner || v.readyState < 2) return
    const scale = 480 / v.videoWidth
    const w = 480, h = Math.round(v.videoHeight * scale)
    let work = workRef.current
    if (!work || work.width !== w || work.height !== h) {
      work = document.createElement('canvas')
      work.width = w; work.height = h
      workRef.current = work
    }
    work.getContext('2d')!.drawImage(v, 0, 0, w, h)
    busyRef.current = true
    scanner.scan(work, { mode: 'detect', maxProcessingDimension: 480 })
      .then(res => {
        const corners = res.success ? res.corners : null
        drawGuide(ov, v, corners, w, h)
      })
      .catch(() => { /* 单帧失败忽略 */ })
      .finally(() => { busyRef.current = false })
  }

  function drawGuide(ov: HTMLCanvasElement, v: HTMLVideoElement,
    corners: CornerPoints | null, srcW: number, srcH: number) {
    ov.width = v.clientWidth; ov.height = v.clientHeight
    const ctx = ov.getContext('2d')!
    ctx.clearRect(0, 0, ov.width, ov.height)
    if (!corners) return
    const sx = ov.width / srcW, sy = ov.height / srcH
    const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
    ctx.strokeStyle = '#6EE7B7'; ctx.lineWidth = 3; ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => { const x = p.x * sx, y = p.y * sy; i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.closePath(); ctx.stroke()
    ctx.fillStyle = '#6EE7B7'
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 5, 0, Math.PI * 2); ctx.fill() })
  }

  /** 快门:全分辨率帧 → scanic GPU 裁平 → 质检门。 */
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
    } catch {
      setPhase('idle')
      setError('Scanner engine failed to load — tap Open camera to retry, or use Upload photo.')
      return
    }
    try {
      const scanner = scannerRef.current!
      const res = await scanner.scan(source, {
        mode: 'extract', output: 'canvas', maxProcessingDimension: 1000,
      })
      const ok = res.success && res.output instanceof HTMLCanvasElement
      const flat: HTMLCanvasElement = ok ? (res.output as HTMLCanvasElement) : source

      const q = assessCanvasQuality(flat, ok)
      setQuality(q)
      const rs = evaluateGates(q)
      if (rs.length > 0) { setReasons(rs); setPhase('idle'); return }

      setPhase('review')
      requestAnimationFrame(() => {
        const rv = reviewRef.current
        if (!rv) return
        rv.width = flat.width; rv.height = flat.height
        rv.getContext('2d')!.drawImage(flat, 0, 0)
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
          Preparing scanner…
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
