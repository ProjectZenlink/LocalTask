import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../admin/i18n'
import { PageHeading, Card, Button, Alert, StatusBadge, SectionTitle } from './ui'
import { onWorkline, pingWorkline } from '../lib/workline'
import { SITE_URL } from '../lib/site'
import { dateShort } from '../lib/format'
import { isClaimable, LEAD_CLAIM_MINUTES, LEAD_STATUS_META } from '../lib/leads'
import type { Lead, LeadStatus } from '../types/database'

/** 线索工作台(v62):AD/AM 共用组件(改一次双生效),仅 admin 多出「改派」。
 *  上半区 = 线索认领池(status=new·无首答·无归属或分配超 3 分钟,惰性判定无定时任务);
 *  下半区 = 线索列表(AM 看名下,admin 看全部):状态流转 + 专属注册链接 + 进入对话。
 *  实时机制照搬 v59/v60:切页 + 30s 轮询 + 回焦 + workline 即时刷新。 */

type Row = Lead & { am: { id: string; name: string } | null }

const COPY = {
  zh: {
    title: '线索', sub: '公开引导页(/join)进来的访客:认领、沟通、发注册链接、转化。',
    pool: '线索认领池', poolHint: `新线索 ${LEAD_CLAIM_MINUTES} 分钟未获首次回复即进入认领池,先到先得。`,
    poolEmpty: '暂无可认领线索。', mine: '我的线索', all: '全部线索', listEmpty: '还没有线索。',
    claim: '认领', chat: '对话', copyLink: '注册链接', copied: '已复制',
    filterAll: '全部', noReply: '未回', owner: '归属', unowned: '无归属',
    waited: (m: number) => `等待 ${m} 分钟`, assign: '改派给…',
    copyManual: '复制失败,请手动复制:',
  },
  en: {
    title: 'Leads', sub: 'Visitors from the public Join page: claim, chat, send signup links, convert.',
    pool: 'Claim pool', poolHint: `New leads with no first reply within ${LEAD_CLAIM_MINUTES} minutes land here — first come, first served.`,
    poolEmpty: 'Nothing to claim right now.', mine: 'My leads', all: 'All leads', listEmpty: 'No leads yet.',
    claim: 'Claim', chat: 'Chat', copyLink: 'Signup link', copied: 'Copied',
    filterAll: 'All', noReply: 'No reply', owner: 'Owner', unowned: 'Unassigned',
    waited: (m: number) => `waiting ${m}m`, assign: 'Reassign to…',
    copyManual: 'Copy failed — copy manually:',
  },
}

