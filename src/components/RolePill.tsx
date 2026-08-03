/** 身份药丸(v71 C5):列表行·会话头·选人弹窗三处统一。
 *  AD 深底 / AM 湖绿描边 / FR 灰 / 访客浅。 */
export default function RolePill({ role, lang }: { role: string; lang: 'zh' | 'en' }) {
  const map: Record<string, { label: string; cls: string }> = {
    admin: { label: 'AD', cls: 'border-petrol bg-petrol text-paper' },
    am: { label: 'AM', cls: 'border-petrol/50 text-petrol' },
    user: { label: 'FR', cls: 'border-hair text-muted' },
    freelancer: { label: 'FR', cls: 'border-hair text-muted' },
    lead: { label: lang === 'zh' ? '访客' : 'GUEST', cls: 'border-hair bg-paper text-faint' },
  }
  const m = map[role] ?? { label: role.toUpperCase().slice(0, 2), cls: 'border-hair text-faint' }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-mono text-[9px] leading-none uppercase tracking-wider ${m.cls}`}>
      {m.label}
    </span>
  )
}
