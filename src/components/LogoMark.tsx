/** 内联 logo(v51):不走网络请求,永不破图。湖绿圆角方 + L 字标。 */
export default function LogoMark({ className = 'h-6 w-6 rounded-md' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#244B4D" />
      <path d="M11 8 v13 h8" fill="none" stroke="#F2EFE8" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.6" cy="11" r="2" fill="#F2EFE8" />
    </svg>
  )
}
