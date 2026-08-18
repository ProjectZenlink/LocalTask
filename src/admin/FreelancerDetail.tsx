import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PromptDialog } from '../components/dialogs'
import { useAuth } from '../context/AuthContext'
import type { Profile, PoolRow, FreelancerCompany, AccountManager, AccountRecord, BonusGrant, ProfileChangeRequest, AmTransfer } from '../types/database'
import { payoutLabel } from '../types/database'
import { usd, dateShort, dateTimeShort, waLink, tgLink, xLink, signFiles, safeFileName, fileNameFromPath, isImagePath, openSigned, bjDay } from '../lib/format'
import { PP, PP_KEY, pick, K_PAYOUT_PP_EMAIL } from '../lib/brand'
import { PageHeading, Card, Button, Alert, StatusBadge, SectionTitle, Field, Label, Input } from '../components/ui'
import SecretText from '../components/SecretText'
import RiskFlags from '../components/RiskFlags'
import TotpCode from '../components/TotpCode'
import { KV, ConfirmDialog } from './bits'
import { useLang } from './i18n'

interface KycSub {
  id: string
  status: string
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}
type Signed = { path: string; url: string }

const COPY = {
  zh: {
    back: '← 人才库', notFound: '未找到该 freelancer',
    basics: '基本资料', legal: '法定姓名', regEmail: '注册邮箱', dob: '出生日期', addr: '地址', ssn: 'SSN', only4: '仅后四位', joined: '注册',
    workT: '工作邮箱', workEmail: '邮箱地址', workPwd: '邮箱密码', workHint: '由 AM 注册并维护;freelancer 端只读展示。', workSave: '保存', workSaved: '已保存 ✓',
    enhKyc: 'Enhanced KYC', bonusT: '注册奖励', bonusState: '状态', streakT: '签到奖励', streakEmpty: '还没有解锁任何签到奖励。',
    pcrT: '待审的资料修改', pcrOld: '现值', pcrNew: '申请值', pcrApprove: '批准', pcrRejectBtn: '驳回', pcrRejectQ: '驳回备注(可选):',
    trT: '归属转移', trBtn: '转移给同事', trTarget: '目标 AM', trReason: '理由(可选)', trSubmit: '转移（即时生效）', trClose: '取消',
    trPending: '转移申请待 admin 审核', trCancel: '撤回', trHist: '转移记录', trNone: '—',
    ciToday: '今日签到', ciNone: '未签到', ciPending: '确认签到', ciDone: '已复核 ✓',
    sk7: '连续签到 7 天', sk15: '连续签到 15 天', sk30: '连续签到 30 天',
    bLocked: '未解锁(待 Enhanced KYC)', bReady: '可提现(等 freelancer 申请)', bRequested: '已申请提现', bPaid: '已打款',
    bTxRef: '打款凭证号(可选)', bMark: '标记已打款', bMarked: '已记录 ✓', bPaidAt: '打款时间',
    ssnShow: '显示完整', ssnHide: '隐藏',
    contact: '联系方式', wallet: '收款钱包', noWallet: '未设置', riskT: '风险扫描(全库比对)',
    load: '负载', active: '活跃任务', done: '已完成',
    companies: '公司资料', coEmpty: '没有登记的公司。', addCo: '＋ 添加公司',
    coName: '公司名称(必填)', ein: 'EIN', coState: '注册州', coNotes: '备注',
    coDocs: '公司文件(EIN 信函、Certificate of Incorporation 等,可多选追加)',
    coSave: '保存', coSaving: '保存中…', coCancel: '取消', coEdit: '编辑', coDelete: '删除',
    coDeleteQ: '删除这家公司的登记?(已上传的文件不会自动清理)', vCoName: '公司名称必填。',
    viewDocs: '查看文件', hideDocs: '收起', loadingDocs: '加载中…', docsCount: '份文件',
    owner: '归属 AM', ownerNone: '— 未归属 —', rejectedK: '驳回状态', rejectedBadge: '已被驳回', restore: '恢复', recordsT: '账号资料(由归属 AM 维护)', recEmpty: '暂无账号资料。', kyc: 'KYC 材料', kycEmpty: '没有提交记录。', submitted: '提交于', reviewed: '审核于', reason: '驳回原因:',
    viewKyc: '查看材料',
    
   
    pause: '暂停', resume: '恢复', block: '封禁', unblock: '解封', claim: '认领到我名下', boardLink: '清单',
    paused: '已暂停', blocked: '已封禁',
    blockQ: '封禁是给欺诈用的,可靠性问题请用「暂停」。确认永久封禁?', confirmBlock: '确认封禁', dlgCancel: '取消',
  },
  en: {
    back: '← Pool', notFound: 'Freelancer not found',
    basics: 'Basics', legal: 'Legal name', regEmail: 'Account email', dob: 'Date of birth', addr: 'Address', ssn: 'SSN', only4: 'last 4 only', joined: 'Joined',
    workT: 'Work email', workEmail: 'Email address', workPwd: 'Email password', workHint: 'Registered and managed by the AM; read-only on the freelancer side.', workSave: 'Save', workSaved: 'Saved ✓',
    enhKyc: 'Enhanced KYC', bonusT: 'Signup bonus', bonusState: 'State', streakT: 'Streak rewards', streakEmpty: 'No streak rewards unlocked yet.',
    pcrT: 'Pending profile change', pcrOld: 'Current', pcrNew: 'Requested', pcrApprove: 'Approve', pcrRejectBtn: 'Reject', pcrRejectQ: 'Rejection note (optional):',
    trT: 'Ownership transfer', trBtn: 'Transfer to a colleague', trTarget: 'Target AM', trReason: 'Reason (optional)', trSubmit: 'Transfer now', trClose: 'Cancel',
    trPending: 'Transfer pending admin review', trCancel: 'Withdraw', trHist: 'Transfer history', trNone: '—',
    ciToday: "Today's check-in", ciNone: 'Not checked in', ciPending: 'Confirm', ciDone: 'Confirmed ✓',
    sk7: '7-day streak', sk15: '15-day streak', sk30: '30-day streak',
    bLocked: 'Locked (Enhanced KYC pending)', bReady: 'Withdrawable (awaiting request)', bRequested: 'Payout requested', bPaid: 'Paid',
    bTxRef: 'Payment reference (optional)', bMark: 'Mark as paid', bMarked: 'Recorded ✓', bPaidAt: 'Paid at',
    ssnShow: 'Show full', ssnHide: 'Hide',
    contact: 'Contact', wallet: 'Payout wallet', noWallet: 'Not set', riskT: 'Risk scan (whole-DB)',
    load: 'Load', active: 'Active tasks', done: 'Completed',
    companies: 'Companies', coEmpty: 'No companies on file.', addCo: '＋ Add company',
    coName: 'Company name (required)', ein: 'EIN', coState: 'State of incorporation', coNotes: 'Notes',
    coDocs: 'Company documents (EIN letter, Certificate of Incorporation… multiple, appended)',
    coSave: 'Save', coSaving: 'Saving…', coCancel: 'Cancel', coEdit: 'Edit', coDelete: 'Delete',
    coDeleteQ: 'Delete this company record? (Uploaded files are not auto-removed)', vCoName: 'Company name is required.',
    viewDocs: 'View files', hideDocs: 'Hide', loadingDocs: 'Loading…', docsCount: 'file(s)',
    owner: 'Owner AM', ownerNone: '— Unassigned —', rejectedK: 'Rejection', rejectedBadge: 'Rejected', restore: 'Restore', recordsT: 'Account records (maintained by owner AM)', recEmpty: 'No account records.', kyc: 'KYC documents', kycEmpty: 'No submissions.', submitted: 'Submitted', reviewed: 'Reviewed', reason: 'Rejection:',
    viewKyc: 'View documents',
    
   
    pause: 'Pause', resume: 'Resume', block: 'Block', unblock: 'Unblock', claim: 'Claim', boardLink: 'Checklist',
    paused: 'Paused', blocked: 'Blocked',
    blockQ: 'Blocking is for fraud — use Pause for reliability issues. Block permanently?', confirmBlock: 'Block', dlgCancel: 'Cancel',
  },
}

