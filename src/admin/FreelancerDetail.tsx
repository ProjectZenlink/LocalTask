import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profile, PoolRow, Rating } from '../types/database'
import { payoutLabel } from '../types/database'
import { dateShort, dateTimeShort, waLink, tgLink, xLink } from '../lib/format'
import { PageHeading, Card, Button, Alert, StatusBadge, SectionTitle } from '../components/ui'
import { KV, ConfirmDialog } from './bits'
import { useLang } from './i18n'

interface KycSub {
  id: string
  status: string
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}
interface DocLink { submission_id: string | null; doc_type: string; url: string }
interface RatingRow extends Rating { task: { title: string } | null }
interface StrikeRow { id: string; reason: string; created_at: string; task: { title: string } | null }

const COPY = {
  zh: {
    back: '← 人才池', notFound: '未找到该 freelancer',
    basics: '基本资料', legal: '法定姓名', dob: '出生日期', addr: '地址', ssn: 'SSN 尾号', joined: '注册',
    contact: '联系方式', wallet: '收款钱包', noWallet: '未设置',
    load: '负载与评分', active: '活跃任务', done: '已完成', qsa: '质 / 速 / 态(均分)', strikes: 'Strikes',
    kyc: 'KYC 材料', kycEmpty: '没有提交记录。', submitted: '提交于', reviewed: '审核于', reason: '驳回原因:',
    ratings: '评分历史(freelancer 不可见)', ratingsEmpty: '还没有评分。',
    strikesT: 'Strike 记录', strikesEmpty: '没有 strike。',
    pause: '暂停', resume: '恢复', block: '封禁', unblock: '解封',
    paused: '已暂停', blocked: '已封禁', open: '开着接单', closed: '未开接单',
    blockQ: '封禁是给欺诈用的,可靠性问题请用「暂停」。确认永久封禁?', confirmBlock: '确认封禁', dlgCancel: '取消',
  },
  en: {
    back: '← Pool', notFound: 'Freelancer not found',
    basics: 'Basics', legal: 'Legal name', dob: 'Date of birth', addr: 'Address', ssn: 'SSN last 4', joined: 'Joined',
    contact: 'Contact', wallet: 'Payout wallet', noWallet: 'Not set',
    load: 'Load & ratings', active: 'Active tasks', done: 'Completed', qsa: 'Q / S / A (avg)', strikes: 'Strikes',
    kyc: 'KYC documents', kycEmpty: 'No submissions.', submitted: 'Submitted', reviewed: 'Reviewed', reason: 'Rejection:',
    ratings: 'Rating history (never visible to freelancer)', ratingsEmpty: 'No ratings yet.',
    strikesT: 'Strikes', strikesEmpty: 'No strikes.',
    pause: 'Pause', resume: 'Resume', block: 'Block', unblock: 'Unblock',
    paused: 'Paused', blocked: 'Blocked', open: 'Open to work', closed: 'Not open',
    blockQ: 'Blocking is for fraud — use Pause for reliability issues. Block permanently?', confirmBlock: 'Block', dlgCancel: 'Cancel',
  },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

export default function FreelancerDetail() {
  const { lang } = useLang()
  const t = COPY[lang]
  const { id } = useParams<{ id: string }>()

  const [p, setP] = useState<Profile | null>(null)
  const [pool, setPool] = useState<PoolRow | null>(null)
  const [ssn4, setSsn4] = useState<string | null>(null)
  const [subs, setSubs] = useState<KycSub[]>([])
  const [docs, setDocs] = useState<DocLink[]>([])
  const [ratings, setRatings] = useState<RatingRow[]>([])
  const [strikes, setStrikes] = useState<StrikeRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [pr, po, ss, ks, rt, st] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('freelancer_pool').select('*').eq('id', id).maybeSingle(),
      supabase.from('kyc_ssn').select('ssn_last4').eq('user_id', id).maybeSingle(),
      supabase.from('kyc_submissions').select('id, status, rejection_reason, created_at, reviewed_at')
        .eq('user_id', id).order('created_at', { ascending: false }),
      supabase.from('ratings').select('*, task:tasks(title)').eq('freelancer_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('strikes').select('id, reason, created_at, task:tasks(title)').eq('freelancer_id', id)
        .order('created_at', { ascending: false }),
    ])
    if (pr.error) { setError(pr.error.message); setLoaded(true); return }
    setP((pr.data ?? null) as Profile | null)
    setPool((po.data ?? null) as PoolRow | null)
    setSsn4((ss.data as { ssn_last4: string | null } | null)?.ssn_last4 ?? null)
    setSubs((ks.data ?? []) as KycSub[])
    setRatings((rt.data ?? []) as unknown as RatingRow[])
    setStrikes((st.data ?? []) as unknown as StrikeRow[])
    setLoaded(true)

    // 签名全部 KYC 文件(按提交单分组展示)
    const { data: dd } = await supabase.from('kyc_documents')
      .select('submission_id, doc_type, storage_path').eq('user_id', id)
    const links: DocLink[] = []
    for (const d of dd ?? []) {
      const { data: signed } = await supabase.storage.from('kyc-documents').createSignedUrl(d.storage_path, 3600)
      if (signed?.signedUrl) links.push({ submission_id: d.submission_id, doc_type: d.doc_type, url: signed.signedUrl })
    }
    setDocs(links)
  }, [id])

  useEffect(() => { void load() }, [load])

  async function setFlags(patch: { is_suspended?: boolean; is_banned?: boolean }) {
    if (!id) return
    setError(null)
    const { error: e } = await supabase.from('profiles').update(patch).eq('id', id)
    if (e) { setError(e.message); return }
    await load()
  }

  if (!loaded) return <p className="text-muted">…</p>
  if (!p) return <PageHeading>{t.notFound}</PageHeading>

  const name = p.display_name ?? p.id.slice(0, 8)
  const addrLine = [p.address, p.city, p.state, p.address_zip].filter(Boolean).join(', ') || '—'

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/admin/pool" className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{name}</h1>
          <StatusBadge status={KYC_BADGE[p.kyc_status]} label={p.kyc_status} />
          {p.is_banned && <StatusBadge status="unverified" label={t.blocked} />}
          {p.is_suspended && !p.is_banned && <StatusBadge status="pending" label={t.paused} />}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setFlags({ is_suspended: !p.is_suspended })}>
            {p.is_suspended ? t.resume : t.pause}
          </Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => {
            if (p.is_banned) { void setFlags({ is_banned: false }); return }
            setAsking(true)
          }}>
            {p.is_banned ? t.unblock : t.block}
          </Button>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="mb-5 p-5">
        <SectionTitle>{t.basics}</SectionTitle>
        <KV k={t.legal}>{p.full_name ?? '—'}</KV>
        <KV k={t.dob}>{p.date_of_birth ?? '—'}</KV>
        <KV k={t.addr}>{addrLine}</KV>
        <KV k={t.ssn}><span className="font-mono">••••{ssn4 ?? '????'}</span></KV>
        <KV k={t.joined}>{dateShort(p.created_at)} · {p.open_to_work ? t.open : t.closed}</KV>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>{t.contact}</SectionTitle>
          <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
            {p.contact_whatsapp && <a className="text-petrol underline underline-offset-2" href={waLink(p.contact_whatsapp)} target="_blank" rel="noreferrer">WA {p.contact_whatsapp}</a>}
            {p.contact_telegram && <a className="text-petrol underline underline-offset-2" href={tgLink(p.contact_telegram)} target="_blank" rel="noreferrer">TG {p.contact_telegram}</a>}
            {p.contact_x && <a className="text-petrol underline underline-offset-2" href={xLink(p.contact_x)} target="_blank" rel="noreferrer">X {p.contact_x}</a>}
            {!p.contact_whatsapp && !p.contact_telegram && !p.contact_x && <span className="text-faint">—</span>}
          </p>
          <div className="mt-4 border-t border-hair pt-3">
            <SectionTitle>{t.wallet}</SectionTitle>
            {p.payout_address && p.payout_network && p.payout_token ? (
              <>
                <p className="font-mono text-xs text-ink">{payoutLabel(p.payout_network, p.payout_token)}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted">{p.payout_address}</p>
              </>
            ) : <p className="text-sm text-faint">{t.noWallet}</p>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>{t.load}</SectionTitle>
          <KV k={t.active}><span className="font-mono">{pool?.active_tasks ?? 0}</span></KV>
          <KV k={t.done}><span className="font-mono">{pool?.completed_tasks ?? 0}</span></KV>
          <KV k={t.qsa}><span className="font-mono">{pool?.avg_quality ?? '–'} / {pool?.avg_speed ?? '–'} / {pool?.avg_attitude ?? '–'}</span></KV>
          <KV k={t.strikes}><span className="font-mono">{pool?.strikes_count ?? 0}</span></KV>
        </Card>
      </div>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.kyc}</SectionTitle>
        {subs.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.kycEmpty}</p>
        ) : subs.map(s => {
          const mine = docs.filter(d => d.submission_id === s.id)
          return (
            <div key={s.id} className="border-b border-hair py-3 last:border-b-0">
              <p className="font-mono text-xs text-muted">
                {t.submitted} {dateTimeShort(s.created_at)} · {s.status}
                {s.reviewed_at && <> · {t.reviewed} {dateShort(s.reviewed_at)}</>}
              </p>
              {s.rejection_reason && <p className="mt-1 text-sm text-danger-text">{t.reason} {s.rejection_reason}</p>}
              {mine.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {mine.map(d => (
                    <a key={d.doc_type + d.url} href={d.url} target="_blank" rel="noreferrer" className="block">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">{d.doc_type.replace(/_/g, ' ')}</p>
                      <img src={d.url} alt={d.doc_type} className="h-24 w-full rounded-lg border border-hair object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.ratings}</SectionTitle>
        {ratings.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.ratingsEmpty}</p>
        ) : ratings.map(r => (
          <div key={r.id} className="flex items-baseline justify-between gap-3 border-b border-hair py-2.5 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{r.task?.title ?? '—'}</p>
              {r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}
            </div>
            <p className="shrink-0 font-mono text-xs text-ink">{r.quality} / {r.speed} / {r.attitude} · {dateShort(r.created_at)}</p>
          </div>
        ))}
      </Card>

      <Card className="p-5">
        <SectionTitle>{t.strikesT}</SectionTitle>
        {strikes.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.strikesEmpty}</p>
        ) : strikes.map(s => (
          <div key={s.id} className="border-b border-hair py-2.5 last:border-b-0">
            <p className="text-sm text-ink">{s.reason}</p>
            <p className="mt-0.5 font-mono text-xs text-faint">{s.task?.title ? `${s.task.title} · ` : ''}{dateShort(s.created_at)}</p>
          </div>
        ))}
      </Card>

      <ConfirmDialog
        open={asking}
        title={t.block}
        hint={t.blockQ}
        confirmLabel={t.confirmBlock}
        cancelLabel={t.dlgCancel}
        onConfirm={() => { setAsking(false); void setFlags({ is_banned: true }) }}
        onClose={() => setAsking(false)}
      />
    </div>
  )
}
