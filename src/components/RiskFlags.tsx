import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { ScanFinding } from '../types/database'
import { friendly } from '../lib/errors'

const FLAG_LABEL: Record<'zh' | 'en', Record<ScanFinding['flag'], string>> = {
  zh: {
    identity_exact: '同名·同生日·同SSN后四',
    dob_ssn4: '同生日·同SSN后四·名字不同(改名嫌疑)',
    id_doc: '证件文件相同',
    contact: '联系方式相同',
    payout: '收款方式相同',
    blacklist: '命中黑名单',
  },
  en: {
    identity_exact: 'Same name · DOB · SSN-4',
    dob_ssn4: 'Same DOB · SSN-4, different name',
    id_doc: 'Same ID document',
    contact: 'Same contact',
    payout: 'Same payout',
    blacklist: 'Blacklist hit',
  },
}

const COPY = {
  zh: { loading: '风险扫描中…', clean: '✓ 未发现重复身份 / 联系 / 收款指征', banned: '已封禁', record: '黑名单记录' },
  en: { loading: 'Scanning…', clean: '✓ No duplicate identity / contact / payout signals', banned: 'Banned', record: 'Blacklist record' },
}

/** 反欺诈发现列表:红(身份/黑名单)在前,琥珀(联系/收款撞车)在后;空结果显绿。 */
export default function RiskFlags({ userId, lang, linkBase }: {
  userId: string
  lang: 'zh' | 'en'
  linkBase: string
}) {
  const t = COPY[lang]
  const [rows, setRows] = useState<ScanFinding[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setRows(null); setError(null)
    supabase.rpc('kyc_risk_scan', { p_user: userId }).then(({ data, error: e }) => {
      if (!alive) return
      if (e) { setError(friendly(e)); setRows([]); return }
      const list = (data ?? []) as ScanFinding[]
      list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1))
      setRows(list)
    })
    return () => { alive = false }
  }, [userId])

  if (error) return <p className="font-mono text-xs text-danger-text">{error}</p>
  if (rows === null) return <p className="font-mono text-xs text-faint">{t.loading}</p>
  if (rows.length === 0) return <p className="font-mono text-xs text-verified-text">{t.clean}</p>

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i}
          className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-1.5 text-xs ${
            r.severity === 'red'
              ? 'border-danger-border bg-danger-bg text-danger-text'
              : 'border-pending-border bg-pending-bg text-pending-text'
          }`}>
          <span className="font-mono text-[10px] uppercase tracking-wider">
            {r.severity === 'red' ? '● ' : '◆ '}{FLAG_LABEL[lang][r.flag]}
          </span>
          {r.matched_user ? (
            <Link to={`${linkBase}/${r.matched_user}`} className="font-medium underline underline-offset-2">
              {r.matched_name ?? r.matched_user.slice(0, 8)}
            </Link>
          ) : (
            <span className="font-medium">{r.matched_name ?? t.record}</span>
          )}
          {r.matched_banned && <span className="font-mono text-[10px] uppercase tracking-wider">[{t.banned}]</span>}
          {r.detail && <span className="break-all font-mono text-[11px] opacity-80">{r.detail}</span>}
        </div>
      ))}
    </div>
  )
}