const KYC_BADGE: Record<string, 'verified' | 'pending' | 'unverified'> = {
  verified: 'verified', pending: 'pending', rejected: 'unverified', none: 'unverified',
}

const CO_EMPTY = { company_name: '', ein: '', state: '', notes: '' }

function DocGrid({ files }: { files: Signed[] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {files.map(d => (
        <a key={d.path} href={d.url} target="_blank" rel="noreferrer" className="block"
          onClick={e => { e.preventDefault(); void openSigned('kyc-documents', d.path) }}>
          {isImagePath(d.path) ? (
            <img src={d.url} alt="" className="h-24 w-full rounded-lg border border-hair object-cover" />
          ) : (
            <span className="flex h-24 items-center justify-center rounded-lg border border-hair bg-white px-2 text-center font-mono text-[11px] text-petrol underline underline-offset-2">
              {fileNameFromPath(d.path)}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}

export default function FreelancerDetail({ amScope = null }: { amScope?: AccountManager | null }) {
  const { lang } = useLang()
  const t = COPY[lang]
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [p, setP] = useState<Profile | null>(null)
  const [pool, setPool] = useState<PoolRow | null>(null)
  const [ssnFull, setSsnFull] = useState<string | null>(null)
  const [ssn4, setSsn4] = useState<string | null>(null)
  const [showSsn, setShowSsn] = useState(false)
  const [wEmail, setWEmail] = useState('')
  const [wPwd, setWPwd] = useState('')
  const [wBusy, setWBusy] = useState(false)
  const [wMsg, setWMsg] = useState<string | null>(null)
  const [bTx, setBTx] = useState('')
  const [bBusy, setBBusy] = useState(false)
  const [bMsg, setBMsg] = useState<string | null>(null)
  const [grants, setGrants] = useState<BonusGrant[]>([])
  const [gTx, setGTx] = useState<Record<string, string>>({})
  const [gBusy, setGBusy] = useState<string | null>(null)
  const [ciState, setCiState] = useState<'none' | 'pending' | 'confirmed'>('none')
  const [pcr, setPcr] = useState<ProfileChangeRequest | null>(null)
  const [pcrBusy, setPcrBusy] = useState(false)
  const [pcrRejectOpen, setPcrRejectOpen] = useState(false)
  const [transfers, setTransfers] = useState<AmTransfer[]>([])
  const [amOpts, setAmOpts] = useState<{ id: string; name: string }[]>([])
  const [amMap, setAmMap] = useState<Map<string, string>>(new Map())
  const [trDialog, setTrDialog] = useState(false)
  const [trTo, setTrTo] = useState('')
  const [trReason, setTrReason] = useState('')
  const [trBusy, setTrBusy] = useState(false)
  const [ciBusy, setCiBusy] = useState(false)
  const bjToday = bjDay()

  async function saveWork() {
    if (!p) return
    setWBusy(true); setWMsg(null)
    const { error: e } = await supabase.from('profiles')
      .update({ work_email: wEmail.trim() || null, work_email_password: wPwd.trim() || null })
      .eq('id', p.id)
    setWBusy(false)
    if (e) { setError(e.message); return }
    setWMsg(t.workSaved)
    setTimeout(() => setWMsg(null), 2500)
  }

  async function markPaid() {
    if (!p) return
    setBBusy(true); setBMsg(null)
    const { error: e } = await supabase.from('profiles')
      .update({ signup_bonus_state: 'paid', bonus_tx_ref: bTx.trim() || null, bonus_paid_at: new Date().toISOString() })
      .eq('id', p.id)
    setBBusy(false)
    if (e) { setError(e.message); return }
    setBMsg(t.bMarked)
    await load()
  }

  const amName2 = (aid: string) => amMap.get(aid) ?? aid.slice(0, 6)

  async function decidePcr(approve: boolean, note?: string) {
    if (!pcr) return
    setPcrBusy(true)
    const { error: e } = await supabase.rpc('decide_profile_change', { p_id: pcr.id, p_approve: approve, p_note: note ?? null })
    setPcrBusy(false)
    if (e) { setError(e.message); return }
    await load()
  }

  async function submitTransfer() {
    if (!id || !trTo) return
    setTrBusy(true)
    const { error: e } = await supabase.rpc('am_transfer_direct', { p_freelancer: id, p_to_am: trTo, p_reason: trReason.trim() || null })
    setTrBusy(false)
    if (e) { setError(e.message); setTrDialog(false); return }
    setTrDialog(false); setTrTo(''); setTrReason('')
    await load()
  }

  async function cancelTransfer(tid: string) {
    setTrBusy(true)
    const { error: e } = await supabase.rpc('cancel_am_transfer', { p_id: tid })
    setTrBusy(false)
    if (e) { setError(e.message); return }
    await load()
  }

    async function confirmCi() {
    if (!id) return
    setCiBusy(true)
    const { error: e } = await supabase.rpc('confirm_checkin', { p_user: id, p_day: bjToday })
    setCiBusy(false)
    if (e) { setError(e.message); return }
    await load()
  }

  async function markGrantPaid(gid: string) {
    setGBusy(gid)
    const { error: e } = await supabase.from('bonus_grants')
      .update({ state: 'paid', tx_ref: (gTx[gid] ?? '').trim() || null, paid_at: new Date().toISOString() })
      .eq('id', gid)
    setGBusy(null)
    if (e) { setError(e.message); return }
    await load()
  }
  const [subs, setSubs] = useState<KycSub[]>([])
  const [companies, setCompanies] = useState<FreelancerCompany[]>([])
  const [ams, setAms] = useState<AccountManager[]>([])
  const [records, setRecords] = useState<AccountRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  // 懒加载:KYC / 公司文件都在展开时才批量签名
  const [openSubId, setOpenSubId] = useState<string | null>(null)
  const [subDocs, setSubDocs] = useState<Record<string, Signed[] | 'loading'>>({})
  const [openCoId, setOpenCoId] = useState<string | null>(null)
  const [coDocs, setCoDocs] = useState<Record<string, Signed[] | 'loading'>>({})

  // 公司表单
  const [coEditing, setCoEditing] = useState<'new' | string | null>(null)
  const [coForm, setCoForm] = useState(CO_EMPTY)
  const [coFiles, setCoFiles] = useState<File[]>([])
  const [coBusy, setCoBusy] = useState(false)
  const [coDeleting, setCoDeleting] = useState<FreelancerCompany | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const [pr, po, ss, ks, co, amls, recs] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('freelancer_pool').select('*').eq('id', id).maybeSingle(),
      supabase.from('kyc_ssn').select('ssn_full, ssn_last4').eq('user_id', id).maybeSingle(),
      supabase.from('kyc_submissions').select('id, status, rejection_reason, created_at, reviewed_at')
        .eq('user_id', id).order('created_at', { ascending: false }),
      supabase.from('freelancer_companies').select('*').eq('freelancer_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('account_managers').select('*').order('name'),
      supabase.from('account_records').select('*').eq('freelancer_id', id).order('created_at'),
    ])
    if (pr.error) { setError(pr.error.message); setLoaded(true); return }
    const prof = (pr.data ?? null) as Profile | null
    setP(prof)
    setWEmail(prof?.work_email ?? '')
    setWPwd(prof?.work_email_password ?? '')
    setPool((po.data ?? null) as PoolRow | null)
    const ssnRow = ss.data as { ssn_full: string | null; ssn_last4: string | null } | null
    setSsnFull(ssnRow?.ssn_full ?? null)
    setSsn4(ssnRow?.ssn_last4 ?? null)
    setSubs((ks.data ?? []) as KycSub[])
    const { data: gr } = await supabase.from('bonus_grants').select('*').eq('user_id', id).order('created_at')
    setGrants((gr ?? []) as BonusGrant[])
    const { data: ciRow } = await supabase.from('checkins').select('confirmed_at')
      .eq('user_id', id).eq('day', bjToday).maybeSingle()
    setCiState(!ciRow ? 'none' : (ciRow as { confirmed_at: string | null }).confirmed_at ? 'confirmed' : 'pending')
    const [pc, tr] = await Promise.all([
      supabase.from('profile_change_requests').select('*').eq('user_id', id).eq('status', 'pending').maybeSingle(),
      supabase.from('am_transfers').select('*').eq('freelancer_id', id).order('created_at', { ascending: false }).limit(5),
    ])
    setPcr((pc.data ?? null) as ProfileChangeRequest | null)
    setTransfers((tr.data ?? []) as AmTransfer[])
    const { data: allAms } = await supabase.from('account_managers').select('id, name')
    setAmMap(new Map(((allAms ?? []) as { id: string; name: string }[]).map(a => [a.id, a.name])))
    if (amScope) {
      const { data: opts } = await supabase.from('account_managers').select('id, name')
        .eq('is_active', true).neq('id', amScope.id).order('name')
      setAmOpts((opts ?? []) as { id: string; name: string }[])
    }
    setCompanies((co.data ?? []) as FreelancerCompany[])
    setAms((amls.data ?? []) as AccountManager[])
    setRecords((recs.data ?? []) as AccountRecord[])
    setLoaded(true)
  }, [id])

  useEffect(() => { void load() }, [load])

  async function toggleSub(subId: string) {
    if (openSubId === subId) { setOpenSubId(null); return }
    setOpenSubId(subId)
    if (subDocs[subId]) return
    setSubDocs(prev => ({ ...prev, [subId]: 'loading' }))
    const { data: dd } = await supabase.from('kyc_documents')
      .select('storage_path').eq('submission_id', subId)
    const signed = await signFiles('kyc-documents', (dd ?? []).map(r => r.storage_path))
    setSubDocs(prev => ({ ...prev, [subId]: signed }))
  }

  async function toggleCo(c: FreelancerCompany) {
    if (openCoId === c.id) { setOpenCoId(null); return }
    setOpenCoId(c.id)
    if (coDocs[c.id]) return
    setCoDocs(prev => ({ ...prev, [c.id]: 'loading' }))
    const signed = await signFiles('kyc-documents', c.doc_paths)
    setCoDocs(prev => ({ ...prev, [c.id]: signed }))
  }

  function startCoEdit(c: FreelancerCompany | null) {
    setError(null); setCoFiles([])
    if (!c) { setCoEditing('new'); setCoForm(CO_EMPTY); return }
    setCoEditing(c.id)
    setCoForm({ company_name: c.company_name, ein: c.ein ?? '', state: c.state ?? '', notes: c.notes ?? '' })
  }

  async function saveCo() {
    if (!id) return
    if (!coForm.company_name.trim()) { setError(t.vCoName); return }
    setCoBusy(true); setError(null)
    try {
      const payload = {
        company_name: coForm.company_name.trim(),
        ein: coForm.ein.trim() || null,
        state: coForm.state.trim() || null,
        notes: coForm.notes.trim() || null,
      }
      let coId: string
      let existingPaths: string[] = []
      if (coEditing === 'new') {
        const { data, error: e } = await supabase.from('freelancer_companies')
          .insert({ ...payload, freelancer_id: id, created_by: user?.id ?? null })
          .select('id').single()
        if (e) throw new Error(e.message)
        coId = data.id
      } else {
        coId = coEditing!
        existingPaths = companies.find(c => c.id === coId)?.doc_paths ?? []
        const { error: e } = await supabase.from('freelancer_companies').update(payload).eq('id', coId)
        if (e) throw new Error(e.message)
      }
      if (coFiles.length > 0) {
        const added: string[] = []
        for (const f of coFiles) {
          const path = `companies/${coId}/${Date.now()}-${safeFileName(f.name)}`
          const { error: upErr } = await supabase.storage.from('kyc-documents').upload(path, f)
          if (upErr) throw new Error(`[upload ${f.name}] ${upErr.message}`)
          added.push(path)
        }
        const { error: e2 } = await supabase.from('freelancer_companies')
          .update({ doc_paths: [...existingPaths, ...added] }).eq('id', coId)
        if (e2) throw new Error(e2.message)
        setCoDocs(prev => { const n = { ...prev }; delete n[coId]; return n })
      }
      setCoEditing(null); setCoForm(CO_EMPTY); setCoFiles([])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : JSON.stringify(e))
    } finally {
      setCoBusy(false)
    }
  }

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

  const coFormCard = (
    <div className="mt-3 rounded-xl border border-petrol/25 bg-paper p-4">
      <Field label={t.coName} value={coForm.company_name} onChange={e => setCoForm({ ...coForm, company_name: e.target.value })} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={t.ein} value={coForm.ein} onChange={e => setCoForm({ ...coForm, ein: e.target.value })} placeholder="12-3456789" />
        <Field label={t.coState} value={coForm.state} onChange={e => setCoForm({ ...coForm, state: e.target.value })} placeholder="DE" />
      </div>
      <Field label={t.coNotes} value={coForm.notes} onChange={e => setCoForm({ ...coForm, notes: e.target.value })} />
      <div className="mb-4">
        <Label>{t.coDocs}</Label>
        <input type="file" multiple onChange={e => setCoFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-hair file:bg-white file:px-3 file:py-2 file:font-display file:text-sm file:text-ink hover:file:bg-paper" />
        {coFiles.length > 0 && <p className="mt-1.5 font-mono text-xs text-verified-text">{coFiles.map(f => f.name).join(' · ')}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={saveCo} disabled={coBusy}>{coBusy ? t.coSaving : t.coSave}</Button>
        <Button variant="ghost" onClick={() => { setCoEditing(null); setCoForm(CO_EMPTY); setCoFiles([]) }}>{t.coCancel}</Button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={amScope ? '/am/pool' : '/admin/pool'} className="mb-3 inline-block font-mono text-[11px] uppercase tracking-wider text-faint transition hover:text-ink">{t.back}</Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{name}</h1>
          <StatusBadge status={KYC_BADGE[p.kyc_status]} label={p.kyc_status} />
          {p.is_banned && <StatusBadge status="unverified" label={t.blocked} />}
          {p.is_suspended && !p.is_banned && <StatusBadge status="pending" label={t.paused} />}
        </div>
        <div className="flex gap-2">
          {amScope && p.managed_by === amScope.id && (
            <Link to={`/am/f/${p.id}`}>
              <Button variant="ghost" className="px-3 py-1.5 text-xs">{t.boardLink}</Button>
            </Link>
          )}
          {(!amScope || p.managed_by === amScope.id) && (
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => {
              if (amScope) {
                void (async () => {
                  const { error: er } = p.is_suspended
                    ? await supabase.rpc('am_set_suspended', { p_freelancer: p.id, p_suspend: false })
                    : await supabase.rpc('am_set_suspended', { p_freelancer: p.id, p_suspend: true, p_reason: null })
                  if (er) { setError(er.message); return }
                  await load()
                })()
              } else {
                void setFlags({ is_suspended: !p.is_suspended })
              }
            }}>
              {p.is_suspended ? t.resume : t.pause}
            </Button>
          )}
          {!amScope && (
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => {
              if (p.is_banned) { void setFlags({ is_banned: false }); return }
              setAsking(true)
            }}>
              {p.is_banned ? t.unblock : t.block}
            </Button>
          )}
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="mb-5 p-5">
        <SectionTitle>{t.basics}</SectionTitle>
        <KV k={t.legal}>{p.full_name ?? '—'}</KV>
        <KV k={t.dob}>{p.date_of_birth ?? '—'}</KV>
        <KV k={t.addr}>{addrLine}</KV>
        <KV k={t.ssn}>
          <span className="inline-flex items-center gap-3">
            <span className="font-mono">{showSsn && ssnFull ? ssnFull : `••••${ssn4 ?? '????'}`}</span>
            {!ssnFull && ssn4 && <span className="font-mono text-[11px] uppercase tracking-wider text-faint">({t.only4})</span>}
            {ssnFull && (
              <button onClick={() => setShowSsn(v => !v)}
                className="font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover">
                {showSsn ? t.ssnHide : t.ssnShow}
              </button>
            )}
          </span>
        </KV>
        <KV k={t.regEmail}><span className="break-all font-mono text-xs">{p.email ?? '—'}</span></KV>
        <KV k={t.enhKyc}>
          <StatusBadge status={p.enhanced_kyc_status === 'verified' ? 'verified' : p.enhanced_kyc_status === 'pending' ? 'pending' : 'unverified'} label={p.enhanced_kyc_status} />
        </KV>
        <KV k={t.joined}>{dateShort(p.created_at)}</KV>
        <KV k={t.owner}>
          {amScope ? (
            <span className="inline-flex items-center gap-3">
              <span className={p.managed_by === amScope.id ? 'text-verified-text' : undefined}>
                {p.managed_by ? (ams.find(a => a.id === p.managed_by)?.name ?? '…') : t.ownerNone}
              </span>
              {p.managed_by === null && !p.is_rejected && !p.is_banned && (
                <button
                  onClick={() => void (async () => {
                    const { error: er } = await supabase.rpc('claim_freelancer', { p_freelancer: p.id })
                    if (er) { setError(er.message); return }
                    await load()
                  })()}
                  className="font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover"
                >
                  {t.claim}
                </button>
              )}
            </span>
          ) : (
            <select
              value={p.managed_by ?? ''}
              onChange={e => {
                const v = e.target.value || null
                void (async () => {
                  const { error: er } = await supabase.from('profiles').update({ managed_by: v }).eq('id', p.id)
                  if (er) { setError(er.message); return }
                  await load()
                })()
              }}
              className="rounded-lg border border-hair bg-white px-2.5 py-1.5 text-sm text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/20"
            >
              <option value="">{t.ownerNone}</option>
              {ams.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </KV>
        {p.is_rejected && (
          <KV k={t.rejectedK}>
            <span className="inline-flex items-center gap-3">
              <StatusBadge status="unverified" label={t.rejectedBadge} />
              {p.rejected_reason && <span className="text-sm text-muted">{p.rejected_reason}</span>}
              {!amScope && (
                <button
                  onClick={() => void (async () => {
                    const { error: er } = await supabase.from('profiles')
                      .update({ is_rejected: false, rejected_reason: null }).eq('id', p.id)
                    if (er) { setError(er.message); return }
                    await load()
                  })()}
                  className="font-mono text-[11px] uppercase tracking-wider text-petrol transition hover:text-petrol-hover"
                >
                  {t.restore}
                </button>
              )}
            </span>
          </KV>
        )}
      </Card>

      {/* 待审的资料修改(m25):名下 AM / admin 可裁决 */}
      {pcr && (
        <Card className="mb-5 border-pending-border p-5">
          <SectionTitle>{t.pcrT}</SectionTitle>
          <div className="space-y-2 font-mono text-xs">
            {pcr.new_full_name && (
              <p><span className="text-faint">{t.legal}:</span> <span className="text-muted line-through">{p.full_name}</span> → <span className="text-ink">{pcr.new_full_name}</span></p>
            )}
            {(pcr.new_address || pcr.new_city || pcr.new_state || pcr.new_zip) && (
              <p><span className="text-faint">{t.pcrNew}:</span> <span className="text-ink">{[pcr.new_address ?? p.address, pcr.new_city ?? p.city, pcr.new_state ?? p.state, pcr.new_zip ?? p.address_zip].filter(Boolean).join(', ')}</span>
                 <span className="ml-2 text-faint">({t.pcrOld}: {[p.address, p.city, p.state, p.address_zip].filter(Boolean).join(', ') || '—'})</span></p>
            )}
          </div>
          {(!amScope || p.managed_by === amScope.id) && (
            <div className="mt-3.5 flex gap-2.5">
              <Button className="px-3.5 py-1.5 text-xs" disabled={pcrBusy} onClick={() => void decidePcr(true)}>{pcrBusy ? '…' : t.pcrApprove}</Button>
              <Button variant="ghost" className="px-3.5 py-1.5 text-xs" disabled={pcrBusy} onClick={() => setPcrRejectOpen(true)}>{t.pcrRejectBtn}</Button>
            </div>
          )}
        </Card>
      )}

      {/* 归属转移(m25→v85 直转):AM 选定同事即刻生效,免 admin 审;历史与存量待审留痕 */}
      {(amScope && p.managed_by === amScope.id) || transfers.length > 0 ? (
        <Card className="mb-5 p-5">
          <SectionTitle>{t.trT}</SectionTitle>
          {transfers.some(x => x.status === 'pending') ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-pending-border bg-pending-bg px-3.5 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-pending-text">{t.trPending}</span>
              {amScope && transfers.find(x => x.status === 'pending')!.from_am === amScope.id && (
                <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={trBusy}
                  onClick={() => void cancelTransfer(transfers.find(x => x.status === 'pending')!.id)}>{t.trCancel}</Button>
              )}
            </div>
          ) : amScope && p.managed_by === amScope.id ? (
            <Button variant="ghost" className="mb-3 px-3.5 py-1.5 text-xs" onClick={() => setTrDialog(true)}>{t.trBtn}</Button>
          ) : null}
          {transfers.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.trHist}</p>
              {transfers.map(x => (
                <p key={x.id} className="font-mono text-xs text-muted">
                  {dateShort(x.created_at)} · {amName2(x.from_am)} → {amName2(x.to_am)} · <span className="uppercase">{x.status}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Card className="mb-5 p-5">
        <SectionTitle>{t.workT}</SectionTitle>
        <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Label>{t.workEmail}</Label><Input value={wEmail} onChange={e => setWEmail(e.target.value)} placeholder="name@gmail.com" className="font-mono" /></div>
          <div><Label>{t.workPwd}</Label><Input value={wPwd} onChange={e => setWPwd(e.target.value)} className="font-mono" /></div>
        </div>
        <div className="flex items-center gap-3">
          <Button className="px-4 py-2 text-xs" disabled={wBusy} onClick={saveWork}>{wBusy ? '…' : t.workSave}</Button>
          {wMsg && <span className="font-mono text-[11px] uppercase tracking-wider text-verified-text">{wMsg}</span>}
        </div>
        <p className="mt-2 text-xs text-faint">{t.workHint}</p>
      </Card>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.bonusT}</SectionTitle>
        <KV k="USD">{usd(p.signup_bonus_usd ?? 2.99)}</KV>
        <KV k={t.bonusState}>
          {p.signup_bonus_state === 'paid' ? t.bPaid
            : p.signup_bonus_state === 'requested' ? t.bRequested
            : p.enhanced_kyc_status === 'verified' ? t.bReady : t.bLocked}
        </KV>
        {p.signup_bonus_state === 'paid' && (
          <>
            {p.bonus_tx_ref && <KV k={t.bTxRef}><span className="font-mono text-xs">{p.bonus_tx_ref}</span></KV>}
            {p.bonus_paid_at && <KV k={t.bPaidAt}>{dateShort(p.bonus_paid_at)}</KV>}
          </>
        )}
        {p.signup_bonus_state === 'requested' && (
          <div className="mt-3 border-t border-hair pt-3">
            <div className="mb-3"><Label>{t.bTxRef}</Label><Input value={bTx} onChange={e => setBTx(e.target.value)} className="font-mono" placeholder="PP-… / TXID" /></div>
            <div className="flex items-center gap-3">
              <Button className="px-4 py-2 text-xs" disabled={bBusy} onClick={markPaid}>{bBusy ? '…' : t.bMark}</Button>
              {bMsg && <span className="font-mono text-[11px] uppercase tracking-wider text-verified-text">{bMsg}</span>}
            </div>
          </div>
        )}
      </Card>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.streakT}</SectionTitle>
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-hair bg-paper px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.ciToday}</span>
          {ciState === 'confirmed' ? (
            <span className="font-mono text-[11px] uppercase tracking-wider text-verified-text">{t.ciDone}</span>
          ) : ciState === 'pending' ? (
            <Button className="px-3 py-1.5 text-xs" disabled={ciBusy} onClick={() => void confirmCi()}>{ciBusy ? '…' : t.ciPending}</Button>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-wider text-faint">{t.ciNone}</span>
          )}
        </div>
        {grants.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.streakEmpty}</p>
        ) : grants.map(g => (
          <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair py-3 last:border-b-0">
            <div>
              <p className="text-sm text-ink">{g.kind === 'streak_7' ? t.sk7 : g.kind === 'streak_15' ? t.sk15 : t.sk30} · <span className="font-display font-medium">{usd(g.amount)}</span></p>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-faint">
                {g.state === 'paid' ? `${t.bPaid}${g.tx_ref ? ` · ${g.tx_ref}` : ''}` : g.state === 'requested' ? t.bRequested : t.bLocked}
              </p>
            </div>
            {g.state === 'requested' && (
              <div className="flex shrink-0 items-center gap-2">
                <Input value={gTx[g.id] ?? ''} onChange={e => setGTx(prev => ({ ...prev, [g.id]: e.target.value }))}
                  className="w-44 font-mono text-xs" placeholder="PP-… / TXID" />
                <Button className="px-3 py-1.5 text-xs" disabled={gBusy === g.id} onClick={() => void markGrantPaid(g.id)}>
                  {gBusy === g.id ? '…' : t.bMark}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.riskT}</SectionTitle>
        <RiskFlags userId={p.id} lang={lang} linkBase={amScope ? '/am/pool' : '/admin/pool'} />
      </Card>

      {/* 公司资料 */}
      <Card className="mb-5 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>{t.companies}</SectionTitle>
          {coEditing === null && (
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => startCoEdit(null)}>{t.addCo}</Button>
          )}
        </div>
        {coEditing === 'new' && coFormCard}
        {companies.length === 0 && coEditing !== 'new' ? (
          <p className="py-1 text-sm text-faint">{t.coEmpty}</p>
        ) : companies.map(c => (
          <div key={c.id} className="border-b border-hair py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{c.company_name}</p>
                <p className="mt-0.5 font-mono text-xs text-faint">
                  {c.ein && <>EIN {c.ein}</>}
                  {c.ein && c.state && ' · '}
                  {c.state}
                  {(c.ein || c.state) && ' · '}
                  {c.doc_paths.length} {t.docsCount}
                </p>
                {c.notes && <p className="mt-0.5 text-xs text-muted">{c.notes}</p>}
              </div>
              <div className="flex gap-2">
                {c.doc_paths.length > 0 && (
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void toggleCo(c)}>
                    {openCoId === c.id ? t.hideDocs : t.viewDocs}
                  </Button>
                )}
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => startCoEdit(c)}>{t.coEdit}</Button>
                <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setCoDeleting(c)}>{t.coDelete}</Button>
              </div>
            </div>
            {openCoId === c.id && (
              coDocs[c.id] === 'loading'
                ? <p className="mt-3 text-sm text-faint">{t.loadingDocs}</p>
                : <DocGrid files={(coDocs[c.id] as Signed[]) ?? []} />
            )}
            {coEditing === c.id && coFormCard}
          </div>
        ))}
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
            {p.payout_method === PP_KEY && pick(p, K_PAYOUT_PP_EMAIL) ? (
              <>
                <p className="font-mono text-xs text-ink">{PP}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted">{pick(p, K_PAYOUT_PP_EMAIL)}</p>
              </>
            ) : p.payout_address && p.payout_network && p.payout_token ? (
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
        </Card>
      </div>

      {/* KYC 材料:默认折叠,展开时才批量签名加载 */}
      <Card className="mb-5 p-5">
        <SectionTitle>{t.kyc}</SectionTitle>
        {subs.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.kycEmpty}</p>
        ) : subs.map(s => (
          <div key={s.id} className="border-b border-hair py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs text-muted">
                {t.submitted} {dateTimeShort(s.created_at)} · {s.status}
                {s.reviewed_at && <> · {t.reviewed} {dateShort(s.reviewed_at)}</>}
              </p>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => void toggleSub(s.id)}>
                {openSubId === s.id ? t.hideDocs : t.viewKyc}
              </Button>
            </div>
            {s.rejection_reason && <p className="mt-1 text-sm text-danger-text">{t.reason} {s.rejection_reason}</p>}
            {openSubId === s.id && (
              subDocs[s.id] === 'loading' || !subDocs[s.id]
                ? <p className="mt-3 text-sm text-faint">{t.loadingDocs}</p>
                : <DocGrid files={subDocs[s.id] as Signed[]} />
            )}
          </div>
        ))}
      </Card>

      <Card className="mb-5 p-5">
        <SectionTitle>{t.recordsT}</SectionTitle>
        {records.length === 0 ? (
          <p className="py-1 text-sm text-faint">{t.recEmpty}</p>
        ) : records.map(r => (
          <div key={r.id} className="border-b border-hair py-2.5 text-xs last:border-b-0">
            <p>
              <span className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">{r.task_type}</span>
              <span className="ml-2 font-mono text-ink">{r.account_login ?? '—'}</span>
              {r.account_password && <span className="ml-3"><SecretText value={r.account_password} /></span>}
              {r.twofa && <span className="ml-3 text-faint">2FA <SecretText value={r.twofa} /> <TotpCode secret={r.twofa} /></span>}
              <span className={`ml-3 font-mono text-[10px] uppercase tracking-wider ${(r.status ?? 'active') === 'active' ? 'text-verified-text' : (r.status ?? 'active') === 'review' ? 'text-pending-text' : 'text-danger-text'}`}>
                {(r.status ?? 'active') === 'active' ? '正常' : (r.status ?? 'active') === 'review' ? '审核中' : '已关闭'}
              </span>
            </p>
            <p className="mt-1 font-mono text-faint">
              {r.phone_number ?? '—'}
              {r.sms_link && <> · <a href={r.sms_link} target="_blank" rel="noreferrer" className="text-petrol underline underline-offset-2">SMS</a></>}
              {r.phone_expires_on && <> · {r.phone_expires_on}</>}
            </p>
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
      <ConfirmDialog
        open={coDeleting !== null}
        title={t.coDelete}
        hint={t.coDeleteQ}
        confirmLabel={t.coDelete}
        cancelLabel={t.dlgCancel}
        onConfirm={() => {
          const c = coDeleting; setCoDeleting(null)
          if (!c) return
          void (async () => {
            const { error: e } = await supabase.from('freelancer_companies').delete().eq('id', c.id)
            if (e) { setError(e.message); return }
            await load()
          })()
        }}
        onClose={() => setCoDeleting(null)}
      />

      <PromptDialog
        open={pcrRejectOpen}
        title={t.pcrRejectBtn}
        hint={t.pcrRejectQ}
        confirmLabel={t.pcrRejectBtn}
        cancelLabel={t.trClose}
        danger
        onConfirm={note => { setPcrRejectOpen(false); void decidePcr(false, note) }}
        onClose={() => setPcrRejectOpen(false)}
      />

      {trDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={() => setTrDialog(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-hair bg-white p-6 shadow-sm" onClick={e => e.stopPropagation()}>
            <SectionTitle>{t.trBtn}</SectionTitle>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-faint">{t.trTarget}</label>
            <select value={trTo} onChange={e => setTrTo(e.target.value)}
              className="mb-4 w-full rounded-xl border border-hair bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-petrol">
              <option value="">—</option>
              {amOpts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-faint">{t.trReason}</label>
            <Input value={trReason} onChange={e => setTrReason(e.target.value)} className="mb-4" />
            <div className="flex gap-2.5">
              <Button className="flex-1" disabled={trBusy || !trTo} onClick={() => void submitTransfer()}>{trBusy ? '…' : t.trSubmit}</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setTrDialog(false)}>{t.trClose}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