export default function LeadsDesk({ isAdmin, amId }: { isAdmin: boolean; amId: string | null }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [rows, setRows] = useState<Row[]>([])
  const [ams, setAms] = useState<{ id: string; name: string }[]>([])
  const [pill, setPill] = useState<'all' | LeadStatus>('all')
  const [copied, setCopied] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const q = supabase.from('leads')
      .select('*, am:account_managers!assigned_am(id, name)')
      .order('created_at', { ascending: false }).limit(300)
    const [ld, am] = await Promise.all([
      q,
      isAdmin
        ? supabase.from('account_managers').select('id, name').eq('is_active', true).order('name')
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    setRows((ld.data ?? []) as Row[])
    setAms((am.data ?? []) as { id: string; name: string }[])
  }, [isAdmin])

  useEffect(() => { void load() }, [load, pathname])
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30_000)
    const onWake = () => { if (document.visibilityState === 'visible') void load() }
    const offWorkline = onWorkline(() => void load())
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      window.clearInterval(timer)
      offWorkline()
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [load])

  const pool = rows.filter(l => isClaimable(l) && (isAdmin || l.assigned_am !== amId))
  const list = (isAdmin ? rows : rows.filter(l => l.assigned_am === amId))
    .filter(l => pill === 'all' || l.status === pill)

  const waitedMin = (l: Row) =>
    Math.max(0, Math.floor((Date.now() - new Date(l.assigned_at ?? l.created_at).getTime()) / 60_000))

  async function copyText(key: string, text: string) {
    try { await navigator.clipboard.writeText(text) } catch { window.prompt(t.copyManual, text) }
    setCopied(key)
    window.setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
  }

  async function claim(l: Row) {
    setError(null); setBusyId(l.id)
    const { error: e } = await supabase.rpc('claim_lead', { p_lead: l.id })
    setBusyId(null)
    if (e) { setError(e.message); return }
    pingWorkline(); await load()
  }

  async function setStatus(l: Row, s: string) {
    setError(null)
    const { error: e } = await supabase.rpc('lead_set_status', { p_lead: l.id, p_status: s })
    if (e) { setError(e.message); return }
    pingWorkline(); await load()
  }

  async function reassign(l: Row, am: string) {
    if (!am) return
    setError(null)
    const { error: e } = await supabase.rpc('admin_assign_lead', { p_lead: l.id, p_am: am })
    if (e) { setError(e.message); return }
    pingWorkline(); await load()
  }

  async function openChat(l: Row) {
    if (!l.profile_id) return
    setError(null)
    const { error: e } = await supabase.rpc('open_conversation', { p_other: l.profile_id })
    if (e) { setError(e.message); return }
    navigate(isAdmin ? '/admin/messages' : '/am/messages')
  }

  const pillCls = (on: boolean) =>
    `rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide transition ${
      on ? 'border-petrol bg-petrol text-paper' : 'border-hair text-muted hover:text-ink'
    }`

  return (
    <div>
      <PageHeading sub={t.sub}>{t.title}</PageHeading>
      {error && <Alert tone="error">{error}</Alert>}

      {/* 认领池 */}
      <SectionTitle>{t.pool}</SectionTitle>
      <p className="mb-3 text-xs text-muted">{t.poolHint}</p>
      <Card className="mb-8 p-0">
        {pool.length === 0 && <p className="px-5 py-6 text-sm text-faint">{t.poolEmpty}</p>}
        {pool.map(l => (
          <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair px-5 py-3.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{l.full_name}</p>
              <p className="mt-0.5 font-mono text-xs text-muted">{l.wa_e164}</p>
            </div>
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-pending-text">
              {t.waited(waitedMin(l))}
            </span>
            <span className="font-mono text-[10.5px] text-faint">
              {t.owner} · {l.am?.name ?? t.unowned}
            </span>
            {!isAdmin && (
              <Button className="px-4 py-1.5 text-xs" disabled={busyId === l.id} onClick={() => void claim(l)}>
                {t.claim}
              </Button>
            )}
            {isAdmin && (
              <select defaultValue="" onChange={e => void reassign(l, e.target.value)}
                className="rounded-lg border border-hair bg-white px-2 py-1.5 text-xs text-ink focus:border-petrol focus:outline-none">
                <option value="" disabled>{t.assign}</option>
                {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </div>
        ))}
      </Card>

      {/* 线索列表 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SectionTitle>{isAdmin ? t.all : t.mine}</SectionTitle>
        <span className="flex-1" />
        <button className={pillCls(pill === 'all')} onClick={() => setPill('all')}>{t.filterAll}</button>
        {(Object.keys(LEAD_STATUS_META) as LeadStatus[]).map(s => (
          <button key={s} className={pillCls(pill === s)} onClick={() => setPill(s)}>
            {LEAD_STATUS_META[s][lang]}
          </button>
        ))}
      </div>
      <Card className="p-0">
        {list.length === 0 && <p className="px-5 py-6 text-sm text-faint">{t.listEmpty}</p>}
        {list.map(l => {
          const meta = LEAD_STATUS_META[l.status]
          const canFlow = l.status !== 'converted'
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair px-5 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                  {l.full_name}
                  {l.assigned_am !== null && l.first_reply_at === null && canFlow && (
                    <span className="rounded-full border border-inactive-border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-inactive-text">
                      {t.noReply}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  <button className="underline-offset-2 hover:underline" title={t.copied}
                    onClick={() => void copyText(`${l.id}:wa`, l.wa_e164)}>
                    {copied === `${l.id}:wa` ? t.copied : l.wa_e164}
                  </button>
                  {l.telegram && <span className="text-faint"> · @{l.telegram}</span>}
                  <span className="text-faint"> · {dateShort(l.created_at)}</span>
                  {isAdmin && <span className="text-faint"> · {t.owner} {l.am?.name ?? t.unowned}</span>}
                </p>
              </div>
              {canFlow ? (
                <select value={l.status} onChange={e => void setStatus(l, e.target.value)}
                  className="rounded-lg border border-hair bg-white px-2 py-1.5 text-xs text-ink focus:border-petrol focus:outline-none">
                  {(['new', 'contacted', 'lost'] as const).map(s => (
                    <option key={s} value={s}>{LEAD_STATUS_META[s][lang]}</option>
                  ))}
                </select>
              ) : (
                <StatusBadge status={meta.s} label={meta[lang]} />
              )}
              {isAdmin && canFlow && (
                <select defaultValue="" onChange={e => void reassign(l, e.target.value)}
                  className="rounded-lg border border-hair bg-white px-2 py-1.5 text-xs text-ink focus:border-petrol focus:outline-none">
                  <option value="" disabled>{t.assign}</option>
                  {ams.filter(a => a.id !== l.assigned_am).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              {canFlow && (
                <Button variant="ghost" className="px-3 py-1.5 text-xs"
                  onClick={() => void copyText(`${l.id}:ref`, `${SITE_URL}/signup?ref=${l.ref_token}`)}>
                  {copied === `${l.id}:ref` ? t.copied : t.copyLink}
                </Button>
              )}
              <Button className="px-3.5 py-1.5 text-xs" disabled={!l.profile_id} onClick={() => void openChat(l)}>
                {t.chat}
              </Button>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
