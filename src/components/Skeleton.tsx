/** v49 骨架屏:呼吸微光,替代"加载中…"文字。 */
export function SkeletonLine({ w = 'w-full', h = 'h-3.5', className = '' }: { w?: string; h?: string; className?: string }) {
  return <div className={`skl ${w} ${h} ${className}`} />
}
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="mb-5 rounded-2xl border border-hair bg-surface p-5">
      <SkeletonLine w="w-24" h="h-2.5" className="mb-3" />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} w={i === lines - 1 ? 'w-2/3' : 'w-full'} className="mb-2 last:mb-0" />
      ))}
    </div>
  )
}
export function SkeletonPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <SkeletonLine w="w-32" h="h-7" className="mb-2" />
      <SkeletonLine w="w-56" h="h-3" className="mb-6" />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
    </div>
  )
}
