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

type Row = Lead & { am: { id: string; name: string } | null } & { source: 'join' | 'whatsapp' | 'signup'; email: string | null; converted_profile: string | null; prof: { display_name: string | null; contact_whatsapp: string | null; email: string | null } | null }

const COPY = {
  zh: {
    title: '线索', sub: '公开引导页(/join)进来的访客:认领、沟通、发注册链接、转化。',
    pool: '线索认领池', poolHint: `新线索 ${LEAD_CLAIM_MINUTES} 分钟未获首次回复即进入认领池,先到先得。`,
    poolEmpty: '暂无可认领线索。', mine: '我的线索', all: '全部线索', listEmpty: '还没有线索。',
    claim: '认领', chat: '对话', copyLink: '注册链接', copied: '已复制',
    filterAll: '全部', noReply: '未回', owner: '归属', unowned: '无归属',
    srcAll: '全部来源', srcJoin: 'Join', srcWa: 'WhatsApp', srcSignup: '注册', pendingReg: '待注册',
    invite: '生成 WhatsApp 邀请', inviteTitle: 'WhatsApp 邀请',
    invNote: '客户备注(1–60 字,如:老王·广告A)', invCreate: '生成', invBusy: '生成中…',
    invDone: '邀请已生成 —— 把这个注册链接发给客户:', invCopy: '复制链接', invClose: '完成',
    destroy: '销毁', destroyTitle: '销毁邀请',
    destroyAsk: '未转化的邀请删除后不可恢复。确定销毁与这位客户的邀请吗?',
    destroyCancel: '取消', destroyGo: '确认销毁',
    searchPh: '搜索名字 / WhatsApp / 邮箱…',
    waited: (m: number) => `等待 ${m} 分钟`, assign: '改派给…',
    copyManual: '复制失败,请手动复制:',
  },
  en: {
    title: 'Leads', sub: 'Visitors from the public Join page: claim, chat, send signup links, convert.',
    pool: 'Claim pool', poolHint: `New leads with no first reply within ${LEAD_CLAIM_MINUTES} minutes land here — first come, first served.`,
    poolEmpty: 'Nothing to claim right now.', mine: 'My leads', all: 'All leads', listEmpty: 'No leads yet.',
    claim: 'Claim', chat: 'Chat', copyLink: 'Signup link', copied: 'Copied',
    filterAll: 'All', noReply: 'No reply', owner: 'Owner', unowned: 'Unassigned',
    srcAll: 'All sources', srcJoin: 'Join', srcWa: 'WhatsApp', srcSignup: 'Signup', pendingReg: 'Awaiting signup',
    invite: 'New WhatsApp invite', inviteTitle: 'WhatsApp invite',
    invNote: 'Customer note (1–60 chars, e.g. Wang · Ad A)', invCreate: 'Generate', invBusy: 'Generating…',
    invDone: 'Invite created — send this signup link to the customer:', invCopy: 'Copy link', invClose: 'Done',
    destroy: 'Destroy', destroyTitle: 'Destroy invite',
    destroyAsk: 'Unconverted invites are gone for good. Destroy the invite for this customer?',
    destroyCancel: 'Cancel', destroyGo: 'Destroy',
    searchPh: 'Search name / WhatsApp / email…',
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
  const [srcPill, setSrcPill] = useState<'all' | 'join' | 'whatsapp' | 'signup'>('all')
  const [q, setQ] = useState('')
  const [inv, setInv] = useState(false)
  const [invNote, setInvNote] = useState('')
  const [invBusy, setInvBusy] = useState(false)
  const [invLink, setInvLink] = useState<string | null>(null)
  const [destroyTarget, setDestroyTarget] = useState<Row | null>(null)

  const load = useCallback(async () => {
    const q = supabase.from('leads')
      .select('*, am:account_managers!assigned_am(id, name), prof:profiles!leads_converted_profile_fkey(display_name, contact_whatsapp, email)')
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
  const personOf = (l: Row) => {
    const converted = l.status === 'converted'
    return {
      name: converted ? (l.prof?.display_name ?? l.full_name) : l.full_name,
      wa: converted ? (l.prof?.contact_whatsapp ?? l.wa_e164) : l.wa_e164,
      email: l.email ?? (converted ? (l.prof?.email ?? null) : null),
    }
  }
  const list = (isAdmin ? rows : rows.filter(l => l.assigned_am === amId))
    .filter(l => pill === 'all' || l.status === pill)
    .filter(l => srcPill === 'all' || l.source === srcPill)
    .filter(l => {
      const k = q.trim().toLowerCase()
      if (!k) return true
      const p = personOf(l)
      return (p.name ?? '').toLowerCase().includes(k)
          || (p.wa ?? '').toLowerCase().includes(k)
          || (p.email ?? '').toLowerCase().includes(k)
    })

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

  async function openChat(target: string) {
    setError(null)
    const { error: e } = await supabase.rpc('open_conversation', { p_other: target })
    if (e) { setError(e.message); return }
    // v75 ②:AM 可选小窗/整页;admin 恒整页
    const chatMode = localStorage.getItem('lt_chat_open') === 'dock' ? 'dock' : 'page'
    if (!isAdmin && chatMode === 'dock') {
      window.dispatchEvent(new CustomEvent('lt-open-dock', { detail: { with: target } }))
      return
    }
    navigate(`${isAdmin ? '/admin' : '/am'}/messages?with=${target}`)
  }

  async function createInvite() {
    const note = invNote.trim()
    if (!note || invBusy) return
    setInvBusy(true); setError(null)
    const { data, error: e } = await supabase.rpc('am_create_invite', { p_note: note })
    setInvBusy(false)
    if (e) { setError(e.message); return }
    const tok = (data as { ref_token?: string } | null)?.ref_token
    if (tok) setInvLink(`${SITE_URL}/signup?ref=${tok}`)
    setInvNote(''); pingWorkline(); await load()
  }

  async function destroyInvite(l: Row) {
    setError(null)
    const { error: e } = await supabase.rpc('am_destroy_invite', { p_lead: l.id })
    if (e) { setError(e.message); return }
    setDestroyTarget(null)
    pingWorkline(); await load()
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
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.searchPh}
          className="w-full max-w-xs rounded-xl border border-hair bg-white px-3 py-1.5 text-sm outline-none focus:border-petrol" />
        <span className="mx-1 hidden h-4 w-px bg-hair sm:block" />
        {(['all', 'join', 'whatsapp', 'signup'] as const).map(k => (
          <button key={k} className={pillCls(srcPill === k)} onClick={() => setSrcPill(k)}>
            {k === 'all' ? t.srcAll : k === 'join' ? t.srcJoin : k === 'whatsapp' ? t.srcWa : t.srcSignup}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-hair sm:block" />
                <button className={pillCls(pill === 'all')} onClick={() => setPill('all')}>{t.filterAll}</button>
        {(Object.keys(LEAD_STATUS_META) as LeadStatus[]).map(s => (
          <button key={s} className={pillCls(pill === s)} onClick={() => setPill(s)}>
            {LEAD_STATUS_META[s][lang]}
          </button>
        ))}
        {!isAdmin && (
          <Button className="px-3.5 py-1.5 text-xs" onClick={() => { setInvLink(null); setInvNote(''); setInv(true) }}>
            {t.invite}
          </Button>
        )}
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
                  {personOf(l).name}
                  <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    l.source === 'whatsapp' ? 'border-petrol/40 text-petrol'
                      : l.source === 'signup' ? 'border-verified-border text-verified-text'
                      : 'border-hair text-faint'
                  }`}>{l.source === 'whatsapp' ? t.srcWa : l.source === 'signup' ? t.srcSignup : t.srcJoin}</span>
                  {l.source === 'whatsapp' && !l.converted_profile && canFlow && (
                    <span className="rounded-full border border-inactive-border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-inactive-text">
                      {t.pendingReg}
                    </span>
                  )}
                  {l.assigned_am !== null && l.first_reply_at === null && canFlow && (
                    <span className="rounded-full border border-inactive-border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-inactive-text">
                      {t.noReply}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {personOf(l).wa ? (
                    <button className="underline-offset-2 hover:underline" title={t.copied}
                      onClick={() => void copyText(`${l.id}:wa`, personOf(l).wa as string)}>
                      {copied === `${l.id}:wa` ? t.copied : personOf(l).wa}
                    </button>
                  ) : <span className="text-faint">—</span>}
                  {personOf(l).email && <span className="text-faint"> · {personOf(l).email}</span>}
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
              {l.source === 'whatsapp' && canFlow && (
                <Button variant="ghost" className="border-danger-border px-3 py-1.5 text-xs text-danger-text"
                  onClick={() => setDestroyTarget(l)}>
                  {t.destroy}
                </Button>
              )}
              <Button className="px-3.5 py-1.5 text-xs" disabled={!(l.converted_profile ?? l.profile_id)}
                onClick={() => { const id = l.converted_profile ?? l.profile_id; if (id) void openChat(id) }}>
                {t.chat}
              </Button>
            </div>
          )
        })}
      </Card>

      {destroyTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={() => setDestroyTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-sm" onClick={e => e.stopPropagation()}>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-danger-text">{t.destroyTitle}</p>
            <p className="mb-1 text-sm font-medium text-ink">{personOf(destroyTarget).name}</p>
            <p className="mb-4 text-sm leading-relaxed text-muted">{t.destroyAsk}</p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setDestroyTarget(null)}>{t.destroyCancel}</Button>
              <Button variant="ghost" className="flex-1 border-danger-border text-danger-text hover:bg-white"
                onClick={() => void destroyInvite(destroyTarget)}>
                {t.destroyGo}
              </Button>
            </div>
          </div>
        </div>
      )}

      {inv && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={() => setInv(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-sm" onClick={e => e.stopPropagation()}>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">{t.inviteTitle}</p>
            {invLink ? (
              <>
                <p className="mb-2 text-sm leading-relaxed text-ink">{t.invDone}</p>
                <p className="mb-3 break-all rounded-xl border border-hair bg-paper/60 px-3 py-2 font-mono text-xs text-ink">{invLink}</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void copyText('inv:new', invLink)}>
                    {copied === 'inv:new' ? t.copied : t.invCopy}
                  </Button>
                  <Button variant="ghost" onClick={() => setInv(false)}>{t.invClose}</Button>
                </div>
              </>
            ) : (
              <>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-faint">{t.invNote}</label>
                <input value={invNote} onChange={e => setInvNote(e.target.value)} maxLength={60}
                  className="mb-3 w-full rounded-xl border border-hair bg-white px-3 py-2 text-sm outline-none focus:border-petrol" />
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={invBusy || !invNote.trim()} onClick={() => void createInvite()}>
                    {invBusy ? t.invBusy : t.invCreate}
                  </Button>
                  <Button variant="ghost" onClick={() => setInv(false)}>{t.invClose}</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
