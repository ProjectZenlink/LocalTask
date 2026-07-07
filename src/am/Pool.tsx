import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeading, Card, Alert, Button, Input, StatusBadge } from '../components/ui'
import { Th, Td } from '../admin/bits'
import { useLang } from '../admin/i18n'
import { useAm } from './AmLayout'

interface Row {
  id: string; display_name: string | null; kyc_status: string
  open_to_work: boolean; managed_by: string | null
}

const COPY = {
  zh: { title: '人才库', sub: '全平台的 freelancer。无归属的可以认领到你名下。',
        search: '按名字搜索…', name: '姓名', kyc: 'KYC', open: '接单', owner: '归属',
        mine: '我的', owned: '已归属', claim: '认领', on: '开', off: '关', empty: '暂无数据。' },
  en: { title: 'Pool', sub: 'Every freelancer on the platform. Claim unowned ones into your roster.',
        search: 'Search by name…', name: 'Name', kyc: 'KYC', open: 'Open', owner: 'Owner',
        mine: 'Mine', owned: 'Owned', claim: 'Claim', on: 'On', off: 'Off', empty: 'Nothing yet.' },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

export default function AmPool() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { am } = useAm()
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('profiles')
      .select('id, display_name, kyc_status, open_to_work, managed_by')
      .eq('role', 'user').order('created_at', { ascending: false }).limit(300)
    if (e) { setError(e.message); return }
    setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => { void load() }, [load])

  async function claim(id: string) {
    setError(null); setBusy(id)
    const { error: e } = await supabase.rpc('claim_freelancer', { p_freelancer: id })
    setBusy(null)
    if (e) { setError(e.message); return }
    await load()
  }

  const filtered = rows.filter(r =>
    !q.trim() || (r.display_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mb-4 w-64">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} className="py-1.5 text-sm" />
      </div>
      <Card className="overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="border-b border-hair">
              <tr><Th>{t.name}</Th><Th>{t.kyc}</Th><Th>{t.open}</Th><Th>{t.owner}</Th><Th></Th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-hair last:border-b-0 hover:bg-paper">
                  <Td>{r.display_name ?? r.id.slice(0, 8)}</Td>
                  <Td><StatusBadge status={KYC_BADGE[r.kyc_status]} label={r.kyc_status} /></Td>
                  <Td className="font-mono text-xs">{r.open_to_work ? t.on : t.off}</Td>
                  <Td className="font-mono text-xs">
                    {r.managed_by === null ? '—' : r.managed_by === am?.id
                      ? <span className="text-verified-text">{t.mine}</span>
                      : <span className="text-faint">{t.owned}</span>}
                  </Td>
                  <Td>
                    {r.managed_by === null && (
                      <Button className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => void claim(r.id)}>
                        {t.claim}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
